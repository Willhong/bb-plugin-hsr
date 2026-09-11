import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageReport, visibleRows } from '../usage-view.js';
import type { Catalog } from '../contract.js';
const catalog: Catalog = {
  registryPath:'/registry',usageStatus:'ready',
  skills:['alpha','beta','unused'].map(name=>({name,description:`${name} 설명`,path:`/registry/skills/${name}/SKILL.md`})),
  history:{alpha:{calls:3,loads:2,applications:1,lastUsed:'2026-09-11T00:00:00Z'},beta:{calls:1,loads:1,applications:0,lastUsed:'2026-09-12T00:00:00Z'}},
};
test('usage shares retain the complete registry denominator when searched and filtered',()=>{
  const report=usageReport(catalog);
  assert.equal(report.total,3);assert.equal(report.observed,2);
  assert.equal(report.loads,3);assert.equal(report.applications,1);
  assert.equal(visibleRows(report,'alpha','all','observations')[0].share,75);
  assert.equal(visibleRows(report,'','applied','observations')[0].share,75);
  assert.deepEqual(visibleRows(report,'','unobserved','observations').map(r=>r.name),['unused']);
  assert.equal(visibleRows(report,'','all','recent')[0].name,'beta');
  assert.deepEqual(visibleRows(report,'does-not-exist','all','name'),[]);
});
test('empty and unobserved registries never display invalid percentages',()=>{
  const report=usageReport({...catalog,history:{}});
  assert.equal(report.observations,0);
  assert.ok(report.rows.every(row=>row.share===0));
  assert.equal(usageReport({...catalog,skills:[],history:{}}).total,0);
});
