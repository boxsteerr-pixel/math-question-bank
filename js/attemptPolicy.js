/* A manual score is deliberately neither correct nor wrong until the input is resolved. */
export function initialAttemptPolicy(verdict){
  if(verdict?.manualCheck)return {firstAttemptCorrect:null,resolved:false,countsForStatistics:false,recordsWrongQuestion:false};
  const correct=Boolean(verdict?.correct);
  return {firstAttemptCorrect:correct,resolved:correct,countsForStatistics:true,recordsWrongQuestion:!correct};
}
