# HSR Skills for BB

A fork of [prismatic7/bb-plugin-progressive-skill](https://github.com/prismatic7/bb-plugin-progressive-skill), adapted for the local `hong-skill-registry` project. BB plugin ID: `hsr`.

Search and read the skills deliberately kept in a configured `hong-skill-registry/skills/` checkout. Multiple `.agents`, `.claude`, and `.bb` installations do not create duplicate entries. The authoritative source is the registry, so a stale provider copy does not change what `hsr_skill_read` returns.

## Install

Requires BB Plugin SDK >= 0.4.55 and a registry host with HSR's CLI and Node >= 22.5. This plugin uses BB's public host RPC API; the registry host can differ from the agent's host.

```sh
bb plugin install git:https://github.com/Willhong/bb-plugin-hsr.git --yes
bb machine list --json
bb plugin config hsr set registryHostId <host-id>
bb plugin config hsr set registryPath /absolute/path/to/hong-skill-registry
bb hsr list
```

For local development, clone this fork, run `npm ci`, `npm run build`, and `bb plugin install . --yes`. Settings are read per request. For code changes, build and reload `hsr`. New native tools and the plugin skill appear when BB constructs the next provider session. The CLI is available immediately.

This fork has distinct tool names and can coexist with the original `progressive-skill` plugin. Installing it does not disable the original or change HSR's links. It does not publish a marketplace entry.

## Agent tools and CLI

| Tool | Behavior | CLI |
| --- | --- | --- |
| `hsr_skill_list` | Search names and descriptions, then rank a bounded list | `bb hsr list [--query text] [--limit 1-100] [--json]` |
| `hsr_skill_read` | Read `SKILL.md` or a relative supporting file, with pagination | `bb hsr read <skill> [--file relative-path] [--offset N] [--limit 1-12000]` |
| `hsr_skill_used` | Record actual application of a current HSR skill | `bb hsr used <skill>` |

An explicit skill request overrides rank. Use `query` to retrieve an omitted or rarely used skill. Search covers the source name and up to 2,000 normalized description characters; the text list displays up to 160 description characters. `list --json` returns paths, both score components, and source host information for at most 100 rows. Source paths belong to the configured host, not necessarily the invoking machine.

`read` returns `path`, `text`, `totalChars`, and `nextOffset`. Offsets and the character budget use JavaScript string length (UTF-16 code units), not a tokenizer. Follow `nextOffset` to read the rest before applying instructions. Relative references stay within the selected skill; traversal and escaping symlinks are rejected. Binary files and files over 1 MiB are refused.

## Ranking and history

- Read HSR's existing `node bin/hong-skills.js usage --json` command on the configured registry host. Its AgentsView database remains read-only. Only current curated names enter this plugin's history.
- Keep actual `hsr_skill_used` calls separately in BB KV, isolated by registry host and canonical checkout path. Concurrent recordings are serialized and saved before reporting success.
- Apply the upstream decay formula to both sources: `count * exp(-days / 30)`. Historical count is HSR's `calls`; recorded count is calls to `hsr_skill_used`.
- Rank by **max(history score, recorded score)**, not their sum, because the sources can overlap. This is a conservative ranking heuristic, not an exact merged use count. HSR's inferred reads and name normalization remain HSR's responsibility.
- Exact name matches precede score sorting for a search. Score ties sort by name. A score at or above `promoteScore` gets a star.
- Missing, unavailable, or incompatible history is reported in the list. Catalog discovery and reading still work. A missing or invalid registry itself is an error.

Listing, inspecting, or editing a skill does not automatically record use. Call `hsr_skill_used` only after application. Usage indicates frequency, not whether a skill fits the task.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `registryHostId` | empty | Explicit BB machine ID containing HSR; required |
| `registryPath` | empty | Absolute HSR checkout path on that host; required |
| `nodeBinary` | `node` | Host's Node executable for HSR history |
| `budgetChars` | `6000` | Complete native/text list budget, including metadata (1,000–20,000) |
| `promoteScore` | `2` | Star threshold (0–1,000,000) |

The curated catalog supports up to 500 source skill directories. Each source must have matching folder/frontmatter names and a string description. Invalid metadata is reported instead of silently losing a skill. The host executes only the configured HSR usage command, with argument arrays, a 20-second timeout, and bounded output.

## Limits

This plugin adds a bounded discovery tool. It **does not replace or compact BB/provider system-prompt skill catalogs**. No claim of automatic prompt-token savings is made. It also does not import skills, install provider links, repair drift, or modify HSR.

The explicit central registry host is used for all sessions. If it is offline, requests fail rather than reading a different machine. Remote transport uses the SDK host route, but live verification for this release was performed on one machine, not a two-machine deployment.

## Development and verification

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Behavior tests cover curated scope, HSR history, conservative scoring, bounded lists and omitted-skill search, unavailable history, paginated reference reads, path escape rejection, native tools/CLI through the SDK harness, persistence over reload, and concurrent usage. The test bootstrap supplies a CommonJS require bridge for SDK 0.4.55's ESM host bundle; production host helpers are bundled by BB's host builder.

## Attribution

Forked from upstream v0.2.1 / commit `e551a65` (the installed version originally inspected was `3a867de`). The decay-based ranking idea is retained. Upstream originally ported the Hermes progressive-skill decision core. The original MIT license and attribution are preserved in [LICENSE](LICENSE).
