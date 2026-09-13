/* A manual score is deliberately neither correct nor wrong until the input is resolved. */
export function initialAttemptPolicy(verdict){
  if(verdict?.manualCheck)return {firstAttemptCorrect:null,resolved:false,countsForStatistics:false,recordsWrongQuestion:false};
  const correct=Boolean(verdict?.correct);
  return {firstAttemptCorrect:correct,resolved:correct,countsForStatistics:true,recordsWrongQuestion:!correct};
}

/* Keep true, false and null intact. The compatibility scorer is only for old records without this field. */
export function currentFirstCorrect(question,record,legacyScore){
  if(record?.firstAttemptCorrect!==undefined)return record.firstAttemptCorrect;
  if(!question||!record?.initialSubmitted||!record.firstAnswer?.some(value=>Boolean(value)))return false;
  return legacyScore(question,record.firstAnswer)===true;
}

export function summarizeFirstAttempts(states){
  const correct=states.filter(state=>state===true).length,wrong=states.filter(state=>state===false).length,pending=states.filter(state=>state===null).length,determined=correct+wrong;
  return {correct,wrong,pending,determined,accuracy:determined?correct/determined:null};
}

export function nextAttemptCount(current){return (Number.isInteger(current)&&current>0?current:1)+1}
