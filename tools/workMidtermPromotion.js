import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {score} from '../js/scoring.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
export function applyWorkMidtermPromotion(bank,manifest){
  assert.equal(manifest.batchId,'work-midterm-20261030');assert.equal(manifest.baselineCount,360);assert.equal(manifest.entries.length,8);
  const base=bank.slice(0,360),hash=crypto.createHash('sha256').update(JSON.stringify(base,null,2)+'\n').digest('hex');
  assert.equal(hash,manifest.baselineSha256,'旧360题必须保持冻结');
  const allowed=new Set(base.flatMap(q=>Object.keys(q)));
  const extra=manifest.entries.map((entry,i)=>{
    assert.equal(entry.candidateId,`WORK-${i+1}`);const q=entry.question;
    assert.equal(q.id,`Q${String(361+i).padStart(4,'0')}`);assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint));
    for(const key of Object.keys(q))assert.ok(allowed.has(key),'新增题不能扩展schema '+key);
    const result=score(q,[q.answer]);assert.equal(result.correct,true,q.id);assert.ok(!result.manualCheck);return structuredClone(q);
  });
  const final=[...base,...extra];assert.equal(new Set(final.map(q=>q.id)).size,final.length);
  if(bank.length!==360)assert.deepEqual(bank,final,'已有内容必须与获准追加一致');
  return final;
}
