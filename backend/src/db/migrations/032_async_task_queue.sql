-- P4 (NF_TRAFFIC_MODE=enforce): async task queue. Expand-only.
--
-- async_tasks.status gains the value 'queued' (status is free TEXT; no
-- constraint changes). A queued task has no upstream submission yet; its
-- billing hold stays reserved until it is dispatched or times out.
--   queued_at          FIFO order
--   queue_deadline_at  queued_at + policy max_wait_s; past it the task fails
--                      and the hold is released
--   queue_request      adapter kind + arguments needed to submit later
--                      (never credentials: the key is resolved at dispatch)
ALTER TABLE async_tasks ADD COLUMN IF NOT EXISTS queued_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE async_tasks ADD COLUMN IF NOT EXISTS queue_deadline_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE async_tasks ADD COLUMN IF NOT EXISTS queue_request JSONB;

CREATE INDEX IF NOT EXISTS idx_async_tasks_queue ON async_tasks(status, queued_at);
