/** CoreCare Cloudflare Worker */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ok:true,service:"corecare",environment:"development",timestamp:new Date().toISOString()});
    if (url.pathname === "/api/version") return json({name:"CoreCare",version:"0.3.0",sprint:"Sprint 3 — working client management"});
    if (url.pathname === "/api/capabilities") return json({modules:{dashboard:"working",clients:"working-demo",staff:"planned",carePlans:"planned",medication:"planned"},storage:"browser-local demonstration data"});
    if (url.pathname.startsWith("/api/")) return json({error:{code:"API_ROUTE_NOT_FOUND",message:"The requested API route does not exist."}},404);
    return env.ASSETS.fetch(request);
  }
};
function json(body,status=200){return new Response(JSON.stringify(body,null,2),{status,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"same-origin"}})}
