UPDATE provider_capacity
SET is_enabled = FALSE,
    updated_at = NOW()
WHERE provider_id = 'himodels'
  AND model_id LIKE 'claude-%'
  AND is_enabled = TRUE;

UPDATE providers
SET status = 'disabled',
    rejection_reason = 'Awaiting rotated credential and AWS alias verification',
    approved_at = NULL,
    updated_at = NOW()
WHERE id = 'himodels';

-- No provider_channel_configs row exists for 'himodels' (only pixverse and
-- dashscope use multi-channel routing today); nothing to reset here. Do not
-- DELETE here even if that changes: migrations must stay expand-compatible.

UPDATE provider_models
SET status = 'disabled',
    updated_at = NOW()
WHERE provider_id = 'himodels'
  AND model_id IN ('claude-opus-4-7', 'claude-fable-5');
