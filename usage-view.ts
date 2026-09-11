import type { Catalog } from './contract.js';
import { rank } from './ranking.js';

export function usageReport(catalog: Catalog, now = Date.now()) {
  const rows = rank(catalog, '', now);
  const observations = rows.reduce((n, row) => n + row.calls, 0);
  return {
    fetchedAt: new Date(now).toISOString(),
    usageStatus: catalog.usageStatus,
    total: rows.length,
    observed: rows.filter(row => row.calls > 0).length,
    loads: rows.reduce((n, row) => n + row.loads, 0),
    applications: rows.reduce((n, row) => n + row.applications, 0),
    observations,
    rows: rows.map(row => ({ ...row, share: observations ? row.calls / observations * 100 : 0 })),
  };
}
export type UsageReport = ReturnType<typeof usageReport>;
export type UsageFilter = 'all' | 'loaded' | 'applied' | 'unobserved';
export type UsageSort = 'observations' | 'applications' | 'recent' | 'name';
export function visibleRows(report: UsageReport, query: string, filter: UsageFilter, sort: UsageSort) {
  const q = query.trim().toLocaleLowerCase();
  return report.rows.filter(row => (!q || `${row.name} ${row.description}`.toLocaleLowerCase().includes(q)) &&
    (filter === 'all' || (filter === 'loaded' && row.loads > 0) || (filter === 'applied' && row.applications > 0) || (filter === 'unobserved' && row.calls === 0)))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const value = sort === 'recent' ? (Date.parse(b.lastUsed ?? '') || 0) - (Date.parse(a.lastUsed ?? '') || 0)
        : sort === 'applications' ? b.applications - a.applications : b.calls - a.calls;
      return value || a.name.localeCompare(b.name);
    });
}
