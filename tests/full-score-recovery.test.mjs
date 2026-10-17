import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFullScoreRecovery, decodeFullScoreRecovery } from '../lib/full-score-recovery.mjs';

test('local recovery credentials round-trip without accepting URLs or extra fields',()=>{
  const credential={id:'a'.repeat(36),token:'b'.repeat(43)};
  assert.deepEqual(decodeFullScoreRecovery(encodeFullScoreRecovery(credential)),credential);
  for(const input of ['https://example.com/job',`qinban-job:v1:../file:${credential.token}`,`qinban-job:v1:job:${credential.token}:extra`,'x'.repeat(241)])assert.throws(()=>decodeFullScoreRecovery(input));
});
