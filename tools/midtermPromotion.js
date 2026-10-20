import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {score} from '../js/scoring.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
export const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// This manifest is the source of truth for the explicitly reviewed additions.
// Never infer question/answer mapping from a source document's array positions.
export function applyMidtermPromotion(bank,manifest){
  assert.equal(manifest.manifestVersion,1);
  assert.equal(manifest.batchId,'midterm-20261019');
  assert.equal(manifest.baselineCount,287);
  assert.equal(fingerprint(bank.slice(0,287)),manifest.baselineFingerprint,'原287题逐字段冻结');
  const additions=manifest.entries.map((entry,i)=>{
    assert.equal(entry.question.id,`Q${String(288+i).padStart(4,'0')}`);
    assert.ok(entry.candidateId.startsWith('CAND-MIDTERM-20261019-'));
    const q=entry.question;
    assert.equal(q.status,'approved');assert.equal(q.auditStatus,'verified');assert.equal(q.scoringSupport,'auto');
    assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint));
    const r=score(q,Array.isArray(q.answer)?q.answer:[q.answer]);assert.equal(r.correct,true,q.id);assert.ok(!r.manualCheck);
    return structuredClone(q);
  });
  const final=[...bank.slice(0,287),...additions];
  assert.equal(new Set(final.map(q=>q.id)).size,final.length);
  if(bank.length!==287)assert.deepEqual(bank,final,'只允许首次追加或完全相同的幂等重建');
  return final;
}
