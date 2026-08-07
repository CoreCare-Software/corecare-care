# CoreCare Care 2.1.0

- Adds user-initiated rewriting for eligible editable text areas.
- Keeps the original wording unchanged until the signed-in user reviews and accepts the suggestion.
- Uses the private CoreCare Platform `AiRewriteBroker`; no AI API key is stored in Care.
- Supplies organisation and user identity from the validated Care session, including the deliberately limited family and care-worker routes.
- Enforces temporary-password, subscription, module and support-mode controls before the rewrite route is reached.
