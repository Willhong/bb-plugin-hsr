# Tracking semantics and loading — 0.6.0 (2026-09-12)

- Confirmed original Claude slash-command records for evidence-based-resume that were omitted from the former application count.
- Native parser version 3 backfilled 20 explicit requests, 18 body loads and 0 application reports for that skill in the observed local source records. Application reports remain distinct from requests and execution.
- HSR tests cover explicit Claude/Codex requests, ignored skill edits/quotes/negation, idempotent backfill, and cached reads while a collector write transaction is held.
- Plugin tests cover UI RPC returning saved data while background collection is stalled and a client deadline releasing a stalled request so a retry can succeed.
- Registry suite: 31 tests passed. Plugin suite: 9 tests passed. Typecheck and both UI/BB builds passed.
- BB sidebar uses cached reads and one coalesced background collection, with a 10-second UI response deadline.
- Live browser after a full reload showed evidence-based-resume as 20 requests / 18 loads / 0 application reports. Measured HSR RPC durations were 5,043 ms on cold page load alongside other BB startup requests, then 96–97 ms for subsequent reads. This does not guarantee a sub-second cold load.

---

# Sidebar UI verification — 0.5.0 (2026-09-12)

- Added native BB `navPanel` named 스킬 사용 현황 at `/plugins/hsr/usage` with a typed, read-only `usage` RPC. The current BB sidebar displayed the new entry directly.
- 7 plugin tests cover RPC output/no usage side effects, registry-wide percentage denominator under search/filter, zero totals, filters, and sorts, in addition to existing host/CLI behavior.
- Typecheck and BB server/host/app builds passed. The app bundle is approximately 11 KB and uses the host React runtime and theme tokens.
- Live BB verification: sidebar click opened the page; 31 registered skills rendered; search preserved diagnosing-bugs at the same 3.9% share; unknown search showed the empty state and reset restored the list.
- Captured the loaded desktop (1728×869) and mobile (390×844) views. At 390px, panel scrollWidth equaled clientWidth (390), with all 31 rows available. Screenshots remain local under .impeccable/review and are not published.
- Mechanical design detector on app.tsx/app.css returned no findings.
- Live record-type filter showed diagnosing-bugs as the one explicitly applied skill; alphabetical sorting began with architecture-review; description expansion and manual refresh worked.
- Independent read-only finish review of source and desktop/mobile screenshots returned ship with no material findings in the requested UI scope. It did not run a screen reader or computed-contrast measurements.
- Full collected history only; no period filter or adherence-rate claim. Existing plugin tools and HSR source files are not changed by viewing the UI.

---

# Verification — 0.4.0 (2026-09-11)

This release replaces the v0.3 AgentsView integration with the native HSR tracking contract. The old v0.3 verification below is historical and does not describe the active storage path.

- Typecheck, 5 plugin behavior tests, and server/host builds passed.
- The SDK test verifies that an initial body read increases loads once, a continuation does not, and neither creates an application event.
- Four concurrent application calls reach the HSR CLI boundary; the resulting count remains available after plugin reload.
- HSR's separate test suite covers actual native SQLite collection, Codex/Claude/Pi/Hermes adapters, incomplete records, duplicate events/files, failed reads, reference exclusion, and direct application events.
- Live plugin status: `hsr` version 0.4.0, running. Native list uses the current HSR ledger and exposes loads/applications separately.
- During this task, a real application of diagnosing-bugs was recorded through `bb hsr used`. The HSR CLI, plugin list, and web UI showed applications increasing from 0 to 1.
- Browser verification used the existing HSR UI at port 8470. The page showed HSR-native tracking status, name search, and separate load/application counts.

The real host RPC route was exercised on one machine. A second physical machine was not tested. The runtime native tools were tested via the SDK harness and the live CLI uses the same handlers.

---

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
