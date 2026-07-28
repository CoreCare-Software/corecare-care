/**
 * Project Forget Me Not — Cloudflare Worker entry point.
 *
 * Static application files are served from /public by Cloudflare Workers
 * Static Assets. API routes run through this Worker first.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "forget-me-not",
        environment: "development",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/version") {
      return json({
        name: "Project Forget Me Not",
        version: "0.1.0",
        sprint: "Sprint 1 — Cloudflare foundation"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        {
          error: {
            code: "API_ROUTE_NOT_FOUND",
            message: "The requested API route does not exist."
          }
        },
        404
      );
    }

    return env.ASSETS.fetch(request);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin"
    }
  });
}
