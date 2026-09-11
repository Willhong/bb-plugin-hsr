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

test('plugin imports only public SDK and declared packages', () => {
  const scan = experimental_scanPublicSdkOnly(fileURLToPath(new URL('..', import.meta.url)), { allow: [/^yaml$/] });
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
  await fs.writeFile(path.join(root, 'bin/hong-skills.js'), `console.log(JSON.stringify({usageOk:true,rows:[{name:'alpha',calls:20,lastUsed:new Date().toISOString()},{name:'not-curated',calls:999,lastUsed:new Date().toISOString()}]}))`);
  return root;
}

test('catalog uses only curated sources and imports HSR history by name', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = await loadCatalog({ registryPath: root, nodeBinary: process.execPath });
  assert.deepEqual(catalog.skills.map(s => s.name), ['alpha', 'zebra']);
  assert.equal(catalog.skills[1].description, 'Rare skill with a folded description');
  assert.deepEqual(Object.keys(catalog.history), ['alpha']);
  assert.equal(catalog.usageStatus, 'ok');
  assert.equal(rank(catalog, {})[0].name, 'alpha');
  assert.equal(rank(catalog, {}, '계약')[0].name, 'alpha');
  assert.equal(rank(catalog, {}, 'zebra')[0].name, 'zebra');
  const rows = rank(catalog, {alpha:{count:10,lastUsed:Date.now()}});
  assert.ok(rows[0].score <= 20 && rows[0].score > 19, 'history and own usage must not be summed');
  const text = renderList(catalog, {}, { maxSkills: 30, budget: 1000, promote: 2, hostId: 'host-registry' });
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
  const text = renderList(catalog, {}, {maxSkills:100,budget:1000,promote:2,hostId:'h'});
  assert.ok(text.length <= 1000);
  assert.ok(!text.includes('skill-099:'));
  assert.match(renderList(catalog, {}, {query:'skill-099',maxSkills:30,budget:1000,promote:2,hostId:'h'}), /skill-099:/);
});

test('host RPC, agent tools, CLI, persistence and concurrent usage work through SDK harness', async t => {
  const root = await fixture(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const worker = experimental_createHostEntryHarness(hostEntry);
  const {bb,harness} = createFakePluginHost({
    pluginId:'hsr', experimental_hostEntry:true,
    settings:{registryHostId:'host-registry',registryPath:root,nodeBinary:process.execPath},
    experimental_callHostRpc: async ({method,input,hostId}) => {
      assert.equal(hostId,'host-registry');
      if (method !== 'catalog' && method !== 'read') throw new Error(`Unexpected RPC method ${method}`);
      return worker.experimental_call(method, input as never);
    },
  });
  t.after(async()=> {await harness.lifecycle.dispose(); await worker.experimental_dispose();});
  await plugin(bb);
  const list = await harness.behavior.callAgentTool('hsr_skill_list',{});
  assert.match(String(list), /alpha/);
  const reading = await harness.behavior.runCli(['read','alpha','--file','references/check.md','--limit','10']);
  assert.equal(reading.exitCode,0,reading.stderr);
  assert.equal(JSON.parse(reading.stdout!).nextOffset,10);
  const unknown = await harness.behavior.runCli(['used','not-curated']);
  assert.equal(unknown.exitCode,1);
  const recording = await Promise.all(Array.from({length:4},()=>harness.behavior.runCli(['used','zebra'])));
  assert.ok(recording.every(x=>x.exitCode===0));
  assert.ok(recording.some(x=>x.stdout?.includes('Count 4.')));
  const reloaded = await harness.lifecycle.reload(plugin);
  t.after(() => reloaded.harness.lifecycle.dispose());
  const after = await reloaded.harness.behavior.runCli(['list','--query','zebra','--json']);
  assert.equal(after.exitCode,0,after.stderr);
  assert.ok(JSON.parse(after.stdout!).rows[0].recordedScore > 3.9);
  await assert.rejects(reloaded.harness.behavior.setSettings({budgetChars:-1}));
  assert.equal((await reloaded.harness.behavior.runCli(['list','--unknown'])).exitCode,1);
});
