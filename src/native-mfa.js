const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHALLENGE_COOKIE = 'corecare_mfa_challenge';
const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;

const clean = (value, maximum = 2_000) => String(value ?? '').trim().slice(0, maximum);

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomToken() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function tokenHash(token) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token || '')))));
}

function cookieValue(request, name) {
  const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return ''; }
}

function challengeCookie(token, expires, sameSite = 'Strict') {
  return `${CHALLENGE_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth/mfa; HttpOnly; Secure; SameSite=${sameSite}; Expires=${expires.toUTCString()}`;
}

function expiredChallengeCookie() {
  return `${CHALLENGE_COOKIE}=; Path=/api/auth/mfa; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function response(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function failure(options, code, message, status = 401, headers = {}) {
  return (options.respond || response)({ error: { code, message } }, status, headers);
}

async function readObject(request, maximum = 16_384) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximum) return {};
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximum) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function mfaRequiredForUser(user, privilegedRoles = []) {
  const role = clean(user?.access_level || user?.accessLevel || user?.role, 100).toLowerCase();
  return Number(user?.policy_require_mfa || user?.require_mfa || 0) === 1 || new Set(privilegedRoles).has(role);
}

export function base32Encode(bytes) {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function movingFactor(counter) {
  const buffer = new ArrayBuffer(8), view = new DataView(buffer), value = BigInt(counter);
  view.setUint32(0, Number((value >> 32n) & 0xffffffffn), false);
  view.setUint32(4, Number(value & 0xffffffffn), false);
  return new Uint8Array(buffer);
}

async function totpCode(secretBytes, counter) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, movingFactor(counter)));
  const offset = signature[signature.length - 1] & 15;
  const binary = ((signature[offset] & 127) << 24) | (signature[offset + 1] << 16) | (signature[offset + 2] << 8) | signature[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

async function verifyTotp(secretBytes, suppliedCode, lastCounter) {
  const code = String(suppliedCode || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(Date.now() / 30_000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const counter = current + offset;
    if (counter <= Number(lastCounter ?? -1)) continue;
    const expected = await totpCode(secretBytes, counter);
    let difference = expected.length ^ code.length;
    for (let index = 0; index < Math.max(expected.length, code.length); index += 1) difference |= (expected.charCodeAt(index) || 0) ^ (code.charCodeAt(index) || 0);
    if (difference === 0) return { counter };
  }
  return null;
}

async function encryptionKey(value) {
  const bytes = base64ToBytes(value);
  if (bytes.byteLength !== 32) throw new Error('MFA encryption key must contain 32 bytes.');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(secret, configuredKey, userId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(String(userId)) }, await encryptionKey(configuredKey), secret);
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

async function decryptSecret(ciphertext, iv, configuredKey, userId) {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv), additionalData: new TextEncoder().encode(String(userId)) }, await encryptionKey(configuredKey), base64ToBytes(ciphertext));
  return new Uint8Array(plaintext);
}

function otpAuthUri(email, issuer, secret) {
  const parameters = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?${parameters.toString()}`;
}

function recoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const random = crypto.getRandomValues(new Uint8Array(12));
    let raw = '';
    for (const byte of random) raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    return `CC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

async function recoveryHash(code, userId) {
  const normalised = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${normalised}`))));
}

function auditStatement(options, user, action, detail) {
  try { return options.auditStatement?.(user, action, detail) || null; } catch { return null; }
}

export async function beginMfa(request, env, user, options = {}) {
  if (!clean(env.MFA_ENCRYPTION_KEY)) return failure(options, 'MFA_NOT_CONFIGURED', 'Microsoft Authenticator sign-in is temporarily unavailable.', 503);
  const userId = clean(user.id || user.user_id, 160);
  let enrolment = await env.DB.prepare('SELECT user_id,secret_ciphertext,secret_iv,status,last_used_counter FROM mfa_enrolments WHERE user_id=?').bind(userId).first();
  let secret, purpose = 'login';
  if (!enrolment || enrolment.status !== 'active') {
    purpose = 'enrol';
    if (enrolment?.status === 'pending') {
      try { secret = await decryptSecret(enrolment.secret_ciphertext, enrolment.secret_iv, env.MFA_ENCRYPTION_KEY, userId); } catch {}
    }
    if (!secret) {
      secret = crypto.getRandomValues(new Uint8Array(20));
      const encrypted = await encryptSecret(secret, env.MFA_ENCRYPTION_KEY, userId);
      await env.DB.prepare(`INSERT INTO mfa_enrolments(user_id,secret_ciphertext,secret_iv,status,created_at,updated_at)
        VALUES(?,?,?,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=excluded.secret_ciphertext,secret_iv=excluded.secret_iv,status='pending',last_used_counter=NULL,enabled_at=NULL,updated_at=CURRENT_TIMESTAMP`)
        .bind(userId, encrypted.ciphertext, encrypted.iv).run();
      enrolment = { ...encrypted, status: 'pending', last_used_counter: null };
    }
  }
  const token = randomToken(), expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  const statements = [
    env.DB.prepare('DELETE FROM mfa_login_challenges WHERE datetime(expires_at)<=CURRENT_TIMESTAMP OR consumed_at IS NOT NULL'),
    env.DB.prepare('DELETE FROM mfa_login_challenges WHERE user_id=? AND consumed_at IS NULL').bind(userId),
    env.DB.prepare('INSERT INTO mfa_login_challenges(token_hash,user_id,purpose,expires_at,ip_hint,user_agent) VALUES(?,?,?,?,?,?)')
      .bind(await tokenHash(token), userId, purpose, expiresAt.toISOString(), clean(request.headers.get('cf-connecting-ip'), 64) || 'unknown', clean(request.headers.get('user-agent'), 250)),
  ];
  const audit = auditStatement(options, user, 'user.mfa_challenge_started', { purpose });
  if (audit) statements.push(audit);
  await env.DB.batch(statements);
  const secretBase32 = secret ? base32Encode(secret) : '';
  return (options.respond || response)({ mfa: {
    required: true,
    enrollmentRequired: purpose === 'enrol',
    challengeToken: token,
    expiresAt: expiresAt.toISOString(),
    ...(secretBase32 ? { secret: secretBase32, otpAuthUri: otpAuthUri(user.email, options.issuer || 'CoreCare', secretBase32) } : {}),
  } }, 202, { 'set-cookie': challengeCookie(token, expiresAt) });
}

export async function getMfaChallenge(request, env, options = {}) {
  const token = cookieValue(request, CHALLENGE_COOKIE);
  if (token.length < 20 || token.length > 256) return failure(options, 'MFA_CHALLENGE_INVALID', 'This Authenticator challenge is invalid or has expired.');
  const challenge = await env.DB.prepare(`SELECT c.purpose,c.expires_at,u.id user_id,u.email,me.secret_ciphertext,me.secret_iv
    FROM mfa_login_challenges c JOIN users u ON u.id=c.user_id LEFT JOIN mfa_enrolments me ON me.user_id=u.id
    WHERE c.token_hash=? AND c.consumed_at IS NULL AND datetime(c.expires_at)>CURRENT_TIMESTAMP LIMIT 1`).bind(await tokenHash(token)).first();
  if (!challenge) return failure(options, 'MFA_CHALLENGE_INVALID', 'This Authenticator challenge is invalid or has expired.');
  let secret = '';
  if (challenge.purpose === 'enrol') {
    try { secret = base32Encode(await decryptSecret(challenge.secret_ciphertext, challenge.secret_iv, env.MFA_ENCRYPTION_KEY, challenge.user_id)); }
    catch { return failure(options, 'MFA_NOT_CONFIGURED', 'Microsoft Authenticator sign-in is temporarily unavailable.', 503); }
  }
  return (options.respond || response)({ mfa: { required: true, enrollmentRequired: challenge.purpose === 'enrol', challengeToken: null, expiresAt: challenge.expires_at, ...(secret ? { secret, otpAuthUri: otpAuthUri(challenge.email, options.issuer || 'CoreCare', secret) } : {}) } });
}

export async function verifyMfa(request, env, options = {}) {
  const input = await readObject(request);
  const token = String(input.challengeToken || cookieValue(request, CHALLENGE_COOKIE) || '');
  const code = String(input.code || '').trim();
  if (token.length < 20 || token.length > 256 || code.length < 6 || code.length > 32) return failure(options, 'MFA_CHALLENGE_INVALID', 'This Authenticator challenge is invalid or has expired.');
  const hash = await tokenHash(token);
  const challenge = await env.DB.prepare(`SELECT c.token_hash,c.user_id,c.purpose,c.expires_at,c.attempt_count,c.ip_hint,c.user_agent,
    me.secret_ciphertext,me.secret_iv,me.status mfa_status,me.last_used_counter
    FROM mfa_login_challenges c LEFT JOIN mfa_enrolments me ON me.user_id=c.user_id
    WHERE c.token_hash=? AND c.consumed_at IS NULL AND datetime(c.expires_at)>CURRENT_TIMESTAMP LIMIT 1`).bind(hash).first();
  const user = challenge ? await options.loadUser(env.DB, challenge.user_id) : null;
  if (!challenge || Number(challenge.attempt_count) >= MAX_ATTEMPTS || !user || !options.isUserValid(user) || !options.isMfaRequired(user)) {
    return failure(options, 'MFA_CHALLENGE_INVALID', 'This Authenticator challenge is invalid or has expired.');
  }
  let secret;
  try { secret = await decryptSecret(challenge.secret_ciphertext, challenge.secret_iv, env.MFA_ENCRYPTION_KEY, challenge.user_id); }
  catch { return failure(options, 'MFA_NOT_CONFIGURED', 'Microsoft Authenticator sign-in is temporarily unavailable.', 503); }
  const totp = await verifyTotp(secret, code, challenge.last_used_counter);
  let recovery = null;
  if (!totp && challenge.purpose === 'login') recovery = await env.DB.prepare('SELECT id FROM mfa_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL LIMIT 1').bind(challenge.user_id, await recoveryHash(code, challenge.user_id)).first();
  if (!totp && !recovery) {
    const attempts = Number(challenge.attempt_count || 0) + 1, statements = [
      env.DB.prepare('UPDATE mfa_login_challenges SET attempt_count=?,consumed_at=CASE WHEN ?>=? THEN CURRENT_TIMESTAMP ELSE consumed_at END WHERE token_hash=?').bind(attempts, attempts, MAX_ATTEMPTS, hash),
    ];
    const audit = auditStatement(options, user, 'user.mfa_failed', { attempts });
    if (audit) statements.push(audit);
    await env.DB.batch(statements);
    return failure(options, 'MFA_CODE_INVALID', attempts >= MAX_ATTEMPTS ? 'Too many unsuccessful codes. Sign in again to restart.' : 'The Authenticator or recovery code is incorrect.');
  }
  const claimed = await env.DB.prepare(`UPDATE mfa_login_challenges SET consumed_at=CURRENT_TIMESTAMP
    WHERE token_hash=? AND consumed_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP RETURNING token_hash`).bind(hash).first();
  if (!claimed) return failure(options, 'MFA_CHALLENGE_INVALID', 'This Authenticator challenge is invalid or has expired.');
  const statements = [];
  let codes = null, authenticationMethod = recovery ? 'recovery-code' : 'totp';
  if (challenge.purpose === 'enrol') {
    if (!totp) return failure(options, 'MFA_CODE_INVALID', 'Enter the current six-digit code from Microsoft Authenticator.');
    codes = recoveryCodes();
    const hashes = await Promise.all(codes.map(value => recoveryHash(value, challenge.user_id)));
    statements.push(
      env.DB.prepare("UPDATE mfa_enrolments SET status='active',last_used_counter=?,enabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(totp.counter, challenge.user_id),
      env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(challenge.user_id),
      ...hashes.map(value => env.DB.prepare('INSERT INTO mfa_recovery_codes(id,user_id,code_hash) VALUES(?,?,?)').bind(crypto.randomUUID(), challenge.user_id, value)),
    );
    authenticationMethod = 'totp-enrolment';
    const audit = auditStatement(options, user, 'user.mfa_enabled', { recoveryCodeCount: codes.length });
    if (audit) statements.push(audit);
  } else if (recovery) {
    const used = await env.DB.prepare('UPDATE mfa_recovery_codes SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL RETURNING id').bind(recovery.id).first();
    if (!used) return failure(options, 'MFA_CODE_INVALID', 'This recovery code has already been used. Sign in again to continue.');
    const audit = auditStatement(options, user, 'user.mfa_recovery_code_used', {});
    if (audit) statements.push(audit);
  } else {
    statements.push(env.DB.prepare('UPDATE mfa_enrolments SET last_used_counter=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(totp.counter, challenge.user_id));
  }
  const completed = await options.completeLogin(request, env, user, { mfaVerified: true, authenticationMethod, recoveryCodes: codes, statements });
  completed.headers.append('set-cookie', expiredChallengeCookie());
  return completed;
}

export async function claimMfaChallenge(request, env, options = {}) {
  if (!options.portalOriginAllowed(request)) return failure(options, 'INVALID_ORIGIN', 'This sign-in request was not sent by CoreCare Systems.', 403);
  const form = new URLSearchParams(await request.text()), token = String(form.get('grant') || '');
  const failureLocation = options.failureLocation || 'https://www.corecaresystems.co.uk/login?error=invalid_credentials';
  const rejected = () => new Response(null, { status: 303, headers: { location: failureLocation, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(token)) return rejected();
  const challenge = await env.DB.prepare('SELECT expires_at FROM mfa_login_challenges WHERE token_hash=? AND consumed_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP LIMIT 1').bind(await tokenHash(token)).first();
  if (!challenge) return rejected();
  const destination = new URL(options.returnPath?.(form.get('returnTo')) || '/', options.productOrigin);
  destination.searchParams.set('continue', 'mfa');
  return new Response(null, { status: 303, headers: { location: destination.toString(), 'set-cookie': challengeCookie(token, new Date(challenge.expires_at), 'Lax'), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

export async function portalGrantFromLoginResponse(loginResponse) {
  if (loginResponse.status !== 202) return null;
  const payload = await loginResponse.json().catch(() => ({}));
  const grant = clean(payload?.mfa?.challengeToken, 256);
  return grant ? { ok: true, status: 202, grant, expiresAt: payload.mfa.expiresAt, mfa: true } : { ok: false, status: 502 };
}
