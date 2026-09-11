---
name: hsr-skills
description: Use when searching, reading, or recording use of curated hong-skill-registry skills through the HSR Skills BB plugin. Not for importing skills, modifying registry files, or assuming usage rank indicates task fit.
---
# HSR skills

Use `hsr_skill_list` (or `bb hsr list --query <text>`) to search the curated registry by name and description. Results contain one entry per registry source directory, not one per provider installation.

Use `hsr_skill_read` with `skill` to read `SKILL.md`. Follow `nextOffset` until all required instructions are read. For a reference, use `file` relative to that skill directory; never guess a path on the current machine from the registry host's path. Files come from the configured registry host through BB host RPC.

After actually applying a skill, call `hsr_skill_used`. Searching, reading for inspection, and editing a skill are not application. Follow explicit user skill requests regardless of ranking or omission from the default list.

CLI equivalents:

- `bb hsr list [--query text] [--limit 1-100] [--json]`
- `bb hsr read <skill> [--file relative-path] [--offset N] [--limit 1-12000]`
- `bb hsr used <skill>`

Configure `registryHostId`, absolute `registryPath`, and optionally `nodeBinary` through `bb plugin config hsr set <key> <value>`. The Node executable runs on the configured registry host and must support the HSR CLI (Node >= 22.5). No invocation uses the caller's cwd as the registry.

The plugin uses HSR's own usage ledger. HSR incrementally reads Codex, Claude, Pi and Hermes source records directly; AgentsView is not a tracking dependency. Initial SKILL.md reads create `loaded` events, and `hsr_skill_used` creates `applied` events in the same ledger. Reference reads and continuation pages do not increase the load count. Source transcripts are read-only; HSR writes only its own SQLite database. Search is not counted as use.

Collection state (`ready`, `collecting`, `partial`) is shown in the list. Calls represent observed loads plus explicit applications, not proof that every loaded instruction affected the result. Rank reflects this observation count with 30-day decay.

This plugin provides an additional bounded index. It does not suppress or replace BB/provider skill prompts and does not manage HSR's provider links.

## BB sidebar

Users can open **스킬 사용 현황** in BB's left sidebar to view registered skills, loads, explicit applications, observation share, and last-record timestamps. Name/description search, record-type filters, sorting, and manual refresh are available. This read-only view does not record use. All figures cover the collected history; observation share keeps the entire registry denominator even when filtered.

The sidebar distinguishes explicit user requests (명시적 요청), body loads (본문 로드), and agent application reports (적용 보고). Zero application reports does not mean zero actual uses. Saved counts render before background collection completes.
