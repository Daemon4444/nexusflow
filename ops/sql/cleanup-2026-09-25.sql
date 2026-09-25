-- NexusFlow control-plane cleanup (offline), generated 2026-09-25T00:00:00.000Z
-- Source: fixtures backend/scripts/fixtures/bailian-2026-09-25
-- REVIEW EVERY STATEMENT. This file is generated only; nothing ran it.
-- Disable-only: no DELETE, no DROP. Run inside a maintenance window after a
-- fresh backup, and re-run control-plane-consistency afterwards.

BEGIN;

-- [route_to_unknown_model] dashscope/MiniMax-M2.7: enabled route points at a model that is not in the catalog
UPDATE provider_capacity SET is_enabled = FALSE, updated_at = NOW() WHERE provider_id = 'dashscope' AND model_id = 'MiniMax-M2.7' AND is_enabled = TRUE;

-- [route_to_unknown_model] dashscope/qwen3-tts-flash-realtime: enabled route points at a model that is not in the catalog
UPDATE provider_capacity SET is_enabled = FALSE, updated_at = NOW() WHERE provider_id = 'dashscope' AND model_id = 'qwen3-tts-flash-realtime' AND is_enabled = TRUE;

-- [override_identical_to_static] glm-5.2-fast-preview: model_overrides row equals the static entry in every pricing/limit/runtime field and differs only in display fields (supported); disabling it reverts the display to the static catalog
UPDATE model_overrides SET enabled = FALSE, updated_at = NOW() WHERE id = 'glm-5.2-fast-preview' AND action = 'upsert' AND enabled = TRUE;

COMMIT;
