import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hostContract, readInput, skillName } from "./contract.js";
import { renderList, rank } from "./ranking.js";
import { rpcContract } from "./ui-contract.js";
import { usageReport } from "./usage-view.js";

const listInput = z.object({ query: z.string().max(200).optional(), maxSkills: z.number().int().min(1).max(100).default(30) });

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    registryHostId: { type: "string", label: "HSR host ID", default: "", description: "Explicit BB host containing the authoritative HSR checkout." },
    registryPath: { type: "string", label: "HSR checkout path", default: "", description: "Absolute hong-skill-registry path on the configured host." },
    nodeBinary: { type: "string", label: "Node executable on HSR host", default: "node", description: "Node >= 22.5 for native HSR collection and event recording." },
    budgetChars: { type: "number", label: "List character budget", default: 6000, experimental_schema: z.number().int().min(1000).max(20000) },
    promoteScore: { type: "number", label: "Promote score", default: 2, experimental_schema: z.number().min(0).max(1000000) },
  });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  async function config() {
    const s = await settings.get();
    if (!s.registryHostId || !s.registryPath) throw new Error("Configure hsr registryHostId and registryPath with bb plugin config hsr set <key> <value>.");
    return s;
  }
  async function snapshot(signal?: AbortSignal) {
    const s = await config();
    const catalog = await host.call("catalog", { registryPath: s.registryPath, nodeBinary: s.nodeBinary }, { hostId: s.registryHostId, signal });
    return { s, catalog };
  }

  async function list(input: z.infer<typeof listInput>, signal?: AbortSignal, json = false) {
    const { s, catalog } = await snapshot(signal);
    if (json) return JSON.stringify({ registryPath: catalog.registryPath, hostId: s.registryHostId, usageStatus: catalog.usageStatus, total: catalog.skills.length, rows: rank(catalog, input.query).slice(0, input.maxSkills) }, null, 2);
    return renderList(catalog, { ...input, budget: s.budgetChars, promote: s.promoteScore, hostId: s.registryHostId });
  }
  async function record(skill: string, kind: "loaded" | "applied", session: string, signal?: AbortSignal) {
    const s = await config();
    return host.call("record", { registryPath: s.registryPath, nodeBinary: s.nodeBinary, skill, kind, session, eventId: randomUUID() }, { hostId: s.registryHostId, signal });
  }
  async function read(input: z.infer<typeof readInput>, session: string, signal?: AbortSignal) {
    const s = await config();
    const result = await host.call("read", { ...input, registryPath: s.registryPath, nodeBinary: s.nodeBinary }, { hostId: s.registryHostId, signal });
    // Count an initial SKILL.md read, not reference files or continuation pages.
    if (input.file === "SKILL.md" && input.offset === 0) await record(input.skill, "loaded", session, signal);
    return result;
  }
  async function used(skill: string, session: string, signal?: AbortSignal) {
    await record(skill, "applied", session, signal);
    return `Recorded HSR application: ${skill}.`;
  }

  bb.rpc.register(rpcContract, {
    usage: async () => {
      const { catalog } = await snapshot();
      if (catalog.usageStatus.startsWith("unavailable")) throw new Error(catalog.usageStatus);
      return usageReport(catalog);
    },
  });

  bb.agents.registerTool({
    name: "hsr_skill_list",
    description: "Search curated hong-skill-registry skills by name or description. One entry per source skill, ranked using HSR's own transcript and application ledger, with a bounded description list. Use query to find omitted or rarely-used skills.",
    instructions: "For hong-skill-registry skills, use hsr_skill_list to discover and hsr_skill_read to load the authoritative text. Record real application with hsr_skill_used. Explicit user requests for a skill take priority over usage rank.",
    parameters: listInput,
    execute: (input, ctx) => list(input, ctx.signal),
  });
  bb.agents.registerTool({
    name: "hsr_skill_read",
    description: "Read a curated HSR skill or a relative supporting file from the configured registry host. Returns a bounded page and nextOffset; continue until all needed instructions are read. Records initial SKILL.md loads in the HSR ledger; application is recorded separately.",
    parameters: readInput,
    execute: async (input, ctx) => JSON.stringify(await read(input, ctx.threadId, ctx.signal)),
  });
  bb.agents.registerTool({
    name: "hsr_skill_used",
    description: "Record an HSR skill after actually applying it. Do not record inspection, search, or editing as use. Accepts only a current curated skill name.",
    parameters: z.object({ skill: skillName }),
    execute: ({ skill }, ctx) => used(skill, ctx.threadId, ctx.signal),
  });
  bb.cli.register({
    name: "hsr",
    summary: "Search and read curated HSR skills on the configured registry host",
    commands: [
      { name: "list", summary: "Ranked skill list", usage: "bb hsr list [--query text] [--limit 1-100] [--json]" },
      { name: "read", summary: "Read skill or supporting file", usage: "bb hsr read <skill> [--file relative-path] [--offset N] [--limit 1-12000]" },
      { name: "used", summary: "Record actual skill use", usage: "bb hsr used <skill>" },
    ],
    async run(argv, ctx) {
      try {
        const [command = "list", ...args] = argv;
        if (command === "--help" || command === "help") return { exitCode: 0, stdout: "bb hsr list [--query text] [--limit N] [--json]\nbb hsr read <skill> [--file relative-path] [--offset N] [--limit N]\nbb hsr used <skill>" };
        const positional: string[] = [];
        const flags: Record<string, string | boolean> = {};
        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          if (arg === "--json" && command === "list") flags.json = true;
          else if (arg.startsWith("--")) {
            const allowed = command === "list" ? ["--query", "--limit"] : command === "read" ? ["--file", "--offset", "--limit"] : [];
            if (!allowed.includes(arg) || args[i + 1] === undefined || args[i + 1].startsWith("--")) throw new Error(`Invalid option: ${arg}`);
            flags[arg.slice(2)] = args[++i];
          } else positional.push(arg);
        }
        if (command === "list" && positional.length === 0) return { exitCode: 0, stdout: await list(listInput.parse({ query: flags.query, maxSkills: flags.limit === undefined ? undefined : Number(flags.limit) }), ctx.signal, flags.json === true) };
        if (command === "read" && positional.length === 1) return { exitCode: 0, stdout: JSON.stringify(await read(readInput.parse({ skill: positional[0], file: flags.file, offset: flags.offset === undefined ? undefined : Number(flags.offset), limit: flags.limit === undefined ? undefined : Number(flags.limit) }), ctx.threadId ?? "cli", ctx.signal), null, 2) };
        if (command === "used" && positional.length === 1) return { exitCode: 0, stdout: await used(skillName.parse(positional[0]), ctx.threadId ?? "cli", ctx.signal) };
        throw new Error("Unknown command or arguments. Run bb hsr --help.");
      } catch (error) {
        return { exitCode: 1, stderr: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}
