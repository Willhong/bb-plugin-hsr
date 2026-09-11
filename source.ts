import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "yaml";
import { catalogSchema, skillName, type Catalog } from "./contract.js";

const run = promisify(execFile);
const MAX_FILE_BYTES = 1024 * 1024;

async function registry(root: string) {
  if (!path.isAbsolute(root)) throw new Error("registryPath must be an absolute path on registryHostId.");
  const resolved = await fs.realpath(root);
  const pkg = JSON.parse(await fs.readFile(path.join(resolved, "package.json"), "utf8"));
  if (pkg.name !== "hong-skill-registry") throw new Error("registryPath must point to hong-skill-registry.");
  return resolved;
}

async function containedFile(root: string, relative: string) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("File must stay inside the selected skill.");
  const resolved = await fs.realpath(path.join(root, relative));
  const rel = path.relative(root, resolved);
  if (rel.startsWith(".." + path.sep) || rel === ".." || path.isAbsolute(rel)) throw new Error("File escapes the selected skill.");
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("Expected a text file of at most 1 MiB.");
  return resolved;
}

async function skillRoot(root: string, name: string) {
  skillName.parse(name);
  const skillsRoot = await fs.realpath(path.join(root, "skills"));
  const target = await fs.realpath(path.join(skillsRoot, name));
  if (path.dirname(target) !== skillsRoot) throw new Error("Skill directory escapes the registry.");
  return target;
}

export async function loadCatalog(input: { registryPath: string; nodeBinary: string; collect?: boolean }, signal?: AbortSignal): Promise<Catalog> {
  const root = await registry(input.registryPath);
  const entries = await fs.readdir(path.join(root, "skills"), { withFileTypes: true });
  const skills: Catalog["skills"] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !skillName.safeParse(entry.name).success) continue;
    const dir = await skillRoot(root, entry.name);
    try { await fs.access(path.join(dir, "SKILL.md")); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const file = await containedFile(dir, "SKILL.md");
    const content = await fs.readFile(file, "utf8");
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    if (!match) throw new Error(`Missing frontmatter: ${entry.name}`);
    const fm = parse(match[1]);
    if (fm?.name !== entry.name || typeof fm?.description !== "string") throw new Error(`Invalid skill metadata: ${entry.name}`);
    skills.push({ name: entry.name, description: fm.description.replace(/\s+/g, " ").trim().slice(0, 2000), path: file });
  }
  if (skills.length > 500) throw new Error("HSR catalog exceeds 500 skills.");
  let usageStatus = "ok";
  const history: Catalog["history"] = {};
  try {
    const { stdout } = await run(input.nodeBinary, [path.join(root, "bin/hong-skills.js"), "usage", ...(input.collect === false ? ["--cached"] : []), "--json"], {
      cwd: root, timeout: 20000, maxBuffer: 4 * 1024 * 1024, signal,
    });
    const result = JSON.parse(stdout);
    if (result.usageOk !== true || !Array.isArray(result.rows)) {
      usageStatus = `unavailable: ${String(result.reason ?? "invalid HSR usage response").slice(0, 100)}`;
    } else if (result.collection?.engine !== "hsr-native") {
      usageStatus = "unavailable: HSR native tracking is required; upgrade the registry checkout";
    } else {
      usageStatus = input.collect === false && result.collection.status === "ready" ? "cached" : result.collection.status;
      const names = new Set(skills.map(s => s.name));
      for (const row of result.rows) {
        if (!names.has(row.name)) continue;
        const calls = Number(row.calls);
        if (!Number.isFinite(calls) || calls < 0) continue;
        history[row.name] = { calls, requests: Number(row.requests) || 0, loads: Number(row.loads) || 0, applications: Number(row.applications) || 0, lastUsed: typeof row.lastUsed === "string" && Number.isFinite(Date.parse(row.lastUsed)) ? row.lastUsed : null };
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    usageStatus = "unavailable: HSR usage command failed (check Node >= 22.5 and HSR native tracking)";
  }
  return catalogSchema.parse({ registryPath: root, skills, history, usageStatus });
}

export async function readSkill(input: { registryPath: string; skill: string; file: string; offset: number; limit: number }) {
  const root = await registry(input.registryPath);
  const dir = await skillRoot(root, input.skill);
  await containedFile(dir, "SKILL.md");
  const file = await containedFile(dir, input.file);
  const content = await fs.readFile(file, "utf8");
  if (content.includes("\0")) throw new Error("Binary files cannot be read as skill instructions.");
  const end = Math.min(content.length, input.offset + input.limit);
  return { path: file, text: content.slice(input.offset, end), totalChars: content.length, nextOffset: end < content.length ? end : null };
}

export async function recordSkill(input: { registryPath: string; nodeBinary: string; skill: string; kind: string; session: string; eventId: string }, signal?: AbortSignal) {
  const root = await registry(input.registryPath);
  const dir = await skillRoot(root, input.skill);
  await containedFile(dir, "SKILL.md");
  const { stdout } = await run(input.nodeBinary, [path.join(root, "bin/hong-skills.js"), "usage-record", input.skill, "--kind", input.kind, "--session", input.session, "--event-id", input.eventId, "--provider", "bb", "--json"], { cwd: root, timeout: 20000, maxBuffer: 1024 * 1024, signal });
  const result = JSON.parse(stdout);
  if (result.ok !== true || result.recorded !== true) throw new Error("HSR could not persist the tracking event.");
  return { recorded: true, eventId: result.eventId, skill: result.skill, kind: result.kind };
}
