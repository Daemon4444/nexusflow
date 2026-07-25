-- Make missing health/SLA evidence explicit for existing installations.
-- NOT VALID keeps rollout safe if historical rows violate the new checks,
-- while PostgreSQL still enforces the constraints for every new write.

ALTER TABLE provider_health
  ALTER COLUMN status SET DEFAULT 'unknown';

ALTER TABLE provider_health
  ADD CONSTRAINT provider_health_status_valid
  CHECK (status IN ('unknown', 'healthy', 'degraded', 'down')) NOT VALID;

ALTER TABLE provider_sla_snapshots
  ALTER COLUMN availability DROP DEFAULT;

ALTER TABLE provider_sla_snapshots
  ADD CONSTRAINT provider_sla_snapshots_has_evidence
  CHECK (total_requests > 0) NOT VALID;

ALTER TABLE provider_sla_snapshots
  ADD CONSTRAINT provider_sla_snapshots_counts_valid
  CHECK (
    success_requests >= 0
    AND error_requests >= 0
    AND success_requests + error_requests <= total_requests
  ) NOT VALID;

ALTER TABLE provider_sla_snapshots
  ADD CONSTRAINT provider_sla_snapshots_availability_valid
  CHECK (availability >= 0 AND availability <= 100) NOT VALID;
