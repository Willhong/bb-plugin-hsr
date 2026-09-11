import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCatalog, readSkill } from '../source.js';
import { rank, renderList } from '../ranking.js';
import { createFakePluginHost, experimental_scanPublicSdkOnly } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import plugin from '../server.js';
import hostEntry from '../host.js';
import { fileURLToPath } from 'node:url';
import { rpcContract } from '../ui-contract.js';

test('plugin imports only public SDK and declared packages', () => {
  const scan = experimental_scanPublicSdkOnly(fileURLToPath(new URL('..', import.meta.url)), { allow: [/^yaml$/, /^react$/] });
  assert.deepEqual(scan.violations, []);
  assert.deepEqual(scan.privateDependencies, []);
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hsr-test-'));
  await fs.mkdir(path.join(root, 'skills', 'alpha', 'references'), { recursive: true });
  await fs.mkdir(path.join(root, 'skills', 'zebra'), { recursive: true });
  await fs.mkdir(path.join(root, 'bin'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'hong-skill-registry' }));
  await fs.writeFile(path.join(root, 'skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: "저장 동작과 API 계약을 검증한다"\n---\nAlpha body');
  await fs.writeFile(path.join(root, 'skills/zebra/SKILL.md'), '---\nname: zebra\ndescription: >-\n  Rare skill with a folded\n  description\n---\nZebra body');
  await fs.writeFile(path.join(root, 'skills/alpha/references/check.md'), 'Supporting instructions');
  await fs.writeFile(path.join(root, 'bin/hong-skills.js'), `
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'events');fs.mkdirSync(dir,{recursive:true});
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
if(args[0]==='usage-record') {
  const skill=args[1];if(!['alpha','zebra'].includes(skill))process.exit(1);
  const eventId=value('--event-id'),kind=value('--kind');
  fs.writeFileSync(path.join(dir,eventId+'.json'),JSON.stringify({skill,kind}));
  console.log(JSON.stringify({ok:true,recorded:true,eventId,skill,kind}));
} else {
  const events=fs.readdirSync(dir).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f))));
  const rows=['alpha','zebra','not-curated'].map(name=>{const es=events.filter(e=>e.skill===name);return {name,calls:(name==='alpha'?20:0)+es.length,loads:(name==='alpha'?20:0)+es.filter(e=>e.kind==='loaded').length,applications:es.filter(e=>e.kind==='applied').length,lastUsed:new Date().toISOString()};});
  console.log(JSON.stringify({usageOk:true,collection:{engine:'hsr-native',status:'ready'},rows}));
}`);
  return root;
}

test('catalog uses only curated sources and imports HSR history by name', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = await loadCatalog({ registryPath: root, nodeBinary: process.execPath });
  assert.deepEqual(catalog.skills.map(s => s.name), ['alpha', 'zebra']);
  assert.equal(catalog.skills[1].description, 'Rare skill with a folded description');
  assert.deepEqual(Object.keys(catalog.history), ['alpha', 'zebra']);
  assert.equal(catalog.usageStatus, 'ready');
  assert.equal(rank(catalog)[0].name, 'alpha');
  assert.equal(rank(catalog, '계약')[0].name, 'alpha');
  assert.equal(rank(catalog, 'zebra')[0].name, 'zebra');
  const rows = rank(catalog);
  assert.ok(rows[0].score <= 20 && rows[0].score > 19, 'score comes from the single HSR ledger');
  const text = renderList(catalog, { maxSkills: 30, budget: 1000, promote: 2, hostId: 'host-registry' });
  assert.ok(text.length <= 1000);
  assert.equal((text.match(/★ alpha:/g) ?? []).length, 1);
});

test('missing usage cannot hide skills; reading is paginated and contains paths', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = await loadCatalog({ registryPath: root, nodeBinary: '/nonexistent/node' });
  assert.equal(catalog.skills.length, 2);
  assert.match(catalog.usageStatus, /unavailable/);
  const input = {registryPath:root,skill:'alpha',file:'references/check.md',offset:0,limit:10};
  const first = await readSkill(input);
  const rest = await readSkill({...input,offset:first.nextOffset!,limit:12000});
  assert.equal(first.text + rest.text, 'Supporting instructions');
  assert.equal(rest.nextOffset, null);
  await assert.rejects(readSkill({...input,file:'../../package.json'}), /inside/);
  await fs.symlink(path.join(root,'package.json'),path.join(root,'skills/alpha/references/out.md'));
  await assert.rejects(readSkill({...input,file:'references/out.md'}), /escapes/);
  await assert.rejects(readSkill({...input,skill:'../alpha'}));
});

test('large catalogs respect full output budget and query retrieves omitted skills', () => {
  const catalog = {registryPath:'/hsr',usageStatus:'ok',history:{},skills:Array.from({length:100},(_,i)=>({name:`skill-${String(i).padStart(3,'0')}`,description:'설명 '.repeat(100),path:`/hsr/skills/skill-${i}/SKILL.md`}))};
  const text = renderList(catalog, {maxSkills:100,budget:1000,promote:2,hostId:'h'});
  assert.ok(text.length <= 1000);
  assert.ok(!text.includes('skill-099:'));
  assert.match(renderList(catalog, {query:'skill-099',maxSkills:30,budget:1000,promote:2,hostId:'h'}), /skill-099:/);
});

test('host RPC, agent tools, CLI, persistence and concurrent usage work through SDK harness', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const worker = experimental_createHostEntryHarness(hostEntry);
  const {bb,harness} = createFakePluginHost({
    pluginId:'hsr', experimental_hostEntry:true,
    settings:{registryHostId:'host-registry',registryPath:root,nodeBinary:process.execPath},
    experimental_callHostRpc: async ({method,input,hostId}) => {
      assert.equal(hostId,'host-registry');
      if (method !== 'catalog' && method !== 'read' && method !== 'record') throw new Error(`Unexpected RPC method ${method}`);
      return worker.experimental_call(method, input as never);
    },
  });
  t.after(async()=> {await harness.lifecycle.dispose(); await worker.experimental_dispose();});
  await plugin(bb);
  const initialReport = rpcContract.usage.output.parse(await harness.behavior.callRpc('usage', {}));
  assert.equal(initialReport.total,2);
  assert.equal(initialReport.loads,20);
  assert.equal(initialReport.applications,0);
  assert.equal(initialReport.rows.find((r: {name:string})=>r.name==='alpha')?.share,100);
  const repeatedReport = rpcContract.usage.output.parse(await harness.behavior.callRpc('usage', {}));
  assert.equal(repeatedReport.loads,initialReport.loads,'viewing usage must not record a skill load');
  const list = await harness.behavior.callAgentTool('hsr_skill_list',{});
  assert.match(String(list), /alpha/);
  const page = JSON.parse(String(await harness.behavior.callAgentTool('hsr_skill_read', {skill:'alpha', limit:10})));
  assert.equal(page.nextOffset,10);
  await harness.behavior.callAgentTool('hsr_skill_read', {skill:'alpha',offset:10,limit:10});
  const loaded = await harness.behavior.runCli(['list','--query','alpha','--json']);
  assert.equal(JSON.parse(loaded.stdout!).rows[0].loads,21,'only the initial body page records a load');
  assert.equal(JSON.parse(loaded.stdout!).rows[0].applications,0,'loading is not an application');
  const reading = await harness.behavior.runCli(['read','alpha','--file','references/check.md','--limit','10']);
  assert.equal(reading.exitCode,0,reading.stderr);
  assert.equal(JSON.parse(reading.stdout!).nextOffset,10);
  const unknown = await harness.behavior.runCli(['used','not-curated']);
  assert.equal(unknown.exitCode,1);
  const recording = await Promise.all(Array.from({length:4},()=>harness.behavior.runCli(['used','zebra'])));
  assert.ok(recording.every(x=>x.exitCode===0));
  const recorded = await harness.behavior.runCli(['list','--query','zebra','--json']);
  assert.equal(JSON.parse(recorded.stdout!).rows[0].applications,4);
  const reloaded = await harness.lifecycle.reload(plugin);
  t.after(() => reloaded.harness.lifecycle.dispose());
  const after = await reloaded.harness.behavior.runCli(['list','--query','zebra','--json']);
  assert.equal(after.exitCode,0,after.stderr);
  assert.equal(JSON.parse(after.stdout!).rows[0].applications,4);
  assert.ok(JSON.parse(after.stdout!).rows[0].score > 3.9);
  await assert.rejects(reloaded.harness.behavior.setSettings({budgetChars:-1}));
  assert.equal((await reloaded.harness.behavior.runCli(['list','--unknown'])).exitCode,1);
});
