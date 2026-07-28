import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(
  path.join(repositoryRoot, "scripts/deploy-all-production.sh"),
  "utf8"
);

function functionBody(name, nextName) {
  const start = source.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName
    ? source.indexOf(`${nextName}() {`, start)
    : source.length;
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

function assertOrdered(body, labels) {
  let cursor = -1;
  for (const label of labels) {
    const next = body.indexOf(label, cursor + 1);
    assert.notEqual(next, -1, `missing ordered state-machine edge: ${label}`);
    assert.ok(next > cursor, `state-machine edge is out of order: ${label}`);
    cursor = next;
  }
}

const activation = functionBody(
  "provider_cost_activate",
  "provider_cost_prepare_baseline_rollback"
);
assertOrdered(activation, [
  "PROVIDER_COST_ACTIVATION_STARTED=true",
  "provider_cost_release_command activate",
  "provider_cost_verify_active",
  "PROVIDER_COST_BOOK_APPLIED=true",
]);

const rollbackPreparation = functionBody(
  "provider_cost_prepare_baseline_rollback",
  "provider_cost_commit_verified_baseline_rollback"
);
assertOrdered(rollbackPreparation, [
  "PROVIDER_COST_ROLLBACK_TRANSITION_STARTED=true",
  "provider_cost_release_command deactivate",
  "provider_cost_release_command verify-inactive",
  "PROVIDER_COST_DEACTIVATED_FOR_ROLLBACK=true",
]);

const recovery = functionBody(
  "provider_cost_recover_after_failed_rollback",
  "cleanup_provider_cost_manifest"
);
assertOrdered(recovery, [
  '"$TRAFFIC_HOOK" route "$recovery_node"',
  '"$TRAFFIC_HOOK" assert "$recovery_node"',
  'RECOVERY_TRAFFIC_MODE="$recovery_node"',
  "provider_cost_activate",
]);

const peerRollback = functionBody(
  "rollback_both_from_peer",
  "rollback_both_from_local"
);
assertOrdered(peerRollback, [
  '"$TRAFFIC_HOOK" route peer',
  "provider_cost_prepare_baseline_rollback",
  '"$SCRIPT_DIR/deploy-production.sh" rollback',
  "rollback_peer_while_local_serves",
  "provider_cost_commit_verified_baseline_rollback",
  '"$TRAFFIC_HOOK" route balanced',
]);

const localRollback = functionBody(
  "rollback_both_from_local",
  ""
);
assertOrdered(localRollback, [
  '"$TRAFFIC_HOOK" route local',
  "provider_cost_prepare_baseline_rollback",
  "rollback_peer_while_local_serves",
  '"$SCRIPT_DIR/deploy-production.sh" rollback',
  "provider_cost_commit_verified_baseline_rollback",
  '"$TRAFFIC_HOOK" route balanced',
]);

const normalActivation = source.lastIndexOf(
  'release_log "privately validating and activating the reviewed provider cost price book"'
);
const sessionCutover = source.lastIndexOf("session_security_forward_cutover");
const balanced = source.lastIndexOf('"$TRAFFIC_HOOK" route balanced');
assert.ok(normalActivation > 0, "normal rollout must activate the provider price book");
assert.ok(
  normalActivation < sessionCutover && sessionCutover < balanced,
  "price-book activation must precede terminal session/balanced cutover"
);

const cleanup = functionBody("cleanup_local", "");
assert.ok(
  cleanup.includes("provider_cost_recover_after_failed_rollback"),
  "failure cleanup must recover a deactivated book"
);
assert.ok(
  cleanup.includes("cleanup_provider_cost_manifest"),
  "failure cleanup must remove private staging"
);
assertOrdered(source.slice(normalActivation), [
  "provider_cost_activate",
  "provider_cost_verify_active",
  "RELEASE_LIVE=true",
  "cleanup_provider_cost_manifest",
  "telemetry_retry telemetry_event succeeded",
]);

for (const capabilityFile of [
  "scripts/build-release-artifact.sh",
  "scripts/deploy-production.sh",
]) {
  const value = fs.readFileSync(path.join(repositoryRoot, capabilityFile), "utf8");
  assert.match(value, /providerCostTiers/);
}
assert.match(
  source,
  /BASELINE_PROVIDER_COST_CAPABLE=true/
);
assert.match(
  source,
  /PEER_BASELINE_PROVIDER_COST_CAPABLE=true/
);

console.log("deploy-orchestrator-provider-cost-call-graph-ok");
