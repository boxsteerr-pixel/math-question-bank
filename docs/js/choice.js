export const isSingleChoice=question=>question?.questionType==='single_choice';

export function validateChoice(question){
  if(!isSingleChoice(question)||!Array.isArray(question.options)||question.options.length<2||question.options.length>26)return false;
  const ids=question.options.map(option=>option?.id);
  return ids.every(id=>typeof id==='string'&&id.trim().length>0)&&new Set(ids).size===ids.length&&
    question.options.every(option=>typeof option.text==='string'&&option.text.trim())&&
    Array.isArray(question.correctOptionIds)&&question.correctOptionIds.length===1&&ids.includes(question.correctOptionIds[0]);
}

export function scoreChoice(question,inputs){
  if(!validateChoice(question))return {correct:false,manualCheck:true,reason:'invalid_choice_question'};
  if(!Array.isArray(inputs)||inputs.length!==1||!question.options.some(option=>option.id===inputs[0]))return {correct:false,manualCheck:true,reason:'invalid_choice_answer'};
  return {correct:inputs[0]===question.correctOptionIds[0]};
}

export function optionOrder(question,seed){
  if(!validateChoice(question))throw Error('选择题选项无效');
  const ids=question.options.map(option=>option.id);
  const text=[question.question,...question.options.map(option=>option.text)].join(' ');
  if(!question.shuffleOptions||question.shuffleSafetyConfirmed!==true||/以上|上述|下列|前[一二三四]|[A-ZＡ-Ｚ]\s*(?:与|和|及|、|或)\s*[A-ZＡ-Ｚ]|选项\s*[A-ZＡ-Ｚ]/i.test(text))return ids;
  let hash=2166136261;
  for(const char of `${seed}:${question.id}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  for(let i=ids.length-1;i>0;i--){hash=(Math.imul(hash,1664525)+1013904223)>>>0;const j=hash%(i+1);[ids[i],ids[j]]=[ids[j],ids[i]]}
  return ids;
}
