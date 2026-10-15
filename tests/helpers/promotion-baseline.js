import {PROMOTION_IDS} from '../../tools/docxPromotion.js';
// Preserve pre-promotion regression assertions; strip ONLY the two authorized
// lifecycle fields on the explicit 88-entry allowlist, not any question data.
export function beforePromotionLifecycle(q){
  if(!PROMOTION_IDS.includes(q.candidateId))return q;
  const {finalId,...before}=q;
  return {...before,status:'pending_review'};
}
