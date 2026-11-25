import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import '../js/version.js';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const baseline=JSON.parse(read('tests/fixtures/pwa-release-368-baseline.json'));
const learningApproval=JSON.parse(read('tests/fixtures/learning-range-approved-changes.json'));
const displayApproval=JSON.parse(read('tests/fixtures/pwa-preview-title-287.json'));
const safety=JSON.parse(read('tests/fixtures/pwa-stability-approved-changes.json'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const archived={...baseline.frozenFiles};
for(const [file,approval] of Object.entries(learningApproval.files)){
  assert.equal(approval.before,archived[file]);
  archived[file]=approval.after;
}
for(const [file,approval] of Object.entries(displayApproval.files))archived[file]=approval.after;
for(const [file,approval] of Object.entries(safety.files)){
  const previous=execFileSync('git',['show',`${safety.baselineRef}:${file}`],{cwd:root});
  assert.equal(digest(previous),approval.before,'修复必须基于固定线上提交 '+file);
  if(archived[file])assert.equal(approval.before,archived[file],'旧发行审批必须连续 '+file);
}
for(const [file,hash] of Object.entries({...archived,...Object.fromEntries(Object.entries(safety.files).map(([name,value])=>[name,value.after]))})){
  assert.equal(digest(fs.readFileSync(path.join(root,file))),hash,'生产文件必须匹配获准哈希 '+file);
}
assert.match(read('question-preview.html'),/id="preview-title">题库显示预览（加载中…）/);
assert.doesNotMatch(read('question-preview.html'),/(162|179|199|287)\s*题/);
assert.match(read('js/questionPreview.js'),/querySelector\('#preview-title'\)\.textContent=`\$\{bank\.length\} 题显示预览`/);
const config=globalThis.MATH_PWA_VERSION;
assert.equal(config.cacheVersion,safety.cache);
assert.equal(config.appVersion,safety.appVersion);
assert.equal(config.dbVersion,baseline.dbVersion);
assert.equal(config.questionBankVersion,baseline.expectedQuestionBankVersion);
assert.equal(Number(config.cacheVersion.split('-v')[1]),Number(safety.previousCache.split('-v')[1])+1);
const scope='https://example.test/math/',worker=read('service-worker.js');
const self={MATH_PWA_VERSION:config,registration:{scope},addEventListener(){}};
const context={self,URL,importScripts:p=>assert.equal(p,'./js/version.js')};
vm.runInNewContext(worker+';globalThis.assetList=assets;',context);
export const releaseAssets=Array.from(context.assetList,url=>{
  assert.ok(url.startsWith(scope));
  return './'+url.slice(scope.length);
});
const cached=new Set(releaseAssets.map(p=>p==='./'?'index.html':p.replace(/^\.\//,'')));
const graph=new Set;
function visit(file){
  if(graph.has(file))return;graph.add(file);
  assert.ok(fs.readdirSync(path.dirname(path.join(root,file))).includes(path.basename(file)),'大小写/文件路径 '+file);
  assert.ok(cached.has(file),'生产依赖必须预缓存 '+file);
  const source=read(file);
  const re=file.endsWith('.html')?/<script[^>]+src=["']([^"']+)["']/g:/(?:from\s*|import\s*)["']([^"']+)["']/g;
  for(const match of source.matchAll(re)){
    assert.ok(match[1].startsWith('.'),'不引入未缓存外部依赖');
    visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])));
  }
}
for(const page of ['index.html','parent.html','question-preview.html'])visit(page);
for(const item of ['manifest.json','css/style.css','data/questions.json',...JSON.parse(read('manifest.json')).icons.map(i=>i.src.replace(/^\.\//,''))])assert.ok(cached.has(item),item);
assert.equal(new Set(releaseAssets).size,releaseAssets.length);
assert.ok(!releaseAssets.some(p=>/tests|reports|pending|backup-before/.test(p)));
assert.doesNotMatch(worker,/indexedDB|localStorage|deleteDatabase|\.clear\(/,'SW只操作静态Cache Storage');
assert.match(worker,/key !== previous/,'保留前一发行的缓存');
assert.doesNotMatch(worker,/self\.clients\.claim\(/,'首次安装及自动激活不能强制接管页面');
assert.match(worker,/event\.data\?\.type === 'APPLY_SAFE_UPDATE'/);
assert.doesNotMatch(read('question-preview.html'),/id="clear"/);
assert.doesNotMatch(read('js/questionPreview.js'),/\.\/db\.js|indexedDB|clearLearningData/);
assert.match(read('js/updateManager.js'),/updateViaCache: 'none'/);
const bank=JSON.parse(read('data/questions.json'));
assert.equal(digest(fs.readFileSync(path.join(root,'data/questions.json'))),baseline.expectedFormalSha256);
assert.equal(bank.length,baseline.expectedCount);
assert.equal(bank.filter(q=>q.answerConstraint==='fully_factored').length,baseline.expectedFullyFactored);
console.log(`PWA release static PASS: v34 -> v35; ${releaseAssets.length} static entries; ${graph.size} dependency-graph nodes cached; preview read-only and bank bytes unchanged.`);
