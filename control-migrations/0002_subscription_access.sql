ALTER TABLE corecare_platform_entitlements ADD COLUMN access_json TEXT NOT NULL DEFAULT '{"mode":"locked","reason":"entitlement_unavailable","billingRequired":true,"subscriptionStatus":"unknown"}';
ALTER TABLE corecare_platform_entitlements ADD COLUMN subscription_json TEXT NOT NULL DEFAULT '{}';
