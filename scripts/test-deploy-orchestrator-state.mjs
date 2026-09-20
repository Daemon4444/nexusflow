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
  "write_terminal_telemetry_outbox"
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
const providerCostContract = Object.fromEntries(
  ["TIERS", "MODELS", "FULL_TIERS", "PARTIAL_TIERS"].map((name) => {
    const match = source.match(
      new RegExp(`^PROVIDER_COST_EXPECTED_${name}=([1-9][0-9]*)$`, "m")
    );
    assert.ok(match, `missing positive PROVIDER_COST_EXPECTED_${name}`);
    return [name, Number(match[1])];
  })
);
assert.equal(
  providerCostContract.TIERS,
  providerCostContract.FULL_TIERS + providerCostContract.PARTIAL_TIERS,
  "provider cost tier classes must add up to the total tier count"
);
assert.ok(
  providerCostContract.TIERS >= providerCostContract.MODELS,
  "provider cost tiers cannot be fewer than covered models"
);
assert.match(
  activation,
  /--expected-models "\$PROVIDER_COST_EXPECTED_MODELS"/
);
assert.match(
  activation,
  /--expected-full-tiers "\$PROVIDER_COST_EXPECTED_FULL_TIERS"/
);
assert.match(
  activation,
  /--expected-partial-tiers "\$PROVIDER_COST_EXPECTED_PARTIAL_TIERS"/
);
assert.match(
  source,
  /session_security_command posture --expect hash-only \|\|\n\s+release_die "deployed session token posture is not hash-only"/
);
assert.match(
  source,
  /flock -n 8 \|\|\n\s+release_die "another NexusFlow database backup is already running"/
);
assert.ok(
  source.indexOf("trap cleanup_early_release_staging EXIT")
    < source.indexOf("release_require_command curl"),
  "private manifest cleanup must be armed before command, lock, git, and release preflights"
);
assert.match(
  source,
  /if ! "\$VERIFY_ONLY" && ! "\$DRY_RUN" &&\n\s+test -n "\$PROVIDER_COST_MANIFEST"; then/
);
assert.match(
  source,
  /"\$EARLY_MANIFEST_CLEANUP_ARMED" &&\n\s+"\$RELEASE_LOCK_ACQUIRED"; then/
);
assert.match(
  source,
  /flock -n 9 \|\| release_die "another NexusFlow production release is already running"\nRELEASE_LOCK_ACQUIRED=true/
);
assert.match(
  source,
  /if ! "\$VERIFY_ONLY" && ! "\$DRY_RUN"; then\n\s+mkdir -p "\$\(dirname "\$DB_BACKUP_LOCK_FILE"\)"/
);

assert.equal(
  source.split("candidate=\\$(readlink -f '$CURRENT_LINK' 2>/dev/null)").length - 1,
  3,
  "peer baseline verification, capability capture, and static capture must resolve the current link explicitly"
);
assert.equal(
  source.split('&& test -d \\"\\$candidate\\"; then').length - 1,
  3,
  "peer baseline verification, capability capture, and static capture must reject a missing current-link target"
);
assert.match(
  source,
  /"\$BASELINE_RELEASE_DIRECTORY\/scripts\/deploy-production\.sh" verify --sha "\$BASELINE_SHA"/,
  "local rollback verification must use the baseline release policy"
);
assert.ok(
  source.includes('&& \\"\\$baseline/scripts/deploy-production.sh\\" verify --sha'),
  "peer rollback verification must use the baseline release policy"
);
assert.doesNotMatch(
  source,
  /readlink -f '\$CURRENT_LINK' 2>\/dev\/null \|\| printf/,
  "GNU readlink -f may succeed for a missing final component and cannot select the legacy fallback alone"
);

console.log("deploy-orchestrator-provider-cost-call-graph-ok");
