# CoreCare Care 1.38.1

Release 1.38.1 corrects the Owner Portal launch route used by CoreCare Care.

## Included

- Replaces the retired `platform.corecare.co.uk` address with the live protected custom domain at `owner.corecaresystems.co.uk`.
- Keeps the direct `workers.dev` production address disabled so the Owner Platform remains available only through its managed domain and native owner authentication with mandatory MFA.
- Updates deployed asset versions so browsers receive the corrected link immediately instead of reusing a cached application script.
