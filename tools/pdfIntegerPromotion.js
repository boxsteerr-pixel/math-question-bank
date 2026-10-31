import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {score} from '../js/scoring.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
const fileHash=value=>crypto.createHash('sha256').update(JSON.stringify(value,null,2)+'\n').digest('hex');

// Explicit candidate-ID binding, frozen prefix and repeatable append. No position-based answers.
export function applyPdfIntegerPromotion(bank,manifest){
  assert.equal(manifest.manifestVersion,1);assert.equal(manifest.batchId,'pdf-20261023-integer');
  assert.equal(manifest.baselineCount,350);assert.equal(manifest.entries.length,10);
  const base=bank.slice(0,manifest.baselineCount);
  assert.equal(fileHash(base),manifest.baselineSha256,'旧350题逐字段冻结');
  const allowed=new Set(base.flatMap(q=>Object.keys(q)));
  const max=Math.max(...base.map(q=>Number(q.id.slice(1))));
  assert.equal(new Set(manifest.entries.map(e=>e.candidateId)).size,manifest.entries.length);
  const additions=manifest.entries.map((entry,index)=>{
    assert.match(entry.candidateId,/^CAND-I-\d{3}$/);
    const q=entry.question;assert.equal(q.id,`Q${String(max+index+1).padStart(4,'0')}`);
    for(const key of Object.keys(q))assert.ok(allowed.has(key),'不得扩展正式字段 '+key);
    assert.equal(q.status,'approved');assert.equal(q.auditStatus,'verified');assert.equal(q.scoringSupport,'auto');
    assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint));
    const result=score(q,Array.isArray(q.answer)?q.answer:[q.answer]);
    assert.equal(result.correct,true,q.id);assert.ok(!result.manualCheck);
    return structuredClone(q);
  });
  const final=[...base,...additions];
  assert.equal(new Set(final.map(q=>q.id)).size,final.length);
  assert.equal(fileHash(final),manifest.formalSha256,'本次审核后的360题内容冻结');
  if(bank.length!==manifest.baselineCount)assert.deepEqual(bank,final,'只允许首次追加或相同的幂等重建');
  return final;
}
