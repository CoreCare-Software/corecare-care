# CoreCare Care 2.0.4

This release makes printed client visit-verification QR codes genuinely fixed.

- Generates one high-entropy active code when a client is created.
- Keeps that code assigned to the same organisation and client without an automatic expiry.
- Prints a self-contained SVG QR sheet that remains usable until deliberate regeneration.
- Requires the existing visit-code management permission to view or regenerate a code.
- Revokes every previous printout immediately when an authorised manager regenerates the code.
- Retains revoked codes and audit events rather than overwriting verification history.
- Allows repeated regeneration through an active-only unique database rule.
- Adds database triggers that reject cross-organisation client/code assignments.
