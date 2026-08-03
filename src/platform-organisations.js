const PRODUCT_CODE = 'CARE';
const clean = (value, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength);
const json = (payload, status = 200) => Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });

async function authorised(request, env) {
  const supplied = clean(request.headers.get('x-corecare-product-key'), 4_000);
  const expected = clean(env.CORECARE_PRODUCT_KEY, 4_000);
  if (!expected) return { error: json({ error: { code: 'PRODUCT_KEY_NOT_CONFIGURED', message: 'Care product control is not configured.' } }, 503) };
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(supplied)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const a = new Uint8Array(left); const b = new Uint8Array(right); let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0 && supplied ? { ok: true } : { error: json({ error: { code: 'INVALID_PRODUCT_CREDENTIALS', message: 'Product credentials are invalid.' } }, 401) };
}

async function careSummary(env, organisation) {
  const [branches, users, clients, staff, plans, tickets] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM branches WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM users WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM clients WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM staff WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM care_plans WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) open FROM platform_support_tickets WHERE organisation_id=?1 AND (source_product='CARE' OR product_id='product-care')").bind(organisation.id).first(),
  ]);
  return {
    productCode: PRODUCT_CODE,
    organisation: { id: organisation.id, externalId: organisation.id, name: organisation.name, status: organisation.status },
    metrics: {
      branches: Number(branches?.total || 0), activeBranches: Number(branches?.active || 0),
      users: Number(users?.total || 0), activeUsers: Number(users?.active || 0),
      clients: Number(clients?.total || 0), activeClients: Number(clients?.active || 0),
      staff: Number(staff?.total || 0), activeStaff: Number(staff?.active || 0),
      carePlans: Number(plans?.total || 0), activeCarePlans: Number(plans?.active || 0),
      supportTickets: Number(tickets?.total || 0), openSupportTickets: Number(tickets?.open || 0),
    },
  };
}

export async function handlePlatformOrganisation(request, env, requestedExternalId = '') {
  const auth = await authorised(request, env); if (auth.error) return auth.error;
  if (!env.DB) return json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Care organisation storage is unavailable.' } }, 503);
  if (request.method === 'POST' && !requestedExternalId) {
    const input = await request.json().catch(() => ({})); const source = input.organisation || {};
    const platformId = clean(source.id, 160); const externalId = clean(source.external_id || platformId, 160); const name = clean(source.name, 240);
    if (!platformId || !name) return json({ error: { code: 'INVALID_ORGANISATION', message: 'Organisation id and name are required.' } }, 400);
    let organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 OR id=?2 LIMIT 1').bind(platformId, externalId).first();
    if (!organisation) {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'corecare-care'}-${platformId.slice(-8).toLowerCase()}`;
      await env.DB.prepare("INSERT INTO organisations(id,name,slug,status,subscription_plan) VALUES(?1,?2,?3,'active','development')").bind(platformId, name, slug).run();
    } else {
      await env.DB.prepare("UPDATE organisations SET name=?1,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?2").bind(name, organisation.id).run();
    }
    organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 OR id=?2 LIMIT 1').bind(platformId, externalId).first();
    const branch = await env.DB.prepare("SELECT id FROM branches WHERE organisation_id=?1 AND status='active' ORDER BY created_at LIMIT 1").bind(organisation.id).first();
    if (!branch) await env.DB.prepare("INSERT INTO branches(id,organisation_id,name,code,status) VALUES(?1,?2,'Main Branch','MAIN','active')").bind(`${organisation.id}-main`, organisation.id).run();
    const productSummary = await careSummary(env, organisation);
    return json({ ok: true, protocol: 'corecare-platform-organisation/1', organisation: { id: platformId, external_id: organisation.id, name: organisation.name, status: organisation.status }, summary: productSummary.metrics }, 201);
  }
  if (request.method === 'GET' && requestedExternalId) {
    const organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 LIMIT 1').bind(requestedExternalId).first();
    if (!organisation) return json({ error: { code: 'ORGANISATION_NOT_FOUND', message: 'The Care organisation was not found.' } }, 404);
    return json({ ok: true, ...(await careSummary(env, organisation)) });
  }
  return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to provision or GET to inspect an organisation.' } }, 405);
}
