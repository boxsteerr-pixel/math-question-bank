// Version 1 is the original algebraic-equivalence policy. Never reinterpret an
// unversioned task/attempt as the currently installed policy.
export const LEGACY_SCORING_POLICY_VERSION=1;
export const CURRENT_SCORING_POLICY_VERSION=2;
export const supportedScoringPolicy=version=>version===1||version===2;
export const scoringPolicyVersion=record=>record?.scoringPolicyVersion===undefined?LEGACY_SCORING_POLICY_VERSION:record.scoringPolicyVersion;
export function freezeTaskScoringPolicy(task,questions){
  const byId=new Map(questions.map(q=>[q.id,q]));
  return {...task,scoringPolicyVersion:CURRENT_SCORING_POLICY_VERSION,scoringQuestionPolicies:Object.fromEntries(task.questionIds.map(id=>{
    const q=byId.get(id);
    if(!q)throw Error('无法冻结缺失题目的判分策略');
    return [id,{answerConstraint:q.answerConstraint??null,fullyFactored:q.fullyFactored===true}];
  }))};
}
export function freezeAttemptScoringPolicy(task,questionId){
  const version=scoringPolicyVersion(task);
  return {scoringPolicyVersion:version,...(version===CURRENT_SCORING_POLICY_VERSION?{scoringQuestionPolicy:{...task.scoringQuestionPolicies?.[questionId]}}:{})};
}
export function questionForFrozenPolicy(question,record,questionId=question.id){
  const version=scoringPolicyVersion(record);
  if(!supportedScoringPolicy(version))return {manualCheck:true,reason:'unsupported_scoring_policy'};
  if(version===LEGACY_SCORING_POLICY_VERSION)return {question:{...question,answerConstraint:null},version};
  const policy=record?.scoringQuestionPolicies?.[questionId]??record?.scoringQuestionPolicy;
  if(!policy||!Object.hasOwn(policy,'answerConstraint'))return {manualCheck:true,reason:'missing_frozen_question_policy'};
  return {question:{...question,answerConstraint:policy.answerConstraint,fullyFactored:policy.fullyFactored===true},version};
}
