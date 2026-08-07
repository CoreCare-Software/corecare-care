export const ONBOARDING_INVITATION_HOURS = 48;

const clean = (value, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength);

function invitationError(status, code, message) {
  return { ok: false, status, code, message };
}

function safeProductUrl(value) {
  try {
    const url = new URL(clean(value, 2_000));
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url;
  } catch {}
  return null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hashToken(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function onboardingInvitationExpiresAt(now = Date.now()) {
  return new Date(now + ONBOARDING_INVITATION_HOURS * 60 * 60 * 1_000).toISOString();
}

function publicUser(row) {
  const accessLevel = clean(row.access_level || row.role, 80).toLowerCase();
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    accessLevel,
    status: row.status,
    lastLoginAt: row.last_login_at || null,
    mustChangePassword: Boolean(Number(row.must_change_password || 0)),
    isOrganisationOwner: accessLevel === 'organisation_owner' || accessLevel === 'owner',
  };
}

export async function listOrganisationOnboardingUsers(env, input = {}) {
  if (!env.DB) return invitationError(503, 'DATABASE_NOT_CONFIGURED', 'Care organisation storage is unavailable.');
  const externalId = clean(input.externalOrganisationId || input.external_organisation_id, 160);
  const organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=? LIMIT 1').bind(externalId).first();
  if (!organisation) return invitationError(404, 'ORGANISATION_NOT_FOUND', 'The Care organisation was not found.');
  const rows = await env.DB.prepare(`SELECT id,email,display_name,access_level,role,status,last_login_at,must_change_password
    FROM users WHERE organisation_id=?
    ORDER BY CASE WHEN access_level='organisation_owner' OR role='owner' THEN 0 ELSE 1 END,
      CASE status WHEN 'active' THEN 0 ELSE 1 END,display_name,email`).bind(organisation.id).all();
  return {
    ok: true,
    productCode: 'CARE',
    organisation: { id: organisation.id, name: organisation.name, status: organisation.status },
    users: (rows.results || []).map(publicUser),
  };
}

export async function issueOrganisationOnboardingInvitation(env, input = {}) {
  if (!env.DB) return invitationError(503, 'DATABASE_NOT_CONFIGURED', 'Care organisation storage is unavailable.');
  const externalId = clean(input.externalOrganisationId || input.external_organisation_id, 160);
  const userId = clean(input.userId || input.user_id, 160);
  const baseUrl = safeProductUrl(input.loginUrl || input.login_url);
  if (!externalId || !userId || !baseUrl) return invitationError(400, 'INVALID_INVITATION_REQUEST', 'Organisation, user and secure product URL are required.');
  const user = await env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.access_level,u.role,u.status,u.last_login_at,u.must_change_password,
      o.id organisation_id,o.name organisation_name,o.status organisation_status
    FROM users u JOIN organisations o ON o.id=u.organisation_id
    WHERE u.id=? AND o.id=? LIMIT 1`).bind(userId, externalId).first();
  if (!user) return invitationError(404, 'USER_NOT_FOUND', 'The Care user was not found in this organisation.');
  if (user.organisation_status !== 'active') return invitationError(409, 'ORGANISATION_NOT_ACTIVE', 'Restore the organisation before sending access.');
  if (user.status !== 'active') return invitationError(409, 'USER_NOT_ACTIVE', 'Enable the user before sending access.');
  const token = randomToken(), tokenId = crypto.randomUUID(), expiresAt = onboardingInvitationExpiresAt();
  baseUrl.pathname = '/'; baseUrl.search = ''; baseUrl.hash = '';
  baseUrl.searchParams.set('reset', token); baseUrl.searchParams.set('activation', '1');
  await env.DB.batch([
    env.DB.prepare('UPDATE password_reset_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE user_id=? AND consumed_at IS NULL').bind(user.id),
    env.DB.prepare("INSERT INTO password_reset_tokens(id,user_id,token_hash,request_ip_hash,expires_at,purpose) VALUES(?,?,?,?,?,'activation')")
      .bind(tokenId, user.id, await hashToken(token), await hashToken('corecare-owner-platform-onboarding'), expiresAt),
  ]);
  const accessLevel = clean(user.access_level || user.role, 80).toLowerCase();
  return {
    ok: true,
    invitation: {
      userId: user.id,
      recipientEmail: user.email,
      recipientName: user.display_name,
      accessLabel: accessLevel.replaceAll('_', ' '),
      organisationName: user.organisation_name,
      actionUrl: baseUrl.toString(),
      expiresAt,
      sourceEventId: `owner-care-invitation:${user.id}:${tokenId}`,
      isOrganisationOwner: accessLevel === 'organisation_owner' || accessLevel === 'owner',
    },
  };
}
