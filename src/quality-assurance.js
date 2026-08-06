import {
  calculateQualityDashboard,
  validateClinicalObservation,
  validateCommunicationProfile,
  validateFeedbackCase,
  validateGovernanceRecord,
  validateQualityAction,
} from './commercial-readiness.js';

const clean = (value, maximum = 10_000) => String(value ?? '').trim().slice(0, maximum);
const bool = value => [true, 1, '1', 'true', 'on'].includes(value);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const error = (code, message, status = 400, details) => json({ error: { code, message, ...(details ? { details } : {}) } }, status);

async function readObject(request, maximum = 128_000) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximum) throw new Error('Request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximum) throw new Error('Request is too large.');
  const value = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a valid record.');
  return value;
}

function branchClause(scope, alias = '') {
  return scope?.restricted ? ` AND ${alias ? `${alias}.` : ''}branch_id=?` : '';
}

function branchBindings(scope) {
  return scope?.restricted ? [scope.branchId] : [];
}

async function clientInScope(db, session, clientId, scope) {
  return db.prepare(`SELECT id,branch_id,first_name,last_name,preferred_name,allergies,communication_needs FROM clients WHERE id=? AND organisation_id=?${branchClause(scope)} AND archived_at IS NULL LIMIT 1`)
    .bind(clientId, session.organisation_id, ...branchBindings(scope)).first();
}

async function userInScope(db, session, userId, scope) {
  if (!userId) return null;
  return db.prepare(`SELECT id FROM users WHERE id=? AND organisation_id=? AND status='active'${scope?.restricted ? ' AND (home_branch_id=? OR home_branch_id IS NULL)' : ''} LIMIT 1`)
    .bind(userId, session.organisation_id, ...branchBindings(scope)).first();
}

function audit(statements, makeAudit, session, action, entityType, entityId, detail = {}) {
  const statement = makeAudit?.(session.organisation_id, session.user_id, action, entityType, entityId, detail);
  if (statement) statements.push(statement);
}

function feedbackReference() {
  return `FB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function auditReference() {
  return `QA-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function qualityDashboard(db, session, scope = {}) {
  const org = session.organisation_id;
  const [feedback, audits, actions, governance, observations, clients, users] = await Promise.all([
    db.prepare(`SELECT f.*,c.first_name||' '||c.last_name client_name,u.display_name owner_name FROM service_feedback_cases f LEFT JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id LEFT JOIN users u ON u.id=f.owner_user_id AND u.organisation_id=f.organisation_id WHERE f.organisation_id=?${branchClause(scope, 'f')} ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 WHEN 'investigating' THEN 2 ELSE 3 END,datetime(f.response_due_at) LIMIT 300`).bind(org, ...branchBindings(scope)).all(),
    db.prepare(`SELECT q.*,u.display_name owner_name FROM quality_audits q LEFT JOIN users u ON u.id=q.owner_user_id AND u.organisation_id=q.organisation_id WHERE q.organisation_id=?${branchClause(scope, 'q')} ORDER BY CASE q.status WHEN 'actions_required' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,datetime(q.scheduled_for) LIMIT 300`).bind(org, ...branchBindings(scope)).all(),
    db.prepare(`SELECT a.*,u.display_name owner_name FROM quality_actions a LEFT JOIN users u ON u.id=a.owner_user_id AND u.organisation_id=a.organisation_id WHERE a.organisation_id=?${branchClause(scope, 'a')} ORDER BY CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,datetime(a.due_at) LIMIT 500`).bind(org, ...branchBindings(scope)).all(),
    db.prepare(`SELECT g.*,c.first_name||' '||c.last_name client_name FROM client_governance_records g JOIN clients c ON c.id=g.client_id AND c.organisation_id=g.organisation_id WHERE g.organisation_id=?${branchClause(scope, 'g')} AND g.status='active' ORDER BY datetime(g.review_date) LIMIT 300`).bind(org, ...branchBindings(scope)).all(),
    db.prepare(`SELECT o.*,c.first_name||' '||c.last_name client_name FROM clinical_observations o JOIN clients c ON c.id=o.client_id AND c.organisation_id=o.organisation_id WHERE o.organisation_id=?${branchClause(scope, 'o')} AND o.escalation_required=1 AND o.verified_at IS NULL ORDER BY datetime(o.observed_at) DESC LIMIT 200`).bind(org, ...branchBindings(scope)).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,branch_id FROM clients WHERE organisation_id=?${branchClause(scope)} AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org, ...branchBindings(scope)).all(),
    db.prepare(`SELECT id,display_name,access_level,home_branch_id FROM users WHERE organisation_id=? AND status='active'${scope?.restricted ? ' AND (home_branch_id=? OR home_branch_id IS NULL)' : ''} ORDER BY display_name`).bind(org, ...branchBindings(scope)).all(),
  ]);
  const payload = {
    feedback: feedback.results || [], audits: audits.results || [], actions: actions.results || [],
    governance: governance.results || [], observations: observations.results || [],
  };
  return json({ ...payload, ...calculateQualityDashboard(payload), clients: clients.results || [], users: users.results || [], generatedAt: new Date().toISOString() });
}

export async function createFeedback(request, db, session, scope, makeAudit) {
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const validation = validateFeedbackCase(input);
  if (!validation.valid) return error('VALIDATION_ERROR', validation.errors.join(' '), 400, validation);
  const clientId = clean(input.clientId, 160) || null;
  const client = clientId ? await clientInScope(db, session, clientId, scope) : null;
  if (clientId && !client) return error('CLIENT_NOT_FOUND', 'Choose an active client in your organisation or branch.', 404);
  const ownerUserId=clean(input.ownerUserId,160)||null;if(ownerUserId&&!await userInScope(db,session,ownerUserId,scope))return error('OWNER_NOT_FOUND','Choose an active owner in your organisation or branch.',404);
  const id = crypto.randomUUID(), reference = feedbackReference();
  const statements = [db.prepare(`INSERT INTO service_feedback_cases(id,organisation_id,branch_id,client_id,case_reference,case_type,channel,reporter_name,reporter_contact,reporter_user_id,relationship,accessible_support,consent_to_contact,summary,immediate_action,risk_level,owner_user_id,acknowledgement_due_at,response_due_at,status,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?)`).bind(id, session.organisation_id, client?.branch_id || (scope?.restricted ? scope.branchId : null), clientId, reference, clean(input.caseType, 40), clean(input.channel, 80) || 'direct', clean(input.reporterName, 240), clean(input.reporterContact, 320), clean(input.reporterUserId, 160) || null, clean(input.relationship, 160), clean(input.accessibleSupport, 2_000), bool(input.consentToContact) ? 1 : 0, clean(input.summary, 20_000), clean(input.immediateAction, 10_000), ['standard','high','critical'].includes(clean(input.riskLevel, 40)) ? clean(input.riskLevel, 40) : 'standard', ownerUserId, clean(input.acknowledgementDueAt, 80) || null, clean(input.responseDueAt, 80), session.user_id)];
  audit(statements, makeAudit, session, 'quality.feedback_created', 'service_feedback', id, { reference, caseType: input.caseType, clientId });
  await db.batch(statements);
  return json({ ok: true, id, reference }, 201);
}

export async function updateFeedback(request, db, session, scope, id, makeAudit) {
  const existing = await db.prepare(`SELECT * FROM service_feedback_cases WHERE id=? AND organisation_id=?${branchClause(scope)} LIMIT 1`).bind(id, session.organisation_id, ...branchBindings(scope)).first();
  if (!existing) return error('NOT_FOUND', 'Feedback case not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const status = clean(input.status, 40) || existing.status;
  if (!['open','acknowledged','investigating','response_due','resolved','closed','withdrawn'].includes(status)) return error('VALIDATION_ERROR', 'Choose a valid feedback status.');
  if (['resolved','closed'].includes(status) && (!clean(input.outcome || existing.outcome) || !clean(input.investigationSummary || existing.investigation_summary) || !clean(input.lessonsLearned || existing.lessons_learned))) return error('QUALITY_CLOSURE_INCOMPLETE', 'Record the investigation, outcome and lessons before resolving this case.', 409);
  const acknowledgedAt = input.acknowledged ? new Date().toISOString() : existing.acknowledged_at;
  const responseSentAt = input.responseSent ? new Date().toISOString() : existing.response_sent_at;
  const statements = [db.prepare(`UPDATE service_feedback_cases SET owner_user_id=?,acknowledged_at=?,response_sent_at=?,investigation_summary=?,outcome=?,lessons_learned=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(input.ownerUserId, 160) || existing.owner_user_id, acknowledgedAt, responseSentAt, clean(input.investigationSummary, 20_000) || existing.investigation_summary, clean(input.outcome, 20_000) || existing.outcome, clean(input.lessonsLearned, 20_000) || existing.lessons_learned, status, id, session.organisation_id)];
  if (clean(input.communicationSummary)) statements.push(db.prepare('INSERT INTO feedback_communications(id,organisation_id,feedback_id,direction,method,summary,shared_with_reporter,recorded_by) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), session.organisation_id, id, clean(input.communicationDirection, 40) || 'outbound', clean(input.communicationMethod, 80) || 'email', clean(input.communicationSummary, 20_000), bool(input.sharedWithReporter) ? 1 : 0, session.user_id));
  audit(statements, makeAudit, session, 'quality.feedback_updated', 'service_feedback', id, { status, responseSent: Boolean(responseSentAt) });
  await db.batch(statements);
  return json({ ok: true, id, status });
}

export async function createQualityAudit(request, db, session, scope, makeAudit) {
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  if (clean(input.title).length < 5 || clean(input.scope).length < 10 || !clean(input.auditType) || !clean(input.scheduledFor)) return error('VALIDATION_ERROR', 'Enter the audit type, title, scope and scheduled date.');
  const ownerUserId=clean(input.ownerUserId,160)||session.user_id;if(!await userInScope(db,session,ownerUserId,scope))return error('OWNER_NOT_FOUND','Choose an active audit owner in your organisation or branch.',404);
  const id = crypto.randomUUID(), reference = auditReference();
  const statements = [db.prepare(`INSERT INTO quality_audits(id,organisation_id,branch_id,audit_reference,audit_type,title,scope,standard_reference,owner_user_id,scheduled_for,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,'planned',?)`).bind(id, session.organisation_id, scope?.restricted ? scope.branchId : clean(input.branchId, 160) || null, reference, clean(input.auditType, 120), clean(input.title, 240), clean(input.scope, 20_000), clean(input.standardReference, 500), ownerUserId, clean(input.scheduledFor, 80), session.user_id)];
  audit(statements, makeAudit, session, 'quality.audit_created', 'quality_audit', id, { reference, auditType: input.auditType });
  await db.batch(statements);
  return json({ ok: true, id, reference }, 201);
}

export async function updateQualityAudit(request, db, session, scope, id, approve, makeAudit) {
  const existing = await db.prepare(`SELECT * FROM quality_audits WHERE id=? AND organisation_id=?${branchClause(scope)} LIMIT 1`).bind(id, session.organisation_id, ...branchBindings(scope)).first();
  if (!existing) return error('NOT_FOUND', 'Quality audit not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const status = clean(input.status, 40) || existing.status;
  if (!['planned','in_progress','actions_required','effectiveness_review','closed','cancelled'].includes(status)) return error('VALIDATION_ERROR', 'Choose a valid audit status.');
  if (status === 'closed' && !approve) return error('INDEPENDENT_APPROVAL_REQUIRED', 'Quality closure requires an authorised independent approver.', 403);
  if (status === 'closed' && existing.created_by === session.user_id) return error('INDEPENDENT_APPROVAL_REQUIRED', 'A different authorised manager must close this audit.', 409);
  if (['actions_required','effectiveness_review','closed'].includes(status) && (!clean(input.findings || existing.findings) || !clean(input.rootCause || existing.root_cause))) return error('QUALITY_CLOSURE_INCOMPLETE', 'Record findings and root cause before progressing this audit.', 409);
  const statements = [db.prepare(`UPDATE quality_audits SET score_percent=?,outcome=?,findings=?,strengths=?,immediate_containment=?,root_cause=?,owner_user_id=?,completed_at=?,effectiveness_review_at=?,independently_closed_by=?,closed_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(input.scorePercent === '' || input.scorePercent === undefined ? existing.score_percent : Math.max(0, Math.min(100, Number(input.scorePercent))), clean(input.outcome, 40) || existing.outcome, clean(input.findings, 30_000) || existing.findings, clean(input.strengths, 20_000) || existing.strengths, clean(input.immediateContainment, 20_000) || existing.immediate_containment, clean(input.rootCause, 20_000) || existing.root_cause, clean(input.ownerUserId, 160) || existing.owner_user_id, ['actions_required','effectiveness_review','closed'].includes(status) ? (existing.completed_at || new Date().toISOString()) : existing.completed_at, status === 'effectiveness_review' ? new Date().toISOString() : existing.effectiveness_review_at, status === 'closed' ? session.user_id : existing.independently_closed_by, status === 'closed' ? new Date().toISOString() : existing.closed_at, status, id, session.organisation_id)];
  audit(statements, makeAudit, session, 'quality.audit_updated', 'quality_audit', id, { status, independentlyClosed: status === 'closed' });
  await db.batch(statements);
  return json({ ok: true, id, status });
}

export async function createQualityAction(request, db, session, scope, makeAudit) {
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const validation = validateQualityAction(input);
  if (!validation.valid) return error('VALIDATION_ERROR', validation.errors.join(' '), 400, validation);
  const ownerUserId=clean(input.ownerUserId,160);if(!await userInScope(db,session,ownerUserId,scope))return error('OWNER_NOT_FOUND','Choose an active action owner in your organisation or branch.',404);
  const id = crypto.randomUUID();
  const statements = [db.prepare(`INSERT INTO quality_actions(id,organisation_id,branch_id,source_type,source_id,action_type,title,action_required,priority,owner_user_id,due_at,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,'open',?)`).bind(id, session.organisation_id, scope?.restricted ? scope.branchId : clean(input.branchId, 160) || null, ['audit','complaint','incident','medication','visit','care_plan','workforce','other'].includes(clean(input.sourceType, 40)) ? clean(input.sourceType, 40) : 'other', clean(input.sourceId, 160) || null, ['containment','correction','corrective','preventive','improvement'].includes(clean(input.actionType, 40)) ? clean(input.actionType, 40) : 'corrective', clean(input.title, 240), clean(input.actionRequired, 20_000), ['low','medium','high','critical'].includes(clean(input.priority, 40)) ? clean(input.priority, 40) : 'medium', ownerUserId, clean(input.dueAt, 80), session.user_id)];
  audit(statements, makeAudit, session, 'quality.action_created', 'quality_action', id, { sourceType: input.sourceType, sourceId: input.sourceId });
  await db.batch(statements);
  return json({ ok: true, id }, 201);
}

export async function updateQualityAction(request, db, session, scope, id, approve, makeAudit) {
  const existing = await db.prepare(`SELECT * FROM quality_actions WHERE id=? AND organisation_id=?${branchClause(scope)} LIMIT 1`).bind(id, session.organisation_id, ...branchBindings(scope)).first();
  if (!existing) return error('NOT_FOUND', 'Quality action not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const status = clean(input.status, 40) || existing.status;
  if (!['open','in_progress','completed','effectiveness_review','verified','cancelled'].includes(status)) return error('VALIDATION_ERROR', 'Choose a valid action status.');
  if (status === 'verified' && !approve) return error('INDEPENDENT_APPROVAL_REQUIRED', 'Only an authorised quality approver can verify closure.', 403);
  if (status === 'verified' && existing.created_by === session.user_id) return error('INDEPENDENT_APPROVAL_REQUIRED', 'A different authorised manager must verify this action.', 409);
  if (['completed','effectiveness_review','verified'].includes(status) && !clean(input.effectivenessEvidence || existing.effectiveness_evidence)) return error('QUALITY_CLOSURE_INCOMPLETE', 'Record completion and effectiveness evidence before progressing this action.', 409);
  if (status === 'verified' && !['effective','partly_effective','ineffective'].includes(clean(input.effectivenessOutcome || existing.effectiveness_outcome, 40))) return error('QUALITY_CLOSURE_INCOMPLETE', 'Record the effectiveness outcome before verification.', 409);
  const statements = [db.prepare(`UPDATE quality_actions SET owner_user_id=?,due_at=?,completed_at=?,effectiveness_evidence=?,effectiveness_outcome=?,verified_by=?,verified_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(input.ownerUserId, 160) || existing.owner_user_id, clean(input.dueAt, 80) || existing.due_at, ['completed','effectiveness_review','verified'].includes(status) ? (existing.completed_at || new Date().toISOString()) : existing.completed_at, clean(input.effectivenessEvidence, 20_000) || existing.effectiveness_evidence, clean(input.effectivenessOutcome, 40) || existing.effectiveness_outcome, status === 'verified' ? session.user_id : existing.verified_by, status === 'verified' ? new Date().toISOString() : existing.verified_at, status, id, session.organisation_id)];
  audit(statements, makeAudit, session, 'quality.action_updated', 'quality_action', id, { status });
  await db.batch(statements);
  return json({ ok: true, id, status });
}

export async function clientAssurance(db, session, clientId, scope = {}) {
  const client = await clientInScope(db, session, clientId, scope);
  if (!client) return error('CLIENT_NOT_FOUND', 'Client not found.', 404);
  const org = session.organisation_id;
  const [governance, communication, journey, observations, allergies, medicationSupport, supply] = await Promise.all([
    db.prepare('SELECT * FROM client_governance_records WHERE organisation_id=? AND client_id=? ORDER BY CASE status WHEN \'active\' THEN 0 ELSE 1 END,datetime(review_date)').bind(org, clientId).all(),
    db.prepare('SELECT * FROM client_communication_profiles WHERE organisation_id=? AND client_id=? LIMIT 1').bind(org, clientId).first(),
    db.prepare('SELECT * FROM client_journey_events WHERE organisation_id=? AND client_id=? ORDER BY datetime(event_at) DESC LIMIT 300').bind(org, clientId).all(),
    db.prepare('SELECT * FROM clinical_observations WHERE organisation_id=? AND client_id=? ORDER BY datetime(observed_at) DESC LIMIT 500').bind(org, clientId).all(),
    db.prepare("SELECT * FROM client_allergy_records WHERE organisation_id=? AND client_id=? AND verification_status NOT IN ('entered_in_error','inactive') ORDER BY CASE severity WHEN 'life_threatening' THEN 0 WHEN 'severe' THEN 1 ELSE 2 END,substance").bind(org, clientId).all(),
    db.prepare('SELECT * FROM medication_support_assessments WHERE organisation_id=? AND client_id=? ORDER BY CASE status WHEN \'active\' THEN 0 ELSE 1 END,datetime(review_date)').bind(org, clientId).all(),
    db.prepare('SELECT s.*,m.name medication_name FROM medication_supply_records s JOIN medications m ON m.id=s.medication_id AND m.organisation_id=s.organisation_id WHERE s.organisation_id=? AND s.client_id=? ORDER BY datetime(s.recorded_at) DESC LIMIT 300').bind(org, clientId).all(),
  ]);
  return json({ client, governance: governance.results || [], communication: communication || null, journey: journey.results || [], observations: observations.results || [], allergies: allergies.results || [], medicationSupport: medicationSupport.results || [], medicationSupply: supply.results || [] });
}

export async function createGovernanceRecord(request, db, session, clientId, scope, makeAudit) {
  const client = await clientInScope(db, session, clientId, scope);
  if (!client) return error('CLIENT_NOT_FOUND', 'Client not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const validation = validateGovernanceRecord(input);
  if (!validation.valid) return error('VALIDATION_ERROR', validation.errors.join(' '), 400, validation);
  const id = crypto.randomUUID(), status = bool(input.approved) ? 'active' : 'draft';
  const statements = [db.prepare(`INSERT INTO client_governance_records(id,organisation_id,branch_id,client_id,record_type,title,decision_scope,outcome,rationale,participants_json,legal_authority,evidence_reference,effective_from,review_date,expires_at,prominent_alert,status,recorded_by,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, session.organisation_id, client.branch_id, clientId, clean(input.recordType, 80), clean(input.title, 240), clean(input.decisionScope, 5_000), clean(input.outcome, 5_000), clean(input.rationale, 20_000), JSON.stringify(Array.isArray(input.participants) ? input.participants.slice(0, 100) : []), clean(input.legalAuthority, 2_000), clean(input.evidenceReference, 2_000), clean(input.effectiveFrom, 80) || null, clean(input.reviewDate, 80), clean(input.expiresAt, 80) || null, bool(input.prominentAlert) ? 1 : 0, status, session.user_id, status === 'active' ? session.user_id : null, status === 'active' ? new Date().toISOString() : null)];
  audit(statements, makeAudit, session, 'clinical_governance.record_created', 'client_governance_record', id, { clientId, recordType: input.recordType, status });
  await db.batch(statements);
  return json({ ok: true, id, status }, 201);
}

export async function saveCommunicationProfile(request, db, session, clientId, scope, makeAudit) {
  const client = await clientInScope(db, session, clientId, scope);
  if (!client) return error('CLIENT_NOT_FOUND', 'Client not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const validation = validateCommunicationProfile(input);
  if (!validation.valid) return error('VALIDATION_ERROR', validation.errors.join(' '), 400, validation);
  const statements = [db.prepare(`INSERT INTO client_communication_profiles(client_id,organisation_id,preferred_language,communication_method,interpreter_required,interpreter_details,accessible_formats_json,hearing_support,vision_support,cognitive_support,contact_preferences,adjustments,consent_to_share,prominent_flag,verified_by,verified_at,review_date,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(client_id) DO UPDATE SET organisation_id=excluded.organisation_id,preferred_language=excluded.preferred_language,communication_method=excluded.communication_method,interpreter_required=excluded.interpreter_required,interpreter_details=excluded.interpreter_details,accessible_formats_json=excluded.accessible_formats_json,hearing_support=excluded.hearing_support,vision_support=excluded.vision_support,cognitive_support=excluded.cognitive_support,contact_preferences=excluded.contact_preferences,adjustments=excluded.adjustments,consent_to_share=excluded.consent_to_share,prominent_flag=excluded.prominent_flag,verified_by=excluded.verified_by,verified_at=excluded.verified_at,review_date=excluded.review_date,updated_at=CURRENT_TIMESTAMP`).bind(clientId, session.organisation_id, clean(input.preferredLanguage, 160), clean(input.communicationMethod, 160), bool(input.interpreterRequired) ? 1 : 0, clean(input.interpreterDetails, 2_000), JSON.stringify(Array.isArray(input.accessibleFormats) ? input.accessibleFormats.slice(0, 50) : []), clean(input.hearingSupport, 2_000), clean(input.visionSupport, 2_000), clean(input.cognitiveSupport, 2_000), clean(input.contactPreferences, 2_000), clean(input.adjustments, 10_000), bool(input.consentToShare) ? 1 : 0, clean(input.prominentFlag, 1_000), session.user_id, new Date().toISOString(), clean(input.reviewDate, 80))];
  audit(statements, makeAudit, session, 'clinical_governance.communication_profile_updated', 'client', clientId, { reviewDate: input.reviewDate });
  await db.batch(statements);
  return json({ ok: true, clientId });
}

export async function createJourneyEvent(request, db, session, clientId, scope, makeAudit) {
  const client = await clientInScope(db, session, clientId, scope);
  if (!client) return error('CLIENT_NOT_FOUND', 'Client not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const allowed = ['enquiry','referral','pre_assessment','accepted','waitlist','admission','service_change','hospital','return_home','suspension','discharge','deceased','funding_review'];
  if (!allowed.includes(clean(input.eventType, 80)) || !clean(input.eventAt) || clean(input.summary).length < 5) return error('VALIDATION_ERROR', 'Choose the journey event, date and enter a clear summary.');
  const id = crypto.randomUUID();
  const statements = [db.prepare(`INSERT INTO client_journey_events(id,organisation_id,branch_id,client_id,event_type,event_at,status,source,funding_body,service_agreement_reference,summary,handover,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, session.organisation_id, client.branch_id, clientId, clean(input.eventType, 80), clean(input.eventAt, 80), ['planned','in_progress','completed','cancelled'].includes(clean(input.status, 40)) ? clean(input.status, 40) : 'completed', clean(input.source, 1_000), clean(input.fundingBody, 500), clean(input.serviceAgreementReference, 500), clean(input.summary, 20_000), clean(input.handover, 20_000), session.user_id)];
  audit(statements, makeAudit, session, 'client.journey_event_created', 'client_journey_event', id, { clientId, eventType: input.eventType });
  await db.batch(statements);
  return json({ ok: true, id }, 201);
}

export async function createObservation(request, db, session, clientId, scope, makeAudit) {
  const client = await clientInScope(db, session, clientId, scope);
  if (!client) return error('CLIENT_NOT_FOUND', 'Client not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const validation = validateClinicalObservation(input);
  if (!validation.valid) return error('VALIDATION_ERROR', validation.errors.join(' '), 400, validation);
  const id = crypto.randomUUID(), value = input.valueNumeric === '' || input.valueNumeric === undefined ? null : Number(input.valueNumeric), secondary = input.valueSecondary === '' || input.valueSecondary === undefined ? null : Number(input.valueSecondary);
  const min = input.targetMin === '' || input.targetMin === undefined ? null : Number(input.targetMin), max = input.targetMax === '' || input.targetMax === undefined ? null : Number(input.targetMax);
  const thresholdEscalation = Number.isFinite(value) && ((Number.isFinite(min) && value < min) || (Number.isFinite(max) && value > max));
  const escalation = bool(input.escalationRequired) || thresholdEscalation;
  const statements = [db.prepare(`INSERT INTO clinical_observations(id,organisation_id,branch_id,client_id,visit_id,observation_type,observed_at,value_numeric,value_secondary,value_text,unit,target_min,target_max,escalation_required,escalation_action,body_map_record_id,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, session.organisation_id, client.branch_id, clientId, clean(input.visitId, 160) || null, validation.type, clean(input.observedAt, 80), Number.isFinite(value) ? value : null, Number.isFinite(secondary) ? secondary : null, clean(input.valueText, 5_000), clean(input.unit, 80), Number.isFinite(min) ? min : null, Number.isFinite(max) ? max : null, escalation ? 1 : 0, clean(input.escalationAction, 10_000), clean(input.bodyMapRecordId, 160) || null, session.user_id)];
  audit(statements, makeAudit, session, 'clinical_observation.created', 'clinical_observation', id, { clientId, type: validation.type, escalation });
  await db.batch(statements);
  return json({ ok: true, id, escalationRequired: escalation }, 201);
}

export async function createAllergy(request, db, session, clientId, scope, makeAudit) {
  const client = await clientInScope(db, session, clientId, scope);
  if (!client) return error('CLIENT_NOT_FOUND', 'Client not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  if (clean(input.substance).length < 2 || clean(input.reaction).length < 2) return error('VALIDATION_ERROR', 'Record the substance and the person’s reaction.');
  const id = crypto.randomUUID(), verified = bool(input.verified);
  const statements = [db.prepare(`INSERT INTO client_allergy_records(id,organisation_id,client_id,substance,reaction,severity,verification_status,verified_by,verified_at,review_date,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, session.organisation_id, clientId, clean(input.substance, 500), clean(input.reaction, 2_000), ['unknown','mild','moderate','severe','life_threatening'].includes(clean(input.severity, 40)) ? clean(input.severity, 40) : 'unknown', verified ? 'verified' : 'reported', verified ? session.user_id : null, verified ? new Date().toISOString() : null, clean(input.reviewDate, 80) || null, clean(input.notes, 5_000), session.user_id)];
  audit(statements, makeAudit, session, 'clinical_allergy.created', 'client_allergy', id, { clientId, severity: input.severity, verified });
  await db.batch(statements);
  return json({ ok: true, id }, 201);
}

export async function createMedicationSupply(request, db, session, medicationId, scope, makeAudit) {
  const medication = await db.prepare(`SELECT m.id,m.client_id FROM medications m JOIN clients c ON c.id=m.client_id AND c.organisation_id=m.organisation_id WHERE m.id=? AND m.organisation_id=?${scope?.restricted?' AND c.branch_id=?':''} LIMIT 1`).bind(medicationId, session.organisation_id, ...branchBindings(scope)).first();
  if (!medication) return error('NOT_FOUND', 'Medication not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return error('VALIDATION_ERROR', reason.message); }
  const type = clean(input.recordType, 40);
  if (!['order','receipt','return','waste','disposal','reconciliation','discrepancy'].includes(type) || !clean(input.reason)) return error('VALIDATION_ERROR', 'Choose the supply record type and enter the reason or outcome.');
  const id = crypto.randomUUID();
  const statements = [db.prepare(`INSERT INTO medication_supply_records(id,organisation_id,client_id,medication_id,record_type,quantity,batch_number,expiry_date,supplier,reference,status,reason,witnessed_by,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, session.organisation_id, medication.client_id, medicationId, type, input.quantity === '' || input.quantity === undefined ? null : Number(input.quantity), clean(input.batchNumber, 240), clean(input.expiryDate, 80) || null, clean(input.supplier, 500), clean(input.reference, 500), ['planned','ordered','received','recorded','resolved','cancelled'].includes(clean(input.status, 40)) ? clean(input.status, 40) : 'recorded', clean(input.reason, 10_000), clean(input.witnessedBy, 160) || null, session.user_id)];
  audit(statements, makeAudit, session, 'medication.supply_record_created', 'medication_supply_record', id, { medicationId, type });
  await db.batch(statements);
  return json({ ok: true, id }, 201);
}
