/** CoreCare Cloudflare Worker — v0.4.0 cloud foundation */
const VERSION = "0.4.0";
const DEMO_ORGANISATION_ID = "org-demo";
const DEMO_USER_ID = "user-demo-owner";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "corecare",
          version: VERSION,
          database: Boolean(env.DB),
          timestamp: new Date().toISOString()
        });
      }

      if (url.pathname === "/api/version") {
        return json({ name: "CoreCare", version: VERSION, sprint: "Sprint 4A — D1 cloud foundation" });
      }

      if (url.pathname === "/api/capabilities") {
        return json({
          modules: { dashboard: "working", clients: env.DB ? "cloud-database" : "browser-fallback", staff: "planned" },
          storage: env.DB ? "Cloudflare D1" : "browser-local fallback",
          authentication: "demonstration session only — production authentication is next"
        });
      }

      if (url.pathname === "/api/database") {
        if (!env.DB) return json({ configured: false, message: "D1 binding DB has not been added yet." });
        const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
        return json({ configured: true, tables: result.results.map((row) => row.name) });
      }

      if (url.pathname === "/api/clients") {
        if (!env.DB) return databaseRequired();
        if (request.method === "GET") return listClients(env.DB);
        if (request.method === "POST") return createClient(request, env.DB);
        return methodNotAllowed(["GET", "POST"]);
      }

      const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
      if (clientMatch) {
        if (!env.DB) return databaseRequired();
        const id = decodeURIComponent(clientMatch[1]);
        if (request.method === "PUT") return updateClient(request, env.DB, id);
        return methodNotAllowed(["PUT"]);
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: { code: "API_ROUTE_NOT_FOUND", message: "The requested API route does not exist." } }, 404);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("CoreCare request failed", error);
      return json({ error: { code: "INTERNAL_ERROR", message: "CoreCare could not complete the request." } }, 500);
    }
  }
};

async function listClients(db) {
  const result = await db.prepare(`
    SELECT id, first_name, last_name, date_of_birth, nhs_number, town,
           care_package, next_review, status, risk
    FROM clients
    WHERE organisation_id = ?
    ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE
  `).bind(DEMO_ORGANISATION_ID).all();
  return json({ clients: result.results.map(toClient) });
}

async function createClient(request, db) {
  const input = await readJson(request);
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO clients (
      id, organisation_id, first_name, last_name, date_of_birth, nhs_number,
      town, care_package, next_review, status, risk
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, DEMO_ORGANISATION_ID, clean(input.firstName), clean(input.lastName), input.dateOfBirth,
    clean(input.nhsNumber), clean(input.town), clean(input.carePackage), input.nextReview,
    input.status, input.risk
  ).run();
  await audit(db, "client.created", "client", id, { firstName: input.firstName, lastName: input.lastName });
  return json({ client: { ...normaliseClient(input), id } }, 201);
}

async function updateClient(request, db, id) {
  const input = await readJson(request);
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);

  const result = await db.prepare(`
    UPDATE clients SET
      first_name = ?, last_name = ?, date_of_birth = ?, nhs_number = ?, town = ?,
      care_package = ?, next_review = ?, status = ?, risk = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organisation_id = ?
  `).bind(
    clean(input.firstName), clean(input.lastName), input.dateOfBirth, clean(input.nhsNumber),
    clean(input.town), clean(input.carePackage), input.nextReview, input.status, input.risk,
    id, DEMO_ORGANISATION_ID
  ).run();

  if (!result.meta.changes) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
  await audit(db, "client.updated", "client", id, { firstName: input.firstName, lastName: input.lastName });
  return json({ client: { ...normaliseClient(input), id } });
}

async function audit(db, action, entityType, entityId, detail) {
  await db.prepare(`
    INSERT INTO audit_log (id, organisation_id, user_id, action, entity_type, entity_id, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), DEMO_ORGANISATION_ID, DEMO_USER_ID, action, entityType, entityId, JSON.stringify(detail)).run();
}

function validateClient(input) {
  if (!input || typeof input !== "object") return "A valid client record is required.";
  for (const field of ["firstName", "lastName", "dateOfBirth", "town", "nextReview", "status", "risk"]) {
    if (!String(input[field] ?? "").trim()) return `The ${field} field is required.`;
  }
  if (!["Active", "Paused", "Archived"].includes(input.status)) return "Invalid client status.";
  if (!["Standard", "Medium", "High"].includes(input.risk)) return "Invalid risk level.";
  return null;
}

function normaliseClient(input) {
  return {
    firstName: clean(input.firstName), lastName: clean(input.lastName), dateOfBirth: input.dateOfBirth,
    nhsNumber: clean(input.nhsNumber), town: clean(input.town), carePackage: clean(input.carePackage),
    nextReview: input.nextReview, status: input.status, risk: input.risk
  };
}

function toClient(row) {
  return {
    id: row.id, firstName: row.first_name, lastName: row.last_name, dateOfBirth: row.date_of_birth,
    nhsNumber: row.nhs_number || "", town: row.town, carePackage: row.care_package || "",
    nextReview: row.next_review, status: row.status, risk: row.risk
  };
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Expected application/json");
  return request.json();
}

function clean(value) { return String(value ?? "").trim().slice(0, 500); }
function databaseRequired() { return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "Add the Cloudflare D1 binding named DB and run the migration." } }, 503); }
function methodNotAllowed(allow) { return new Response(null, { status: 405, headers: { Allow: allow.join(", ") } }); }
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()"
    }
  });
}
