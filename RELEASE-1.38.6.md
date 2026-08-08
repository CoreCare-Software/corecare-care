# CoreCare Care 1.38.6 — Platform support-origin compatibility

## Scope

- Align the production Care `PLATFORM_ORIGIN` with `https://owner.corecaresystems.co.uk`.
- Add the minimum isolated staging configuration for the existing Care staging Worker, databases, secure-file bucket and Platform staging service binding.
- When no authorised local owner login exists, create a target-organisation internal Platform support principal with no password credentials and assign the active Care branch to the support session.
- End cross-product support sessions, clear the Care runtime cookie and return to the configured Platform origin through the existing audited exit action.
- Preserve the exact-origin check, single-use grants, session expiry, audit, tenant isolation and read-only enforcement.

No production migration, secret rotation, route change, binding replacement or unrelated Care feature is included.

## Staging gate

The first staging deployment used the Care 1.38.5 application source with release metadata 1.38.6 and the origin/configuration remediation only. It reached Care, exchanged the grant successfully and then returned `The Platform user is not authorised in CoreCare Care.` before creating any local session. That captured failure triggered the authorised compatibility gate described above.

Required evidence includes the browser `/platform-access` response, Platform exchange response, consumed grant, Care runtime and support-session records, secure cookie, support banner, read-only denial, safe exit, paired audit records, replay and expiry denial, and a clean repeatable browser console.

## Production promotion

Production remains frozen pending separate approval. A future production change must deploy only this reviewed Care hotfix, verify the active Platform rollback version first, capture a Care rollback version, run one fictional read-only support journey and immediately roll back Care for any High regression.

## Rollback

Before any production promotion, record the active Care version. Roll back the Care Worker to that exact version if verification fails. No D1 migration is part of this release.
