import type { Catalog } from "./contract.js";

export function decayedScore(count: number, timestamp: number, now: number) {
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return count * Math.exp(-Math.max(0, now - timestamp) / (30 * 86400000));
}

export function rank(catalog: Catalog, query = "", now = Date.now()) {
  const q = query.trim().toLocaleLowerCase();
  return catalog.skills.filter(s => !q || `${s.name} ${s.description}`.toLocaleLowerCase().includes(q)).map(s => {
    const h = catalog.history[s.name];
    const historicalScore = h ? decayedScore(h.calls, Date.parse(h.lastUsed ?? ""), now) : 0;
    return { ...s, calls: h?.calls ?? 0, loads: h?.loads ?? 0, applications: h?.applications ?? 0, lastUsed: h?.lastUsed ?? null, score: historicalScore };
  }).sort((a, b) => Number(b.name.toLocaleLowerCase() === q) - Number(a.name.toLocaleLowerCase() === q) || b.score - a.score || a.name.localeCompare(b.name));
}

export function renderList(catalog: Catalog, options: { query?: string; maxSkills: number; budget: number; promote: number; hostId: string }) {
  const rows = rank(catalog, options.query);
  const header = `HSR: ${catalog.skills.length} curated skills; ${rows.length} matches. Tracking: ${catalog.usageStatus}.\nSource host: ${options.hostId}. Use hsr_skill_read(skill) to load the authoritative text. ★ score >= ${options.promote}; HSR ledger, 30-day decay.\n`;
  const footer = "\nSearch with query for omitted skills. This list does not replace BB's default skill prompt.";
  const lines: string[] = [];
  for (const row of rows.slice(0, options.maxSkills)) {
    const line = `${row.score >= options.promote ? "★" : "-"} ${row.name}: ${row.description.slice(0, 160)}${row.description.length > 160 ? "…" : ""}\n`;
    if ((header + lines.join("") + line + footer).length > options.budget) continue;
    lines.push(line);
  }
  const text = header + lines.join("") + footer;
  if (text.length > options.budget) throw new Error("Configured budget is too small for the list metadata.");
  return text;
}
