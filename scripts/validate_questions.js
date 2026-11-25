import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=path.join(root,'data'),reports=path.join(root,'reports');
const validLocation=value=>Number.isInteger(value)&&value>0;
function sourceLocations(question){
  if(/\.docx$/i.test(question.source))return [['sourceParagraphIndex',question.sourceParagraphIndex],['answerParagraphIndex',question.answerParagraphIndex]];
  return [['questionPage',question.questionPage],['answerPage',question.answerPage]];
}
const all=JSON.parse(fs.readFileSync(path.join(data,'questions.json'),'utf8'));
const review=JSON.parse(fs.readFileSync(path.join(data,'questions_needs_review.json'),'utf8'));
const items=[...all,...review],allowedStatus=new Set(['pending','needsReview','approved','rejected']),allowedType=new Set(['number','expression','fill_blank','multiple_blank','conditional_expression','ordered_terms']);
const fail=[];const ids=new Map(),texts=new Map(),sourceKeys=new Map();
for(const q of items){if(ids.has(q.id))fail.push(`重复 ID：${q.id}`);ids.set(q.id,q);if(!q.question)fail.push(`${q.id} 的 question 为空`);if(q.answer===''||q.answer==null)fail.push(`${q.id} 的 answer 为空`);const locations=sourceLocations(q);for(const [field,position] of locations)if(!validLocation(position))fail.push(`${q.id} 的 ${field} 缺失或无效`);if(!q.knowledgePoint)fail.push(`${q.id} 的 knowledgePoint 为空`);if(!allowedStatus.has(q.status))fail.push(`${q.id} 的 status 非法：${q.status}`);if(!allowedType.has(q.answerType))fail.push(`${q.id} 的 answerType 非法：${q.answerType}`);if(q.status==='approved'&&(q.answer===''||q.answer==null))fail.push(`${q.id} 是 approved 但没有标准答案`);const text=q.question.replace(/\s/g,'');if(texts.has(text))fail.push(`完全重复题目：${q.id} 与 ${texts.get(text)}`);else texts.set(text,q.id);const key=`${q.source}|${locations[0][1]}|${q.sourceIndex}`;if(sourceKeys.has(key))fail.push(`同一原题重复拆分：${q.id} 与 ${sourceKeys.get(key)}`);else sourceKeys.set(key,q.id);}
const by=(key)=>items.reduce((m,q)=>(m[q[key]]=(m[q[key]]||0)+1,m),{});const lines=['# 题库校验报告','',`- 校验时间：${new Date().toISOString()}`,`- 参与校验题数：${items.length}`,`- approved：${all.length}`,`- needsReview：${review.length}`,`- 结果：${fail.length?'未通过':'通过'}`,'','## 检查项','',...['ID 唯一性','题目非空','标准答案非空','PDF 页码或 DOCX 段落位置有效','知识点存在','状态与答案类型合法','approved 含标准答案','完全重复题','同一原题重复拆分'].map(x=>`- ${x}：${fail.length?'见下方异常':'通过'}`),'','## 异常','',...(fail.length?fail.map(x=>`- ${x}`):['- 无'])];
fs.writeFileSync(process.argv[2]||path.join(reports,'validation_report.md'),lines.join('\n')+'\n','utf8');
if(fail.length){console.error(fail.join('\n'));process.exitCode=1}else console.log('Validation passed.');
