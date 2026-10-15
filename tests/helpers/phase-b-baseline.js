// Remove ONLY the metadata explicitly authorized in phase B. Every other
// field, including pre-existing C12 fullyFactored certificates, stays frozen.
export function beforePhaseBConstraint(question){
  const q={...question},n=Number(q.id?.slice(1));
  if((n>=163&&n<=179)||q.candidateId==='CAND-DOCX-2026-10-C11-019'){
    delete q.answerConstraint;delete q.fullyFactored;
  }else if(/^CAND-DOCX-2026-10-C12-\d{3}$/.test(q.candidateId||''))delete q.answerConstraint;
  return q;
}
