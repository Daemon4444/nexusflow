# NexusFlow Immutable Production Release Runbook

This runbook is the authority for deploying the two NexusFlow application
nodes behind Alibaba Cloud ALB. It intentionally fails closed. A release is not
allowed to fall back to building in the live source tree or to a rolling deploy
without real traffic drain.

## 1. Safety model

The production release has these invariants:

- Backend and frontend are built once in an isolated directory.
- The exact same compressed artifact is copied to both nodes.
- Every immutable regular file in the artifact has a SHA-256 manifest.
- Next.js `BUILD_ID` and `X-NexusFlow-Build-Sha` equal the full Git SHA.
- A node may switch releases only after exact ALB health checks return 503,
  public node probes prove that only the other node receives new traffic, and
  established port 80 connections have drained.
- PostgreSQL is backed up and verified before migration. Persistent dumps are
  age-encrypted; application nodes hold only public recipients, while the
  private identity remains on the offsite restore verifier.
- Migrations run once while holding a PostgreSQL advisory lock.
- The reviewed private Provider cost manifest is never committed or packaged.
  Only after migration `019` and both new binaries verify, it is dry-run,
  applied, and checked as the exact 13-tier price book
  `pb-19cfc14c11f74a74ac7438c5`.
- Deployment events and verified runtime-node facts are recorded only after
  migration `014` has created their real control-plane tables.
- The current and previous releases are atomic symbolic links.
- Both live nodes must report and verify the same pre-release SHA. That SHA is
  captured as the only acceptable rollback baseline.
- The previous releases and active static files from both nodes remain
  available for rollback and for browser tabs that still reference old chunks.

The deployment directories are:

```text
/root/distiny/nexusflow
/root/distiny/nexusflow-artifacts
/root/distiny/nexusflow-releases/<full-git-sha>
/root/distiny/nexusflow-current
/root/distiny/nexusflow-previous
```

The Git checkout is a control plane. New releases do not run `npm ci` or
`next build` in the active application directory.

`backend/.env` is deliberately not part of the artifact or manifest. Both the
builder and installer reject an artifact that contains it. After manifest
verification, the installer creates the one runtime configuration symlink to
the configured root-only environment file; install, activation, and
verification all resolve that link and require it to point to the configured
source. This keeps secrets out of the artifact without allowing an unverified
environment target.

## 2. Verified production facts and remaining remediation

The following facts were verified on 2026-07-28:

1. ALB checks each node with high-frequency `HEAD /api/health`,
   `User-Agent: SLBHealthCheck`, from `172.27.219.57` or `172.27.197.226`.
2. Both nodes run nginx on port 80 and support validated reloads.
3. The attached `NexusFlowCertSyncRole` still receives `ImplicitDeny` for ALB
   ServerGroup reads. The optional API-weight hook therefore remains
   unavailable, but it is not the default release path.
4. Host `pg_dump` and `psql` are not installed.
5. The old `/root/backups/pg_backup.sh` runs `docker exec quadrant-postgres`,
   but that local container has been stopped since the RDS cutover. Backups
   dated 2026-07-26 through 2026-07-28 are 20-byte invalid gzip files.
6. The real ALB health contract is `HEAD /api/health` with
   `User-Agent: SLBHealthCheck` from its two verified VPC addresses. A separate
   client repeatedly calls `GET /v1/health`, which the legacy runtime returns
   as 404. This release adds a compatibility alias backed by the same
   dependency-aware handler as `/api/health`; verify that it becomes healthy
   after rollout. It remains outside the ALB drain and release-health
   contracts.

The default release path uses the verified health check to drain traffic
without ALB RAM access. Database tooling uses `postgres:16-alpine` and the
deployed database settings. The application nodes now have the verified `age`
CLI, and the offsite host has `age` plus a rootful Podman Docker-compatible
runtime. The PostgreSQL 16 image, private identity, exact verifier hook, and
full encrypted restore must still pass preflight before rollout. The broken
daily cron also needs the RDS-aware replacement below; the release-specific
backup gate does not trust it.

## 3. Default health-check drain

The one-time nginx control installation must be completed on both nodes before
the first immutable release:

```bash
# On the main node
cd /root/distiny/nexusflow
bash scripts/install-nginx-health-drain.sh \
  /etc/nginx/conf.d/nexusflow.conf main

# Copy only the bootstrap controls to the peer; the release later aligns Git.
scp scripts/nginx-health-drain-node.sh \
    scripts/install-nginx-health-drain.sh \
    ops/nginx/nexusflow-v1-location.conf \
    root@172.27.219.55:/tmp/
ssh root@172.27.219.55 '
  chmod 0755 /tmp/nginx-health-drain-node.sh /tmp/install-nginx-health-drain.sh
  NEXUSFLOW_SOURCE_V1_LOCATION_CONFIG=/tmp/nexusflow-v1-location.conf \
    /tmp/install-nginx-health-drain.sh \
    /etc/nginx/conf.d/nexusflow-ha.conf peer
  rm -f \
    /tmp/nginx-health-drain-node.sh \
    /tmp/install-nginx-health-drain.sh \
    /tmp/nexusflow-v1-location.conf
'
```

The installer:

- atomically installs the root-owned helper at
  `/usr/local/sbin/nexusflow-nginx-health-drain-node`;
- creates root-owned `/etc/nginx/nexusflow-drain.conf` in `disabled` state;
- creates root-owned
  `/etc/nginx/conf.d/nexusflow-audio-guards.conf` with per-client request and
  connection zones;
- atomically updates the existing root-owned
  `/etc/nginx/snippets/nexusflow-v1-location.conf` default ingress policy;
- includes it inside every NexusFlow nginx server block;
- runs `nginx -t`, reloads, and verifies the direct node probe;
- restores the previous helper, site, drain config, audio guard config, and
  default v1 policy if any step fails.

When enabled, the config returns 503 only if all four facts match:

```text
source IP = 172.27.219.57 or 172.27.197.226
method    = HEAD
URI       = /api/health
user-agent= SLBHealthCheck
```

Wrong method, URI, user-agent, or source continues to the normal application.
The public `GET /__nexusflow_release_probe_9f3b` returns only `main` or `peer`
with `Cache-Control: no-store`; it contains no secret or application data.

The managed server include and the existing `/v1/` location's managed snippet
split `/v1` ingress by exact contract:

- `/v1/chat/completions`, `/v1/responses`, and `/v1/messages`: 50 MiB,
  30-second inter-read timeout and a deliberately high per-IP edge fuse;
- `/v1/embeddings`: 8 MiB and a 15-second inter-read timeout;
- `/v1/audio/transcriptions`: 1 MiB, 10-second inter-read timeout, two
  concurrent requests and 6 requests/minute with a burst of two;
- every other `/v1/` route: the existing prefix location keeps its proxy
  behavior while the managed snippet enforces 1 MiB and a 10-second inter-read
  timeout.

Per-IP policies are not customer quotas. Authenticated keys inherit
account/model QPM/TPM, and only explicit key overrides add a narrower limit;
IP thresholds exist solely to bound gross NAT/DDoS failure modes.

The five exact policies disable request buffering so the backend's API-key,
per-key/IP/global admission runs before the large body is streamed; the
existing default `/v1/` location retains its unbuffered proxy behavior.
Response buffering is also disabled to preserve SSE. The audio backend accepts
only small fields/`file_url` and rejects binary multipart parts without disk
storage, so there is no dead 50 MiB audio upload surface. The ALB real-IP chain
must remain configured so limits do not collapse all customers onto a load
balancer address. Preflight now requires both `real_ip_header` and at least one
trusted `set_real_ip_from` directive. Nginx OSS does not provide a trustworthy
generic minimum-upload-bandwidth directive; size caps, inter-read timeouts,
connection caps, and request rates are the enforced slow-upload controls.
Before production admission, probe representative exact and prefix routes over
plain public HTTP and confirm they redirect to HTTPS or reject the request;
this detects a port-80 config whose old redirect lived only in `location /`
and would otherwise be bypassed by the new exact locations. Also exercise the
limit from two real external client IPs to prove the effective key is not the
ALB address.

The public Next aliases `/proxy/v1`, `/proxy/v1/*`, `/api/proxy/v1`, and
`/api/proxy/v1/*` return 404 at nginx. They must never provide a second route
around the `/v1` body/admission policies, even if a future frontend proxy
handler regresses. Upload ingress is separately bounded:

- `/api/upload`: 101 MiB including multipart overhead, 30-second inter-read
  timeout, two concurrent uploads and 12 starts/minute per real client IP;
- `/api/uploads/*`: eight concurrent downloads, 120 starts/minute, then
  10 MiB/s per connection after the first MiB.

Both are unbuffered at nginx so frontend authentication can happen before body
consumption and fixed-size downloads can stream without a full Next.js
`arrayBuffer`. Acceptance must include anonymous oversized requests with both
`Content-Length` and chunked transfer, plus concurrent near-limit downloads
while observing frontend RSS. A rejected request must not create a temporary
upload or grow the frontend process toward the object size.

The default `scripts/nginx-health-traffic-hook.sh`:

1. verifies that the installed helper on both nodes is byte-identical to the
   release source and root-owned;
2. refuses to start unless both nodes are undrained and publicly observable;
3. admits the destination node before excluding the other, so both cannot be
   drained at once;
4. atomically enables the drain config and validates nginx;
5. requires consecutive real ALB health-check 503s;
6. requires 30 consecutive public probes to identify only the intended node;
7. waits for established port 80 connections to reach zero;
8. restores health checks in its EXIT/signal trap if a transition fails.

The hook uses a root lock to serialize transitions. The outer deploy
orchestrator also tracks the last known-good traffic mode and restores it on an
unexpected exit.

Supported read-only and transition commands are:

```bash
scripts/nginx-health-traffic-hook.sh preflight
scripts/nginx-health-traffic-hook.sh status
scripts/nginx-health-traffic-hook.sh route local
scripts/nginx-health-traffic-hook.sh route peer
scripts/nginx-health-traffic-hook.sh route balanced
scripts/nginx-health-traffic-hook.sh assert balanced
```

Do not call `nginx-health-drain-node` directly during a release.

### Optional ALB API-weight hook

Use a dedicated ECS RAM role or CLI profile. Minimum ALB actions:

```text
alb:ListServerGroupServers
alb:UpdateServerGroupServersAttribute
```

Resource scope should be limited to the NexusFlow ServerGroup. The hook first
calls the update API with `DryRun=true`; missing write permission blocks even
`--dry-run`.

Export the non-secret production identifiers in a root-only environment file
or service wrapper:

```bash
export NEXUSFLOW_ALIYUN_RAM_ROLE='<dedicated-release-role>'
export NEXUSFLOW_ALB_REGION='cn-beijing'
export NEXUSFLOW_ALB_SERVER_GROUP_ID='<server-group-id>'
export NEXUSFLOW_ALB_LOCAL_SERVER_ID='<main-ecs-instance-id>'
export NEXUSFLOW_ALB_PEER_SERVER_ID='<peer-ecs-instance-id>'
export NEXUSFLOW_ALB_LOCAL_PORT='80'
export NEXUSFLOW_ALB_PEER_PORT='80'
```

Alternatively set `NEXUSFLOW_ALIYUN_PROFILE` to a root-only CLI profile. Never
put AccessKey material in the repository or a command line.

After those permissions exist, operators may explicitly select
`scripts/alb-traffic-hook.aliyun.sh` with `NEXUSFLOW_TRAFFIC_HOOK`. It refuses
to operate unless the ServerGroup contains exactly the two configured servers.
Its modes are:

```bash
scripts/alb-traffic-hook.aliyun.sh preflight
scripts/alb-traffic-hook.aliyun.sh status
scripts/alb-traffic-hook.aliyun.sh route local
scripts/alb-traffic-hook.aliyun.sh route peer
scripts/alb-traffic-hook.aliyun.sh route balanced
scripts/alb-traffic-hook.aliyun.sh assert balanced
```

Weights are `100/0`, `0/100`, and `100/100`. Both server weights change in one
ALB API call, and the hook waits for both server statuses to become
`Available`. As of 2026-07-28 this optional path correctly fails closed because
`NexusFlowCertSyncRole` lacks the permissions.

## 4. Database backup and migration gate

`scripts/db-backup-hook.sh`:

- reads either `DATABASE_URL` or the deployed `PG_HOST`/`PG_PORT`/`PG_USER`/
  `PG_PASSWORD`/`PG_DATABASE` fields from the existing root-only backend
  environment;
- verifies that its temporary `postgres:16-alpine` client reports PostgreSQL
  major version 16;
- streams custom-format `pg_dump` directly into `age`, so plaintext is never
  written to a host file;
- accepts only a root-owned, non-writable public recipients file on an
  application node; it never accepts an age private identity there;
- writes only `nexusflow-pre-release-<utc>-<sha>.dump.age`;
- requires the backup directory to be root:root `0700` and each encrypted
  dump/partial to be root:root `0600`;
- requires a minimum size of 64 KiB by default;
- checks the age v1 envelope locally and streams it over strict-host-key SSH to
  the offsite verifier;
- requires that verifier to authenticate the complete age payload, validate
  the TOC with PostgreSQL 16, restore with `--exit-on-error` into an isolated
  PostgreSQL 16 container, check the core schema and migration ledger, and
  only then atomically archive the encrypted file.

Only the selected database connection fields are passed through the temporary
container environment. For `DATABASE_URL`, the password is removed before the
non-secret URI is supplied to libpq and is passed separately as `PGPASSWORD`;
passwords are never put in command arguments or printed. The container is
removed after use. The offsite identity is root:root `0600` and is never copied
to either application node, the repository, an artifact, a command argument,
or logs. Missing recipient material, private identity, PostgreSQL 16 image,
SSH host verification, authenticated decryption, or full restore is a hard
release failure.

`pg_restore --list` reads only the archive TOC and can close its input before
`age` reaches EOF. The verifier first decrypts the complete payload to
`/dev/null` and requires authentication. Only then may the TOC pipeline accept
age status `0` or SIGPIPE `141`, and only when `pg_restore` itself returned
`0`. Truncated or modified ciphertext cannot pass.

### One-time encrypted-backup installation

Install `age` on the application nodes. Install `age` and Docker (or rootful
Podman) on the offsite host, then pull the PostgreSQL 16 image. For
Debian/Ubuntu, using the distribution's reviewed package source:

```bash
apt-get update
apt-get install -y age docker.io
docker pull postgres:16-alpine
docker run --rm postgres:16-alpine postgres --version
```

The last command must report `16.x`; do not fall back to the offsite host's
PostgreSQL 13 client.

Generate the identity only on the offsite host. These commands never print the
private identity:

```bash
install -d -o root -g root -m 0700 /etc/nexusflow
umask 077
age-keygen -o /etc/nexusflow/backup-age-identity.txt 2>/dev/null
age-keygen -y \
  -o /etc/nexusflow/backup-age-recipients.txt \
  /etc/nexusflow/backup-age-identity.txt
chown root:root \
  /etc/nexusflow/backup-age-identity.txt \
  /etc/nexusflow/backup-age-recipients.txt
chmod 0600 /etc/nexusflow/backup-age-identity.txt
chmod 0644 /etc/nexusflow/backup-age-recipients.txt
install -d -o root -g root -m 0700 \
  /var/lib/nexusflow-backup-restore/incoming \
  /root/offsite/nexusflow-db
```

Install the verifier without a predictable remote staging filename:

```bash
ssh root@<offsite-host> \
  'install -o root -g root -m 0755 /dev/stdin /usr/local/sbin/nexusflow-db-backup-restore-verify' \
  < scripts/offsite-db-backup-restore-verify.sh
```

Copy only `backup-age-recipients.txt` to each application node and install it
as root:root `0644`. Never copy `backup-age-identity.txt`:

```bash
install -d -o root -g root -m 0755 /etc/nexusflow
install -o root -g root -m 0644 \
  /path/from/offsite/backup-age-recipients.txt \
  /etc/nexusflow/backup-age-recipients.txt
```

Configure the non-secret target in the root-only release wrapper:

```bash
export NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOST='root@<offsite-host>'
export NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOOK='/usr/local/sbin/nexusflow-db-backup-restore-verify'
```

Populate `known_hosts` out of band and retain `StrictHostKeyChecking=yes`.
Preflight verifies the offsite hook owner/mode, age keypair round-trip, private
directories, and PostgreSQL 16 image without printing key material:

```bash
ssh root@<offsite-host> \
  /usr/local/sbin/nexusflow-db-backup-restore-verify preflight
```

### Key rotation and restore drills

Generate the next identity on the offsite host, add its public recipient while
retaining the old recipient, and distribute only the updated public recipients
file. Keep both private identities offsite until every old-only archive has
expired or has been re-encrypted and fully restored. Then retire the old
recipient/identity in a separately reviewed change. Never overwrite the sole
working identity first.

After recipient changes, force a fresh encrypted backup through the normal
offsite full-restore gate. Quarterly restore the newest archive and one
pre-rotation archive; verify `users`, `schema_migrations`, at least five public
tables, plus login and billing reads. Record archive SHA, key generation,
PostgreSQL version, duration, and result—never identity material or database
contents.

`scripts/migrate-with-lock.mjs` holds a PostgreSQL advisory lock and applies
each pending migration transactionally through that same database session. It
also rejects pending migrations containing destructive/contract patterns by
default. Releases must use expand/contract schema changes so that the previous
application stays usable during rollback. The zero-downtime release path has
no destructive-migration bypass; rewrite the migration or use a separately
reviewed maintenance procedure.

The current committed sequence continues through
`023_provider_list_price_fallback.sql`: `017` is session security, `018`
is the generic admin audit trail, `019` is Provider cost tiers, `020` is upload
object lifecycle, `021` bounds durable control-plane inputs, and `022` preserves
settlement-time retail price, discount, and thinking-mode evidence; `023`
permits an auditable official-list fallback when no verified private price
book applies. Migration
numbers are authoritative only from the actual files in
`backend/src/db/migrations` plus active team allocation. Re-check both before
writing or documenting a new migration—do not infer production application
state from filenames.

### Daily RDS backup remediation

`scripts/daily-db-backup.sh` is the repository replacement for the broken
container-era cron. It:

- serializes with a root lock;
- reads the active immutable release SHA;
- invokes the same encrypted dump and offsite PostgreSQL 16 full-restore gate
  used by releases;
- retains only matching verified release dump names for the configured period.

As of 2026-07-29 the script is implemented but no production cron or systemd
timer has been changed. The old 20-byte-producing task remains an operations
No-Go until this replacement is installed, observed producing a valid RDS dump,
and included in an isolated restore drill.

## 5. Dry-run

The price book is private release input. From a trusted operator machine,
create an unpredictable root-only staging directory on the main node and
stream the reviewed manifest into it. The source file shown here must itself
be private and must not be placed in Git:

```bash
provider_cost_stage="$(
  ssh nexus 'umask 077; mktemp -d /run/nexusflow-provider-cost.XXXXXX'
)"
case "$provider_cost_stage" in
  /run/nexusflow-provider-cost.*) ;;
  *) printf 'unsafe provider-cost staging path\n' >&2; exit 1 ;;
esac
ssh nexus \
  "install -o root -g root -m 0600 /dev/stdin '$provider_cost_stage/manifest.json'" \
  < /secure/local/provider-cost-manifest.json
```

The release gate accepts only
`/run/nexusflow-provider-cost.<random>/manifest.json`, with a root:root `0700`
directory containing exactly that one root:root `0600` regular file. It reads
CLI summaries privately and never logs manifest content, source hashes, or
manifest hashes.

From the same trusted operator shell:

```bash
ssh nexus "
  cd /root/distiny/nexusflow &&
  git pull --ff-only origin main &&
  NEXUSFLOW_PROVIDER_COST_MANIFEST='$provider_cost_stage/manifest.json' \
    bash scripts/deploy-all-production.sh --dry-run
"
```

Dry-run does not build, migrate, drain health checks, reload PM2, or deploy. It
does:

- require a clean Git checkout at `origin/main`;
- verify peer SSH and a clean peer checkout;
- validate root ownership and permissions of both hooks;
- verify byte-identical root-owned node helpers on both nodes;
- require both nginx drain configs to be disabled;
- observe fresh ALB health-check 200s and both node IDs through the public path;
- verify that the temporary backup container can authenticate to production
  RDS and execute `SELECT 1`;
- verify that age can encrypt to the public recipients file and that the
  offsite private verifier can authenticate the keypair and start PostgreSQL
  16;
- require `PROVIDER_OUTBOUND_HOST_ALLOWLIST` in the root-only backend
  environment with every currently approved provider host, and reject
  `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, or lowercase equivalents from both
  the environment file and release shell;
- query the migration ledger without writes and reject pending
  destructive/contract SQL;
- validate the private Provider cost staging owner, mode, shape, and size
  without reading or deleting it;
- print the complete release sequence.

Any failure is a No-Go. Do not replace the traffic hook with `/bin/true`, set a
fake drain flag, or run `deploy-production.sh activate` manually.

## 6. Production release

After dry-run passes:

```bash
ssh nexus "
  cd /root/distiny/nexusflow &&
  NEXUSFLOW_PROVIDER_COST_MANIFEST='$provider_cost_stage/manifest.json' \
    bash scripts/deploy-all-production.sh
"
```

The real release deletes the validated private staging file and its now-empty
directory on success and on catchable failure. Dry-run deliberately retains it
for the real release. If the process is uncatchably killed, validate that exact
root-only staging path before unlinking `manifest.json` and removing the empty
directory; never use a broad recursive cleanup.

The orchestrator performs:

1. Root creates an unpredictable `mktemp -d` staging directory on the peer,
   verifies root:root `0700`, and places bundle/artifact/checksum there only as
   regular root:root `0600` files. Predictable `/tmp` scp targets are forbidden.
2. Git bundle fast-forward of the peer to the verified `origin/main` SHA.
3. Direct verification that both live nodes share one healthy rollback
   baseline SHA and the same session-cutover capability generation; a mixed
   baseline or capability marker is a hard No-Go.
4. One isolated `npm ci --legacy-peer-deps`, backend build, and frontend build
   (matching CI's prerelease Next.js peer-dependency policy).
5. Previous immutable static assets from both active nodes merged into the new
   artifact.
6. Archive path pre-scan, extraction into an empty private directory, rejection
   of escaping symlinks or special entries, manifest verification, and
   release-capability verification on both nodes.
7. Fresh age-encrypted backup plus offsite PostgreSQL 16 full restore.
8. One advisory-locked migration.
9. A stable `started` event in the real admin control-plane tables. If this
   cannot be recorded, the release fails before its first traffic mutation.
10. Health-check local-only mode, public node proof, and peer connection drain.
11. Peer activation, direct health/version/build/chunk/listener/PM2
    verification, followed
   by a runtime-node upsert and `node_succeeded`.
12. Health-check peer-only mode and public verification.
13. Local connection drain and activation of the exact same artifact, followed
    by a runtime-node upsert and `node_succeeded`.
14. After both new nodes and migration `019` verify, run the immutable
    Provider cost CLI against the private manifest first without `--apply`,
    then with explicit apply. Require the exact reviewed price-book ID, 13
    tiers, 13 pending rows, 13 currently active rows, and zero future-effective
    rows without printing the private summary.
15. Revoke all sessions and
    atomically flip migration `017` to hash-only storage under database locks.
16. Balanced health checks, proof that both nodes are public, repeated public
    chunk verification, and proof that no legacy session bearer remains.
17. A terminal `succeeded` event. Failure and rollback events are retried with
    the same idempotency identity but can never interrupt traffic recovery or
    replace the original release error.

One rollout attempt uses one stable release ID. The orchestrator generates one
by default; an operator retrying telemetry for the same attempt must reuse the
logged `NEXUSFLOW_RELEASE_ID`. A second rollout receives a new ID. See
`docs/release-telemetry.md` for the recorder contract.

The public verifier checks:

- PostgreSQL and Redis health;
- backend release SHA;
- frontend build header;
- `/`, `/login`, and `/dashboard`;
- all HTML-referenced Next.js static assets for non-empty 200 responses and
  correct content types, repeated multiple times.

Direct verification also requires PM2's backend environment to report
`NODE_ENV=production`, the managed-release sentinel, mock payment/seed/in-memory
database flags disabled, all required provider egress hosts, no outbound proxy
environment, and ports 3001/19999 listening only on loopback.
`backend/.env` is rejected if it defines `NODE_ENV`, `PORT`, any `BUILD_*`,
`NEXUSFLOW_NODE_ID`, the release sentinel, or unsafe development flags. The
first rollout remains bootstrappable: a legacy baseline without the immutable
capability marker receives historical health/SHA checks, while the new target
and every final new-node verification receive all strict checks.

Before the first rollout of the outbound URL policy, safely add this non-secret
setting to each node's existing root-only backend environment during a
low-traffic window; do not print or rewrite unrelated values:

```dotenv
PROVIDER_OUTBOUND_HOST_ALLOWLIST=api.anthropic.com,dashscope.aliyuncs.com,app-api.pixverse.ai,ark.cn-beijing.volces.com,token.genvia.ai,jawayid.com
PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST=jawayid.com:3000
```

The production environments currently have no HTTP(S) proxy. Do not introduce
one: startup, preflight, and PM2 verification reject proxy variables. The
allowlist change and nginx guard installation are explicit operations
prerequisites; this repository work does not mutate either production node.

## 7. Automatic rollback

The single-node primitive atomically restores its old `current` target if PM2
reload, direct verification, or `pm2 save` fails. A failed activation is
considered durably restored only when the primitive returns its dedicated
status `20` and the orchestrator then verifies the captured baseline SHA.
Any other non-zero status leaves that node drained. A rollback whose runtime
passes but whose PM2 state cannot be persisted also remains drained for manual
repair.

The orchestrator also restores traffic safely:

- Peer activation failure: local remains the only target; balanced traffic is
  restored only if peer rollback verification passes.
- A telemetry failure after peer activation but before the local-node traffic
  mutation keeps traffic on the old local node, rolls peer back, and only then
  restores balanced traffic. It must never balance a new peer with an old local
  node.
- Peer-only public failure: traffic returns to old local, peer rolls back, then
  balanced traffic returns.
- Local activation failure: local automatically restores old, traffic moves to
  old local, peer rolls back, then balanced traffic returns.
- Final balanced failure: traffic remains on verified peer while local rolls
  back; traffic moves to old local while peer rolls back; only then is balanced
  traffic restored.

Migration `017` has an explicit release-owned state machine. A new binary
always writes only a non-secret marker plus `token_hash`; `hash_only=false`
enables only legacy bearer reads while an old binary is active. Before a
legacy baseline is activated, the orchestrator:

1. routes traffic to one verified node and drains the rollback target;
2. acquires the session transition lock, revokes all sessions, flips to
   legacy-compatible mode, and records the security downgrade event;
3. marks that compatibility transition as owned by the current release.

A complete legacy rollback may restore balanced traffic only after both direct
runtimes report the captured baseline SHA and the database proves the expected
dual-read posture. If either rollback target fails and a new hash-capable
runtime is restored, the EXIT recovery admits only a directly verified
`BUILD_SHA` node, drains every legacy or unknown node, reruns the locked
forward transition, revokes sessions again, and proves hash-only posture.
Failure to complete that recovery leaves traffic single-node and terminates
the release; generic cleanup is forbidden from balancing while the downgrade
is still owned. This includes the tested case where the old target starts but
fails its health verification.

If rollback verification itself fails, the affected node remains drained. The
script does not add an unverified node back to ALB. An uncatchable host loss
may require operator recovery, but the next rollout's posture gate refuses to
continue from an inconsistent state.

Database rollback is not automatic. Expand-compatible migrations remain in
place while the previous app release runs. Destructive reverse SQL is not an
acceptable release rollback strategy.

Migration `019` also has a release-owned compatibility state machine. Managed
capability marker version 2 asserts `providerCostTiers=true`. When the captured
rollback baseline lacks that capability, the orchestrator must, while traffic
is still isolated on a verified new binary:

1. dry-run deactivation and require either all 12 or zero unexpired pending
   rows, with no partial or future-effective rows;
2. deactivate the exact price book and verify zero pending, active, and future
   rows;
3. only then enable old-binary session compatibility or activate any old
   runtime.

A complete old rollback keeps the book inactive. If either old activation
fails and a new `BUILD_SHA` binary is restored, EXIT recovery routes only that
directly verified tier-aware node, reapplies the same private manifest
transactionally (including exact-content reactivation), verifies all 12 rows
active and pending with zero future rows, and keeps the other node drained.
Partial/future pending state, content/window drift, missing private input, or
failed reactivation is fail-closed and never restores balanced traffic.

## 8. Verification-only mode

After release, or during an audit:

```bash
bash scripts/deploy-all-production.sh --verify-only
```

This validates both direct nodes, the public path, immutable manifests, the
authorized backend environment symlinks, build IDs, backend SHAs, static
chunks, both public node identities, disabled drain configs, and—when the
deployed capability marker declares Provider cost tiers—the exact price book
with all 13 rows active, without changing traffic or processes.

Useful read-only checks:

```bash
readlink -f /root/distiny/nexusflow-current
readlink -f /root/distiny/nexusflow-previous
cat /root/distiny/nexusflow-current/frontend/.next/BUILD_ID
curl -fsS http://127.0.0.1:3001/api/version
curl -fsSI http://127.0.0.1:19999/ | grep -i X-NexusFlow-Build-Sha
```

## 9. Manual recovery

Do not call the node rollback primitive until
`scripts/nginx-health-traffic-hook.sh` has proved the affected node excluded
from the public path and its connections have drained.

The orchestrator normally handles rollback. For an operator-led recovery
between releases of the same hash-capability generation:

1. Route all traffic to the known-good other node.
2. Confirm the affected node has drained.
3. Set `NEXUSFLOW_DRAIN_CONFIRMED=true` only for that command.
4. Run `scripts/deploy-production.sh rollback`.
5. Run `scripts/deploy-production.sh verify`.
6. Restore balanced traffic only after both nodes pass.

Do not manually set `NEXUSFLOW_SESSION_ROLLBACK_PREPARED=true` to force a
hash-capable-to-legacy rollback. That flag is evidence of the orchestrator's
locked database transition, not a bypass.

If an interrupted legacy rollback left compatibility mode active, first keep
all legacy/unknown nodes drained and identify one node that directly verifies
the intended new SHA. Route only that node, then restore the database posture
from the matching immutable release:

```bash
NEW_SHA='<full-new-release-sha>'
scripts/nginx-health-traffic-hook.sh route local  # or peer: the verified new node
NEXUSFLOW_APP_ROOT="/root/distiny/nexusflow-releases/$NEW_SHA" \
NEXUSFLOW_BACKEND_ENV="/root/distiny/nexusflow/backend/.env" \
  node "/root/distiny/nexusflow-releases/$NEW_SHA/scripts/session-token-security.mjs" \
    transition --direction forward --sha "$NEW_SHA" \
    --actor release-operator \
    --reason "Incident recovery after interrupted legacy rollback"
NEXUSFLOW_APP_ROOT="/root/distiny/nexusflow-releases/$NEW_SHA" \
NEXUSFLOW_BACKEND_ENV="/root/distiny/nexusflow/backend/.env" \
  node "/root/distiny/nexusflow-releases/$NEW_SHA/scripts/session-token-security.mjs" \
    posture --expect hash-only
```

This revokes active sessions. Keep the other node drained until its runtime,
immutable files, PM2 environment, listeners, and SHA have all been repaired
and verified. Do not restore balanced traffic merely because the DB transition
succeeded.

Never delete the previous release or old static assets during an incident.
