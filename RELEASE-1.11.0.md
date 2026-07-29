# CoreCare Enterprise 1.11.0 — Low-Cost Travel-Aware Scheduling

Adds provider-based routing with a no-cost manual fallback, optional Mapbox routing, long-lived route caching, parking buffers, travel conflict protection, permission-controlled overrides, audit history, and visible travel blocks on the rota.

Configure the optional Mapbox token with:

```powershell
npx.cmd wrangler secret put MAPBOX_ACCESS_TOKEN
```

Mapbox is optional. Without it, CoreCare uses the organisation fallback travel time and buffer.
