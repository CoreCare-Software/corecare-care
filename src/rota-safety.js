import { assessStaffAllocation, assessVisitTeam, parseStringList } from './commercial-readiness.js';

const clean = (value, maximum = 10_000) => String(value ?? '').trim().slice(0, maximum);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const failure = (code, message, status = 400, details) => json({ error: { code, message, ...(details ? { details } : {}) } }, status);

async function readObject(request, maximum = 128_000) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximum) throw new Error('Request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximum) throw new Error('Request is too large.');
  const value = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a valid allocation.');
  return value;
}

function audit(statements, makeAudit, session, action, entityType, entityId, detail = {}) {
  const statement = makeAudit?.(session.organisation_id, session.user_id, action, entityType, entityId, detail);
  if (statement) statements.push(statement);
}

function scopeSql(scope, alias = 'v') {
  return scope?.restricted ? ` AND ${alias}.branch_id=?` : '';
}

function scopeValues(scope) {
  return scope?.restricted ? [scope.branchId] : [];
}

function isoDayOfWeek(value) {
  const day = new Date(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function timePart(value) {
  return new Date(value).toISOString().slice(11, 16);
}

export async function assessStaffAllocationDb(db, session, staffId, visit, options = {}) {
  const org = session.organisation_id;
  const start = visit.scheduled_start || visit.scheduledStart;
  const suppliedEnd = visit.scheduled_end || visit.scheduledEnd;
  const end = suppliedEnd || new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  const staff = await db.prepare('SELECT id,organisation_id,branch_id,first_name,last_name,preferred_name,job_title,status FROM staff WHERE id=? AND organisation_id=? LIMIT 1').bind(staffId, org).first();
  if (!staff) return { allowed: false, staff: null, blockers: [{ code: 'STAFF_NOT_FOUND', message: 'Care worker not found in this organisation.' }], warnings: [] };
  const [settings, absence, overlap, patterns, criticalTraining, criticalCompetencies, capabilityRows] = await Promise.all([
    db.prepare('SELECT block_expired_critical_competencies FROM workforce_settings WHERE organisation_id=? LIMIT 1').bind(org).first(),
    db.prepare(`SELECT id,absence_type,leave_category,started_at,ended_at FROM staff_absences WHERE organisation_id=? AND staff_id=? AND restricted=1 AND status IN ('planned','open') AND datetime(started_at)<datetime(?) AND datetime(COALESCE(ended_at,'9999-12-31'))>datetime(?) ORDER BY CASE leave_category WHEN 'annual_leave' THEN 0 ELSE 1 END,datetime(started_at) LIMIT 1`).bind(org, staffId, end, start).first(),
    db.prepare(`SELECT DISTINCT v.id FROM care_visits v LEFT JOIN visit_staff_assignments a ON a.visit_id=v.id AND a.organisation_id=v.organisation_id AND a.staff_id=? AND a.allocation_status NOT IN ('removed','declined') WHERE v.organisation_id=? AND v.id<>? AND v.status!='cancelled' AND COALESCE(v.rota_status,'published')!='cancelled' AND (v.staff_id=? OR a.staff_id=?) AND datetime(v.scheduled_start)<datetime(?) AND datetime(COALESCE(v.scheduled_end,datetime(v.scheduled_start,'+30 minutes')))>datetime(?) LIMIT 1`).bind(staffId, org, visit.id || '', staffId, staffId, end, start).first(),
    db.prepare("SELECT * FROM staff_working_patterns WHERE organisation_id=? AND staff_id=? AND status='active' ORDER BY cycle_weeks,week_number,day_of_week,start_time").bind(org, staffId).all(),
    db.prepare(`SELECT c.name,c.category,r.status,r.expiry_date,r.competency_confirmed FROM staff_training_catalog c LEFT JOIN staff_training_records r ON r.training_catalog_id=c.id AND r.organisation_id=c.organisation_id AND r.staff_id=? WHERE c.organisation_id=? AND c.active=1 AND c.critical_for_allocation=1 AND (r.id IS NULL OR r.status NOT IN ('completed','exempt') OR (r.expiry_date IS NOT NULL AND date(r.expiry_date)<date(?)) OR (c.evidence_required=1 AND r.status='completed' AND r.competency_confirmed=0))`).bind(staffId, org, String(start).slice(0, 10)).all(),
    db.prepare(`SELECT name,status,expiry_date FROM staff_competencies WHERE organisation_id=? AND staff_id=? AND critical_for_allocation=1 AND (status IN ('planned','development_required','restricted','expired') OR (expiry_date IS NOT NULL AND date(expiry_date)<date(?)))`).bind(org, staffId, String(start).slice(0, 10)).all(),
    db.prepare(`SELECT lower(c.name) name,lower(c.category) category FROM staff_training_records r JOIN staff_training_catalog c ON c.id=r.training_catalog_id AND c.organisation_id=r.organisation_id WHERE r.organisation_id=? AND r.staff_id=? AND r.status IN ('completed','exempt') AND (r.expiry_date IS NULL OR date(r.expiry_date)>=date(?)) UNION ALL SELECT lower(name),lower(category) FROM staff_competencies WHERE organisation_id=? AND staff_id=? AND status IN ('observed','competent') AND (expiry_date IS NULL OR date(expiry_date)>=date(?))`).bind(org, staffId, String(start).slice(0, 10), org, staffId, String(start).slice(0, 10)).all(),
  ]);
  const patternRows = patterns.results || [];
  const day = isoDayOfWeek(start), startTime = timePart(start), endTime = timePart(end);
  const matchingPattern = patternRows.some(row => Number(row.day_of_week) === day && clean(row.start_time).slice(0, 5) <= startTime && clean(row.end_time).slice(0, 5) >= endTime);
  const requiredSkills = parseStringList(options.requiredSkills ?? visit.skills_json ?? visit.required_skills_json);
  const staffSkills = [...new Set((capabilityRows.results || []).flatMap(row => [clean(row.name, 160), clean(row.category, 160)]).filter(Boolean))];
  const base = assessStaffAllocation({
    staff,
    visit,
    requiredSkills,
    staffSkills,
    branchMismatch: Boolean(visit.branch_id && staff.branch_id && visit.branch_id !== staff.branch_id),
    allocationRestricted: Number(settings?.block_expired_critical_competencies ?? 1) === 1 && ((criticalTraining.results || []).length > 0 || (criticalCompetencies.results || []).length > 0),
    absence: absence || null,
    overlap: Boolean(overlap),
    outsideWorkingPattern: patternRows.length > 0 && !matchingPattern,
    travelConflict: Boolean(options.travelConflict),
  });
  if (!patternRows.length) base.warnings.push({ code: 'WORKING_PATTERN_NOT_RECORDED', message: 'No working pattern is recorded for this care worker.' });
  return {
    ...base,
    staff: { ...staff, display_name: [staff.preferred_name || staff.first_name, staff.last_name].filter(Boolean).join(' ') },
    evidence: {
      absence: absence || null,
      overlapVisitId: overlap?.id || null,
      criticalTraining: criticalTraining.results || [],
      criticalCompetencies: criticalCompetencies.results || [],
      workingPatternRecorded: patternRows.length > 0,
      matchingWorkingPattern: matchingPattern,
    },
  };
}

export async function visitTeam(db, session, visitId, scope = {}, includeReadiness = true) {
  const visit = await db.prepare(`SELECT v.*,r.skills_json requirement_skills_json FROM care_visits v LEFT JOIN client_visit_requirements r ON r.id=v.requirement_id AND r.organisation_id=v.organisation_id WHERE v.id=? AND v.organisation_id=?${scopeSql(scope)} LIMIT 1`).bind(visitId, session.organisation_id, ...scopeValues(scope)).first();
  if (!visit) return null;
  const rows = (await db.prepare(`SELECT a.*,s.first_name,s.last_name,s.preferred_name,s.job_title,s.status staff_status FROM visit_staff_assignments a JOIN staff s ON s.id=a.staff_id AND s.organisation_id=a.organisation_id WHERE a.organisation_id=? AND a.visit_id=? AND a.allocation_status NOT IN ('removed','declined') ORDER BY CASE a.assignment_role WHEN 'lead' THEN 0 ELSE 1 END,a.allocated_at`).bind(session.organisation_id, visitId).all()).results || [];
  const assignments = [];
  for (const row of rows) {
    const readiness = includeReadiness ? await assessStaffAllocationDb(db, session, row.staff_id, visit, { requiredSkills: visit.requirement_skills_json, ignoreAssignmentId: row.id }) : { allowed: true, blockers: [], warnings: [] };
    assignments.push({ ...row, staff_name: [row.preferred_name || row.first_name, row.last_name].filter(Boolean).join(' '), blockers: readiness.blockers, warnings: readiness.warnings, readiness });
  }
  return { visit, assignments, assessment: assessVisitTeam(visit, assignments) };
}

export async function getVisitAllocations(db, session, visitId, scope = {}) {
  const team = await visitTeam(db, session, visitId, scope, true);
  return team ? json(team) : failure('NOT_FOUND', 'Rota visit not found.', 404);
}

export async function candidateStaff(db, session, visitId, scope = {}) {
  const team = await visitTeam(db, session, visitId, scope, false);
  if (!team) return failure('NOT_FOUND', 'Rota visit not found.', 404);
  const staff = (await db.prepare(`SELECT id FROM staff WHERE organisation_id=?${scope?.restricted ? ' AND branch_id=?' : ''} AND status='Active' ORDER BY first_name,last_name`).bind(session.organisation_id, ...scopeValues(scope)).all()).results || [];
  const candidates = [];
  for (const row of staff) candidates.push(await assessStaffAllocationDb(db, session, row.id, team.visit, { requiredSkills: team.visit.requirement_skills_json }));
  candidates.sort((a, b) => Number(b.allowed) - Number(a.allowed) || a.blockers.length - b.blockers.length || a.warnings.length - b.warnings.length || clean(a.staff?.display_name).localeCompare(clean(b.staff?.display_name)));
  return json({ visit: team.visit, current: team.assignments, candidates });
}

export async function replaceVisitAssignments(request, db, session, visitId, scope, makeAudit) {
  const current = await visitTeam(db, session, visitId, scope, false);
  if (!current) return failure('NOT_FOUND', 'Rota visit not found.', 404);
  let input; try { input = await readObject(request); } catch (reason) { return failure('VALIDATION_ERROR', reason.message); }
  const requested = Array.isArray(input.assignments) ? input.assignments : [];
  const normalised = requested.map((row, index) => ({ staffId: clean(row.staffId, 160), role: index === 0 ? 'lead' : clean(row.role, 40) === 'lead' ? 'support' : 'support' })).filter(row => row.staffId);
  if (new Set(normalised.map(row => row.staffId)).size !== normalised.length) return failure('DUPLICATE_CARE_WORKER', 'The same care worker cannot fill more than one team position.', 409);
  const required = Math.max(1, Math.min(4, Number(input.carersRequired ?? current.visit.carers_required ?? 1) || 1));
  if (normalised.length > required) return failure('CARE_TEAM_OVERSUBSCRIBED', `This visit requires ${required} care worker${required === 1 ? '' : 's'}.`, 409);
  const assessed = [];
  for (const row of normalised) assessed.push({ ...row, readiness: await assessStaffAllocationDb(db, session, row.staffId, current.visit, { requiredSkills: current.visit.requirement_skills_json }) });
  const blocked = assessed.filter(row => !row.readiness.allowed);
  if (blocked.length) return failure('UNSAFE_ALLOCATION', 'One or more care workers cannot be safely allocated.', 409, { staff: blocked.map(row => ({ staffId: row.staffId, name: row.readiness.staff?.display_name, blockers: row.readiness.blockers })) });
  const state = normalised.length === 0 ? 'unallocated' : normalised.length < required ? 'partial' : 'ready';
  const statements = [
    db.prepare("UPDATE visit_staff_assignments SET allocation_status='removed',updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND visit_id=? AND allocation_status NOT IN ('removed','declined')").bind(session.organisation_id, visitId),
  ];
  for (let index = 0; index < normalised.length; index += 1) {
    const row = normalised[index];
    statements.push(db.prepare(`INSERT INTO visit_staff_assignments(id,organisation_id,branch_id,visit_id,staff_id,assignment_role,allocation_status,allocation_version,allocated_by,allocated_at,updated_at)
      VALUES(?,?,?,?,?,?, 'allocated',1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(organisation_id,visit_id,staff_id) DO UPDATE SET assignment_role=excluded.assignment_role,allocation_status='allocated',allocation_version=visit_staff_assignments.allocation_version+1,allocated_by=excluded.allocated_by,allocated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), session.organisation_id, current.visit.branch_id || null, visitId, row.staffId, index === 0 ? 'lead' : 'support', session.user_id));
  }
  statements.push(db.prepare('UPDATE care_visits SET staff_id=?,carers_required=?,allocation_state=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(normalised[0]?.staffId || null, required, state, visitId, session.organisation_id));
  audit(statements, makeAudit, session, 'rota.care_team_updated', 'visit', visitId, { required, assigned: normalised.map(row => row.staffId), state });
  await db.batch(statements);
  return getVisitAllocations(db, session, visitId, scope);
}

export async function enrichVisitsWithTeams(db, session, visits = [], scope = {}, includeReadiness = false) {
  if (!visits.length) return [];
  const ids = visits.map(row => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT a.*,s.first_name,s.last_name,s.preferred_name,s.job_title FROM visit_staff_assignments a JOIN staff s ON s.id=a.staff_id AND s.organisation_id=a.organisation_id WHERE a.organisation_id=? AND a.visit_id IN (${placeholders}) AND a.allocation_status NOT IN ('removed','declined') ORDER BY a.visit_id,CASE a.assignment_role WHEN 'lead' THEN 0 ELSE 1 END,a.allocated_at`).bind(session.organisation_id, ...ids).all()).results || [];
  const byVisit = new Map();
  for (const row of rows) {
    if (!byVisit.has(row.visit_id)) byVisit.set(row.visit_id, []);
    byVisit.get(row.visit_id).push({ ...row, staff_name: [row.preferred_name || row.first_name, row.last_name].filter(Boolean).join(' ') });
  }
  const enriched = [];
  for (const visit of visits) {
    let assignments = byVisit.get(visit.id) || [];
    if (!assignments.length && visit.staff_id) assignments = [{ id: `legacy:${visit.id}`, visit_id: visit.id, staff_id: visit.staff_id, assignment_role: 'lead', allocation_status: 'allocated', staff_name: visit.staff_name || '' }];
    if (includeReadiness) {
      const checked = [];
      for (const row of assignments) {
        const readiness = await assessStaffAllocationDb(db, session, row.staff_id, visit, { requiredSkills: visit.requirement_skills_json });
        checked.push({ ...row, blockers: readiness.blockers, warnings: readiness.warnings, readiness });
      }
      assignments = checked;
    }
    const team = assessVisitTeam(visit, assignments);
    enriched.push({ ...visit, assignments, assigned_staff_count: team.assigned, allocation_state: team.state, allocation_blockers: team.blockers, carers_required: team.required });
  }
  return enriched;
}

export async function publicationReadiness(db, session, visits, scope = {}) {
  const enriched = await enrichVisitsWithTeams(db, session, visits, scope, true);
  const blockers = [];
  for (const visit of enriched) for (const item of visit.allocation_blockers || []) blockers.push({ visitId: visit.id, clientName: visit.client_name || '', ...item });
  return { ready: visits.length > 0 && blockers.length === 0, visits: enriched, blockers };
}

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function syncAssignmentClockEvents(request, db, session, makeAudit) {
  let input; try { input = await readObject(request); } catch (reason) { return failure('VALIDATION_ERROR', reason.message); }
  if (!session.staff_id) return failure('STAFF_LINK_REQUIRED', 'Your account must be linked to a staff record before recording visit attendance.', 409);
  const events = Array.isArray(input.events) ? input.events.slice(0, 100) : [];
  const results = [];
  for (const event of events) {
    const eventId = clean(event.eventId, 200), visitId = clean(event.visitId, 160), assignmentId = clean(event.assignmentId, 160), code = clean(event.code, 80), type = clean(event.type, 40), deviceTime = clean(event.deviceTime, 80), source = clean(event.source, 40) === 'offline' ? 'offline' : 'online';
    if (!eventId || !visitId || !assignmentId || !code || !['clock_in','clock_out'].includes(type) || !Number.isFinite(new Date(deviceTime).getTime())) { results.push({ eventId, ok: false, error: 'Invalid visit attendance event.' }); continue; }
    const drift = Math.abs(Date.now() - new Date(deviceTime).getTime());
    if (drift > (source === 'offline' ? 72 * 3_600_000 : 15 * 60_000)) { results.push({ eventId, ok: false, error: source === 'offline' ? 'Offline events must be synchronised within 72 hours.' : 'The device time differs from CoreCare by more than 15 minutes.' }); continue; }
    const duplicate = await db.prepare('SELECT id FROM visit_assignment_events WHERE organisation_id=? AND device_event_id=? LIMIT 1').bind(session.organisation_id, eventId).first();
    if (duplicate) { results.push({ eventId, ok: true, duplicate: true }); continue; }
    const row = await db.prepare(`SELECT a.id assignment_id,a.staff_id,a.actual_start,a.actual_end,v.id visit_id,v.client_id,v.status,v.rota_status,v.scheduled_start,v.scheduled_end,v.carers_required,vc.id code_id FROM visit_staff_assignments a JOIN care_visits v ON v.id=a.visit_id AND v.organisation_id=a.organisation_id JOIN client_visit_codes vc ON vc.client_id=v.client_id AND vc.organisation_id=v.organisation_id AND vc.code=? AND vc.active=1 AND datetime(COALESCE(vc.expires_at,'9999-12-31'))>CURRENT_TIMESTAMP WHERE a.id=? AND a.visit_id=? AND a.organisation_id=? AND a.staff_id=? AND a.allocation_status NOT IN ('removed','declined') LIMIT 1`).bind(code, assignmentId, visitId, session.organisation_id, session.staff_id).first();
    if (!row || clean(row.rota_status).toLowerCase() !== 'published' || clean(row.status).toLowerCase() === 'cancelled') { results.push({ eventId, ok: false, error: 'This published visit is not assigned to your staff account or the client code is invalid.' }); continue; }
    const scheduledStart = new Date(row.scheduled_start).getTime(), scheduledEnd = new Date(row.scheduled_end || row.scheduled_start).getTime(), eventTime = new Date(deviceTime).getTime();
    if (eventTime < scheduledStart - 90 * 60_000 || eventTime > scheduledEnd + 12 * 3_600_000) { results.push({ eventId, ok: false, error: 'This event is outside the permitted visit attendance window.' }); continue; }
    if (type === 'clock_out' && !row.actual_start) { results.push({ eventId, ok: false, error: 'Clock in before clocking out.' }); continue; }
    const assignmentUpdate = type === 'clock_in'
      ? db.prepare('UPDATE visit_staff_assignments SET actual_start=?,clock_in_method=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND actual_start IS NULL').bind(deviceTime, source, assignmentId, session.organisation_id)
      : db.prepare('UPDATE visit_staff_assignments SET actual_end=?,clock_out_method=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND actual_start IS NOT NULL AND actual_end IS NULL').bind(deviceTime, source, assignmentId, session.organisation_id);
    const statements = [
      assignmentUpdate,
      db.prepare('INSERT INTO visit_assignment_events(id,organisation_id,visit_id,assignment_id,staff_id,event_type,device_event_id,device_time,source,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), session.organisation_id, visitId, assignmentId, session.staff_id, type, eventId, deviceTime, source, session.user_id),
    ];
    if (type === 'clock_in') statements.push(db.prepare("UPDATE care_visits SET status='in_progress',actual_start=COALESCE(actual_start,?),clock_in_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND status='scheduled'").bind(deviceTime, visitId, session.organisation_id));
    audit(statements, makeAudit, session, `visit.assignment_${type}`, 'visit_assignment', assignmentId, { visitId, deviceTime, source, eventHash: await sha256(eventId) });
    try { await db.batch(statements); }
    catch (reason) { results.push({ eventId, ok: false, error: clean(reason?.message || reason, 500) || 'Attendance event could not be saved.' }); continue; }
    if (type === 'clock_out') {
      const count = await db.prepare("SELECT COUNT(*) total,COUNT(CASE WHEN actual_end IS NOT NULL THEN 1 END) complete FROM visit_staff_assignments WHERE organisation_id=? AND visit_id=? AND allocation_status NOT IN ('removed','declined')").bind(session.organisation_id, visitId).first();
      if (Number(count?.complete || 0) >= Number(row.carers_required || 1) && Number(count?.total || 0) >= Number(row.carers_required || 1)) await db.prepare("UPDATE care_visits SET status='completed',actual_end=?,clock_out_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND status='in_progress'").bind(deviceTime, visitId, session.organisation_id).run();
    }
    results.push({ eventId, ok: true, visitId, assignmentId });
  }
  return json({ ok: results.every(row => row.ok), results }, results.some(row => !row.ok) ? 207 : 200);
}

export async function refreshVisitExceptions(db, organisationId, now = new Date()) {
  const rows = (await db.prepare(`SELECT id,branch_id,scheduled_start,late_after_minutes,missed_after_minutes,status,exception_state FROM care_visits WHERE organisation_id=? AND status='scheduled' AND COALESCE(rota_status,'published')='published' AND datetime(scheduled_start)<datetime(?) AND datetime(scheduled_start)>=datetime(?,'-2 day')`).bind(organisationId, now.toISOString(), now.toISOString()).all()).results || [];
  const statements = [];
  let changed = 0;
  for (const visit of rows) {
    const minutes = (now.getTime() - new Date(visit.scheduled_start).getTime()) / 60_000;
    const next = minutes >= Number(visit.missed_after_minutes || 60) ? 'missed' : minutes >= Math.max(Number(visit.late_after_minutes || 15) * 2, 30) ? 'critical_late' : minutes >= Number(visit.late_after_minutes || 15) ? 'late' : 'none';
    if (next === 'none' || next === visit.exception_state) continue;
    changed += 1;
    statements.push(db.prepare('UPDATE care_visits SET exception_state=?,status=CASE WHEN ?=\'missed\' THEN \'missed\' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(next, next, visit.id, organisationId));
    statements.push(db.prepare(`INSERT INTO visit_exceptions(id,organisation_id,branch_id,visit_id,exception_type,severity,status,summary) VALUES(?,?,?,?,?,?, 'open',?) ON CONFLICT(organisation_id,visit_id,exception_type,status) DO UPDATE SET severity=excluded.severity,summary=excluded.summary,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), organisationId, visit.branch_id || null, visit.id, next, next === 'late' ? 'warning' : 'critical', next === 'missed' ? 'Visit passed the missed-visit threshold without an arrival.' : next === 'critical_late' ? 'Visit is critically late and requires immediate management action.' : 'Visit is late and awaiting the assigned care team.'));
  }
  if (statements.length) await db.batch(statements);
  return { changed };
}
