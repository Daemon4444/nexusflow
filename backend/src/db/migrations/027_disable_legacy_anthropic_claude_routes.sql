UPDATE provider_capacity
SET is_enabled = FALSE,
    updated_at = NOW()
WHERE provider_id = 'anthropic'
  AND model_id LIKE 'claude-%'
  AND is_enabled = TRUE;

UPDATE providers
SET status = 'disabled',
    rejection_reason = 'Legacy Claude routing is restricted to HiModels',
    updated_at = NOW()
WHERE id = 'anthropic'
  AND status <> 'disabled';
