UPDATE password_reset_tokens
SET expires_at = datetime(created_at, '+48 hours')
WHERE consumed_at IS NULL
  AND datetime(expires_at) < datetime(created_at, '+48 hours');
