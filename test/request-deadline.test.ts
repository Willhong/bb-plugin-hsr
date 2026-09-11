import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withDeadline} from '../request-deadline.js';
test('an unanswered request stops waiting and a later retry can succeed',async()=>{
  await assert.rejects(withDeadline(new Promise(()=>{}),15),/지연/);
  assert.equal(await withDeadline(Promise.resolve('retry succeeded'),100),'retry succeeded');
});
