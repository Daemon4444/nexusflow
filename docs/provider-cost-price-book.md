# Provider cost price books

Provider costs are source-traceable facts. Verified private prices are
versioned; official-list fallback uses the immutable list amount captured by
the original settlement. Historical nulls may be backfilled only from those
same settlement facts.

## Data model

- A price book groups one or more token tiers for a provider/model route.
- Tier lower bounds are inclusive and upper bounds are exclusive.
- Input, output, implicit cache read, explicit cache read, and five-minute
  cache creation rates are stored separately in CNY per million tokens.
- `contract`, `invoice`, `manual`, and verified private `import` rows are
  recognized. Estimates never contribute to realized upstream cost.
- Negotiated/imported price books are evaluated first. If none can resolve the
  request, the immutable official retail-list amount captured at settlement is
  used as the provider list-price fallback. Missing provider identity,
  estimated usage, lookup failures, and internally inconsistent usage still
  fail closed.
- Imported source references, SHA-256, source rows, and condition fingerprints
  are retained without putting the source workbook or commercial rates in Git.

## Private import

Build the backend first. The CLI is then available at:

```text
backend/dist/cli/import-provider-cost-manifest.js
```

The JSON manifest must be an absolute-path regular file outside the repository
and release artifact, owned by the release operator, mode `0600` or stricter,
and no larger than 1 MB. Dry-run is the default:

```bash
node backend/dist/cli/import-provider-cost-manifest.js \
  --manifest "$NEXUSFLOW_PROVIDER_COST_MANIFEST"
```

Apply requires an explicit flag:

```bash
node backend/dist/cli/import-provider-cost-manifest.js \
  --manifest "$NEXUSFLOW_PROVIDER_COST_MANIFEST" \
  --apply
```

The release workflow must validate the returned price-book ID and counts
without printing the manifest or its rates. Delete the transient remote copy
after import.

## Release rollback

An old binary does not understand token tiers. Before routing any production
traffic back to such a binary, deactivate the imported book with the CLI from
the new release:

```bash
node backend/dist/cli/import-provider-cost-manifest.js \
  --deactivate-price-book "$NEXUSFLOW_PROVIDER_COST_PRICE_BOOK_ID" \
  --apply
```

If rollback itself fails and traffic returns to the new binary, applying the
same exact private manifest reactivates the fully matching book atomically.
Mixed active/deactivated rows, altered contents, or a mismatched effective
window fail closed. Import, deactivation, and reactivation each write route
audit events.

## Historical backfill

The backfill always tries the verified provider price book first. It falls back
to the immutable settlement list amount only when no applicable price-book row
resolves. Dry-run is the default:

```text
npm run provider-cost:backfill -- --since-hours 24
```

Apply requires `--apply`; the command only updates successful, non-estimated
usage whose provider cost is still null.
