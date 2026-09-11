# Verification — 0.3.0 (2026-09-11)

## Automated

- `npm run typecheck`: passed.
- `npm test`: 5 tests passed, 0 failed. Includes real temporary filesystem fixtures, HSR CLI subprocess output, official BB server/host test harnesses, concurrent recordings, and persisted state after reload.
- Public SDK import scan: no violations or private dependencies.
- `npm run build`: generated server and host bundles with metadata for `hsr`.
- `npm audit`: 0 vulnerabilities after updating the inherited test-only Hono dependency.

The SDK 0.4.55 host ESM test import needs the require bridge in `test/register.mjs`. The test runner uses `node --import … --test`; the upstream-style tsx CLI runner was replaced after it stalled in this environment.

## Live BB on the configured local registry host

- Installed this checkout as plugin `hsr` version 0.3.0, configured an explicit host ID and absolute HSR path, built and reloaded it.
- `bb hsr list --limit 100 --json`: 31 curated skills, 31 returned entries, 31 unique names. HSR history status `ok`; 7 curated names had history.
- Default text list: 5,649 UTF-16 code units including the CLI newline, within the 6,000-character budget.
- `bb hsr list --query '계약' --limit 5`: found `fullstack-contract-loop` from its Korean description.
- `bb hsr read code-review --limit 12000`: full text matched the source file; no continuation required.
- `bb hsr read unfinished-work-review --file references/source-adapters.md --limit 12000`: matched HSR's authoritative reference, independent of the previously observed provider-copy drift.
- `bb hsr read code-review --file ../../package.json`: rejected with nonzero exit status.

Live commands exercised the real host RPC route on one machine. A distinct remote-machine deployment and a newly constructed provider session advertising the native tools were not tested. Native-tool execution was tested through the official SDK harness; the immediately available CLI uses the same implementation.

No synthetic live usage was recorded. Usage persistence and concurrency tests use isolated test storage. No HSR source files, host links, or AgentsView database contents were changed. The original Progressive Skill plugin remains installed independently.
