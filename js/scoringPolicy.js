// Version 1 is the original algebraic-equivalence policy. Never reinterpret an
// unversioned task/attempt as the currently installed policy.
export const LEGACY_SCORING_POLICY_VERSION=1;
export const CURRENT_SCORING_POLICY_VERSION=2;
export const supportedScoringPolicy=version=>version===1||version===2||version===3;
export const scoringPolicyVersion=record=>record?.scoringPolicyVersion===undefined?LEGACY_SCORING_POLICY_VERSION:record.scoringPolicyVersion;
export function freezeTaskScoringPolicy(task,questions){
  const byId=new Map(questions.map(q=>[q.id,q]));
  const version=questions.some(q=>['rational_expression','rational_conditions','rational_solutions','rational_multiple_blank'].includes(q.answerType))?3:CURRENT_SCORING_POLICY_VERSION;
  return {...task,scoringPolicyVersion:version,scoringQuestionPolicies:Object.fromEntries(task.questionIds.map(id=>{
    const q=byId.get(id);
    if(!q)throw Error('无法冻结缺失题目的判分策略');
    return [id,{answerConstraint:q.answerConstraint??null,fullyFactored:q.fullyFactored===true,...(version===3?{answerType:q.answerType}:{}),...(q.questionType==='single_choice'?{correctOptionIds:[...q.correctOptionIds]}:{}),...(q.answerType==='rational_expression'?{answer:q.answer,originalExpression:q.originalExpression}:{}),...(['rational_conditions','rational_solutions'].includes(q.answerType)?{conditionVariable:q.conditionVariable,conditionValues:[...q.conditionValues]}:{}),...(q.answerType==='rational_solutions'?{equationLeft:q.equationLeft,equationRight:q.equationRight}:{}),...(q.answerType==='rational_multiple_blank'?{answer:[...q.answer],blankPolicies:structuredClone(q.blankPolicies)}:{})}];
  }))};
}
export function freezeAttemptScoringPolicy(task,questionId){
  const version=scoringPolicyVersion(task);
  return {scoringPolicyVersion:version,...(version>=2&&version<=3?{scoringQuestionPolicy:{...task.scoringQuestionPolicies?.[questionId]}}:{})};
}
export function questionForFrozenPolicy(question,record,questionId=question.id){
  const version=scoringPolicyVersion(record);
  if(!supportedScoringPolicy(version))return {manualCheck:true,reason:'unsupported_scoring_policy'};
  if(version===LEGACY_SCORING_POLICY_VERSION)return {question:{...question,answerConstraint:null},version};
  const policy=record?.scoringQuestionPolicies?.[questionId]??record?.scoringQuestionPolicy;
  if(!policy||!Object.hasOwn(policy,'answerConstraint'))return {manualCheck:true,reason:'missing_frozen_question_policy'};
  if(question.questionType==='single_choice'&&!Array.isArray(policy.correctOptionIds))return {manualCheck:true,reason:'missing_frozen_choice_answer'};
  const type=version===3?policy.answerType:question.answerType;
  if(version===3&&typeof type!=='string')return {manualCheck:true,reason:'missing_frozen_answer_type'};
  if(type==='rational_expression'&&(version!==3||typeof policy.answer!=='string'||typeof policy.originalExpression!=='string'))return {manualCheck:true,reason:'missing_frozen_rational_policy'};
  if(['rational_conditions','rational_solutions'].includes(type)&&(version!==3||typeof policy.conditionVariable!=='string'||!Array.isArray(policy.conditionValues)))return {manualCheck:true,reason:'missing_frozen_rational_policy'};
  if(type==='rational_solutions'&&(typeof policy.equationLeft!=='string'||typeof policy.equationRight!=='string'))return {manualCheck:true,reason:'missing_frozen_equation'};
  if(type==='rational_multiple_blank'&&(!Array.isArray(policy.answer)||!Array.isArray(policy.blankPolicies)||policy.answer.length!==policy.blankPolicies.length))return {manualCheck:true,reason:'missing_frozen_blank_policy'};
  return {question:{...question,answerType:type,answerConstraint:policy.answerConstraint,fullyFactored:policy.fullyFactored===true,...(question.questionType==='single_choice'?{correctOptionIds:policy.correctOptionIds}:{}),...(type==='rational_expression'?{answer:policy.answer,originalExpression:policy.originalExpression}:{}),...(['rational_conditions','rational_solutions'].includes(type)?{conditionVariable:policy.conditionVariable,conditionValues:policy.conditionValues}:{}),...(type==='rational_solutions'?{equationLeft:policy.equationLeft,equationRight:policy.equationRight}:{}),...(type==='rational_multiple_blank'?{answer:policy.answer,blankPolicies:policy.blankPolicies}:{})},version};
}
