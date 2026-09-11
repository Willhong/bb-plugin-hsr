# HSR Skills for BB

A fork of [prismatic7/bb-plugin-progressive-skill](https://github.com/prismatic7/bb-plugin-progressive-skill) for a local `hong-skill-registry` checkout. Plugin ID: `hsr`. Version 0.4 uses **HSR's own tracking ledger**, not AgentsView's database or a separate plugin usage counter.

## Install

Requires BB Plugin SDK >= 0.4.55 and an HSR checkout with native tracking (`src/tracking/`). Install HSR's dependencies with `npm install` in that checkout. The configured registry host needs Node >= 22.5.

```sh
bb plugin install git:https://github.com/Willhong/bb-plugin-hsr.git --yes
bb machine list --json
bb plugin config hsr set registryHostId <host-id>
bb plugin config hsr set registryPath /absolute/path/to/hong-skill-registry
bb hsr list
```

For development: `npm ci`, `npm run build`, `bb plugin install . --yes`. Build and reload `hsr` after code changes. Settings are read per request. Updated native tool declarations appear when BB next constructs the provider session; CLI changes apply immediately.

## Sidebar UI

Open **스킬 사용 현황** in BB's left sidebar (`/plugins/hsr/usage`). The page shows every registered skill, including names with no observed records, with body loads, explicit applications, observation share, and the most recent record. Search names/descriptions, filter by record type, and sort by observations, applications, recency, or name. Expand a skill name to read its description without recording a load.

Observation share is `(skill loads + application events) / all registered skill observations`; searching or filtering does not change the denominator. Figures cover the entire collected history and do not claim actual instruction compliance. Zero observations produces 0%, not an invalid percentage.

The page refreshes every 30 seconds while visible, on window focus, or with 새로고침. In-progress/partial collection, loading, missing configuration, failed refresh, and empty results are shown explicitly. A refresh error keeps the last snapshot visibly marked as old. Viewing this UI never records a skill load or application. On narrow screens the latest timestamp moves under the skill name.

## Tools

| Tool | CLI | Behavior |
| --- | --- | --- |
| `hsr_skill_list` | `bb hsr list [--query text] [--limit 1-100] [--json]` | Search curated names/descriptions, one entry per source skill |
| `hsr_skill_read` | `bb hsr read <skill> [--file relative-path] [--offset N] [--limit 1-12000]` | Read authoritative source text; record initial SKILL.md load |
| `hsr_skill_used` | `bb hsr used <skill>` | Record an explicit application after actually using the skill |

`read` returns `path`, `text`, `totalChars`, and `nextOffset`. Read the remaining pages before applying instructions. Reference files and continuation pages do not create another load event. Reads do not imply that every instruction was applied; application is recorded separately. Search is not usage. Explicit user requests override rank.

File operations execute on the configured registry host through public BB host RPC. Source paths belong to that host, not necessarily the caller. Traversal, escaping symlinks, binary files, and files over 1 MiB are refused.

## Native tracking

HSR reads Codex/Claude/Pi JSONL transcripts and Hermes state databases directly. It maintains its own SQLite ledger, source cursors, and tool-call/result matching. Source transcripts are read-only. HSR's `usage` query incrementally collects new records; its web UI refreshes every 30 seconds. No AgentsView process, schema, or database is needed for tracking.

This plugin sends initial body reads as `loaded` and actual applications as `applied` to `hong-skills usage-record` on the registry host. Each request has an event ID. HSR persists it before the tool reports success, and repeated event IDs do not duplicate records. HSR ignores transcript echoes of these native tools. The plugin's former KV usage counter is no longer read or written.

The list exposes `loads`, `applications`, `calls`, and `lastUsed`. `calls` is the sum of observed loads and explicit application events, not an exact count of real-world instruction application. Rank uses `calls * exp(-days / 30)` from the single HSR ledger. Old and new databases are not summed or compared.

Tracking status is `ready`, `collecting`, or `partial`; unavailable or outdated collectors are reported rather than labeled healthy. Initial backfill can require several queries. HSR's own API includes per-provider freshness and source errors. The registry's `docs/NATIVE-USAGE-TRACKING.md` describes parser coverage and inference limits, including ambiguous shell execution and provider-vs-BB session identity.

## Settings and limits

| Setting | Default | Meaning |
| --- | --- | --- |
| `registryHostId` | empty | Explicit BB host containing HSR |
| `registryPath` | empty | Absolute HSR checkout path on that host |
| `nodeBinary` | `node` | Host Node executable for collection and recording |
| `budgetChars` | `6000` | Entire text-list budget, 1,000–20,000 UTF-16 code units |
| `promoteScore` | `2` | Star threshold |

Catalog: at most 500 source skill directories with matching frontmatter/folder names. Search covers up to 2,000 normalized description characters per skill; text rows display up to 160. Query an omitted skill by name. JSON lists return up to 100 rows. The registry command has a 20-second timeout and bounded output.

This plugin does not suppress BB/provider system-prompt skill catalogs, install HSR provider links, or modify source skills. The BB sidebar now includes 스킬 사용 현황, backed by the same native ledger as HSR's web UI. The original Progressive Skill can coexist under separate tool names.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Tests exercise the source CLI boundary, bounded search, pagination, missing history, filesystem containment, public SDK imports, initial-load-only recording, explicit application persistence, concurrency, and SDK host routing. The HSR repository separately tests actual SQLite storage and provider adapters. See [VERIFICATION.md](VERIFICATION.md) for live checks and limits.

SDK 0.4.55's ESM host test bundle needs a CommonJS require bridge (`test/register.mjs`). Production host helpers are bundled by BB.

## Attribution

Forked from upstream v0.2.1 / commit `e551a65`; retains the 30-day decay ranking concept. Upstream originally ported the Hermes progressive-skill decision core. The original [MIT license](LICENSE) and attribution are preserved.
