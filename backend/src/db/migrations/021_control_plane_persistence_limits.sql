-- Bound and validate durable, user-created control-plane records.

ALTER TABLE rate_limit_requests
  ADD CONSTRAINT rate_limit_requests_model_length
  CHECK (length(model) BETWEEN 1 AND 128) NOT VALID;
ALTER TABLE rate_limit_requests
  ADD CONSTRAINT rate_limit_requests_reason_length
  CHECK (length(reason) <= 4096) NOT VALID;
ALTER TABLE rate_limit_requests
  ADD CONSTRAINT rate_limit_requests_values_valid
  CHECK (requested_qpm > 0 AND requested_tpm > 0) NOT VALID;
ALTER TABLE rate_limit_requests
  ADD CONSTRAINT rate_limit_requests_status_valid
  CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_requests_one_pending_model
  ON rate_limit_requests(user_id, model)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rate_limit_requests_user_created
  ON rate_limit_requests(user_id, created_at DESC);

ALTER TABLE tickets
  ADD CONSTRAINT tickets_type_length
  CHECK (length(type) BETWEEN 1 AND 32) NOT VALID;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_subject_length
  CHECK (length(subject) BETWEEN 5 AND 120) NOT VALID;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_description_length
  CHECK (length(description) BETWEEN 20 AND 5000) NOT VALID;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_model_length
  CHECK (model IS NULL OR length(model) BETWEEN 1 AND 128) NOT VALID;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_reply_length
  CHECK (admin_reply IS NULL OR length(admin_reply) <= 3000) NOT VALID;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_valid
  CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')) NOT VALID;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_requested_limits_valid
  CHECK (
    (requested_qpm IS NULL OR requested_qpm > 0)
    AND (requested_tpm IS NULL OR requested_tpm > 0)
  ) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_tickets_user_created
  ON tickets(user_id, created_at DESC);

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_name_length
  CHECK (length(name) BETWEEN 1 AND 50) NOT VALID;
