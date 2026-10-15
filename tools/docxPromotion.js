import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {parseFactorizedForm} from '../js/factorizedForm.js';
import {score} from '../js/scoring.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';

export const PROMOTION_IDS=Object.freeze([
  ...Array.from({length:10},(_,i)=>`CAND-DOCX-2026-10-C10-${String(i+1).padStart(3,'0')}`),
  ...Array.from({length:29},(_,i)=>`CAND-DOCX-2026-10-C11-${String(i+1).padStart(3,'0')}`),
  ...Array.from({length:49},(_,i)=>`CAND-DOCX-2026-10-C12-${String(i+1).padStart(3,'0')}`)
]);
export const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const candidateContent=q=>Object.fromEntries(Object.entries(q).filter(([k])=>!['status','finalId'].includes(k)));
const batchFor=id=>id.includes('-C10-')?'docx-computation-supplement-2026-10-batch-a':id.includes('-C11-')?'docx-2026-10-c11':'docx-2026-10-c12';
const constrained=id=>id==='CAND-DOCX-2026-10-C11-019'||id.includes('-C12-');
const norm=s=>String(s).normalize('NFKC').replace(/[−﹣–—]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/[\[\{]/g,'(').replace(/[\]\}]/g,')').replace(/\s/g,'');
const intent=q=>/因式分解|分解因式/.test(q.question)?'factorization':/已知|如果|若|互为|其中|求值|适当的整式/.test(q.question)?'contextual':'calculation';
const bare=q=>norm(q.question).replace(/^(因式分解|分解因式|合并同类项|计算|化简)[:：]?/,'').replace(/[．。;；]$/,'').replace(/=_{2,}[．。]?$/,'');
function structure(ast){
  if(ast.op==='+'||ast.op==='-'){
    const terms=(a,sign=1)=>a.op==='+'?[...terms(a.left,sign),...terms(a.right,sign)]:a.op==='-'?[...terms(a.left,sign),...terms(a.right,-sign)]:[[sign,structure(a)]];
    return ['sum',terms(ast).map(x=>JSON.stringify(x)).sort()];
  }
  if(ast.op==='*'){
    const terms=a=>a.op==='*'?[...terms(a.left),...terms(a.right)]:[structure(a)];
    return ['product',terms(ast).map(x=>JSON.stringify(x)).sort()];
  }
  if(ast.op==='number')return ['number',ast.value.map(String)];
  if(ast.op==='variable')return ['variable',ast.name];
  if(ast.op==='power')return ['power',structure(ast.base),ast.exponent];
  if(ast.op==='negative')return ['negative',structure(ast.base)];
  return [ast.op,structure(ast.left),structure(ast.right)];
}
export function duplicateKind(a,b){
  if(norm(a.question)===norm(b.question))return 'normalized_text';
  if(intent(a)!==intent(b))return null;
  const x=bare(a),y=bare(b);
  if(x===y)return 'normalized_expression_text';
  if(intent(a)==='contextual')return null; // Conditions cannot be discarded.
  try{
    if(JSON.stringify(structure(parseFactorizedForm(x)))===JSON.stringify(structure(parseFactorizedForm(y))))return 'commutative_structure';
    // Factorization asks to decompose the polynomial itself; alternate expanded
    // representations of that same polynomial are the same exercise.
    if(intent(a)==='factorization'&&score({answerType:'expression',answer:x},[y],{scoringPolicyVersion:1}).correct===true)return 'same_factorization_polynomial';
  }catch(error){if(!(error instanceof Error))throw error;}
  return null;
}
export function auditPromotion(bank,pending){
  assert.equal(bank.length,199,'promotion前必须是199题');
  assert.equal(pending.length,280);assert.equal(new Set(PROMOTION_IDS).size,88);
  const byId=new Map(pending.filter(q=>q.candidateId).map(q=>[q.candidateId,q]));
  assert.equal(byId.size,pending.filter(q=>q.candidateId).length,'candidateId必须唯一');
  const selected=PROMOTION_IDS.map(id=>{const q=byId.get(id);assert.ok(q,id);return q});
  const others=pending.filter(q=>!PROMOTION_IDS.includes(q.candidateId));
  const rows=selected.map((q,i)=>{
    assert.equal(q.batchId,batchFor(q.candidateId));assert.equal(q.auditStatus,'verified');
    assert.equal(q.answerReviewStatus,'verified');assert.equal(q.scoringSupport,'auto');
    assert.ok(['number','expression','conditional_expression','ordered_terms','fill_blank','multiple_blank'].includes(q.answerType));assert.ok(q.question?.trim());assert.ok(String(q.answer??'').trim());
    assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint));
    assert.ok(q.source&&q.answerSource&&q.sourceIndex&&Number.isInteger(q.sourceParagraphIndex)&&Number.isInteger(q.answerParagraphIndex));
    for(const key of ['questionPage','answerPage'])assert.ok(Number.isInteger(q[key])&&q[key]>0||q[key]===null&&(q.pageStatus==='unstable_docx_pagination'||/未提供稳定页码/.test(q.reviewNote)),'页码必须可靠或明确不可稳定定位');
    assert.equal(q.answerConstraint??null,constrained(q.candidateId)?'fully_factored':null);
    if(constrained(q.candidateId)){assert.equal(q.fullyFactored,true);assert.equal(q.answerType,'expression');}
    const result=score(q,Array.isArray(q.answer)?q.answer:[q.answer]);assert.equal(result.correct,true,q.candidateId);assert.ok(!result.manualCheck);
    const matches=(set)=>set.flatMap(other=>{const kind=duplicateKind(q,other);return kind?[{id:other.id||other.candidateId,kind}]:[]});
    const formalDuplicates=matches(bank),selectedDuplicates=matches(selected.slice(0,i)),otherPendingDuplicates=matches(others);
    assert.deepEqual(formalDuplicates,[],q.candidateId+'与正式题重复');
    assert.deepEqual(selectedDuplicates,[],q.candidateId+'本批重复');
    assert.deepEqual(otherPendingDuplicates,[],q.candidateId+'与未晋升pending重复，需要人工确认');
    return {candidateId:q.candidateId,batchId:q.batchId,formalId:`Q${String(200+i).padStart(4,'0')}`,questionFingerprint:hash(q.question),answerFingerprint:hash(q.answer),candidateFingerprint:hash(candidateContent(q)),knowledgePoint:q.knowledgePoint,answerType:q.answerType,answerConstraint:q.answerConstraint??null,standardResult:result,formalDuplicates,selectedDuplicates,otherPendingDuplicates};
  });
  return {manifestVersion:1,promotionId:'docx-2026-10-c10-c12',baselineCount:199,baselineFingerprint:hash(bank),unpromotedPendingFingerprint:hash(others),entries:rows};
}
export function formalFromCandidate(q,entry){
  const {candidateId,batchId,status,finalId,...fields}=q;
  return {id:entry.formalId,...fields,status:'approved'};
}
export function applyDocxPromotions(base,pending,manifest){
  assert.equal(manifest.manifestVersion,1);assert.equal(base.length,199);
  assert.equal(hash(base),manifest.baselineFingerprint,'旧199题必须完全冻结');
  assert.deepEqual(manifest.entries.map(e=>e.candidateId),PROMOTION_IDS);
  assert.equal(hash(pending.filter(q=>!PROMOTION_IDS.includes(q.candidateId))),manifest.unpromotedPendingFingerprint,'其余pending必须保持原样');
  const byId=new Map(pending.filter(q=>q.candidateId).map(q=>[q.candidateId,q]));
  assert.equal(byId.size,pending.filter(q=>q.candidateId).length);
  const additions=manifest.entries.map((e,i)=>{
    assert.equal(e.formalId,`Q${String(200+i).padStart(4,'0')}`);
    const q=byId.get(e.candidateId);assert.ok(q);assert.equal(hash(candidateContent(q)),e.candidateFingerprint);
    assert.ok(q.status==='pending_review'||q.status==='promoted');
    if(q.status==='promoted')assert.equal(q.finalId,e.formalId);
    const result=score(q,Array.isArray(q.answer)?q.answer:[q.answer]);assert.equal(result.correct,true);assert.ok(!result.manualCheck);
    return formalFromCandidate(q,e);
  });
  const final=[...base,...additions];assert.equal(final.length,287);
  assert.equal(final.filter(q=>q.answerConstraint==='fully_factored').length,67);
  // Mutate lifecycle fields only after every input and output was validated.
  for(const e of manifest.entries){const q=byId.get(e.candidateId);q.status='promoted';q.finalId=e.formalId;}
  return final;
}
