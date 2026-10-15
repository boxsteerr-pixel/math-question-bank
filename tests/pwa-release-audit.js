import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import '../js/version.js';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const baseline=JSON.parse(read('tests/fixtures/pwa-release-287-baseline.json'));
const displayApproval=JSON.parse(read('tests/fixtures/pwa-preview-title-287.json'));
for(const [file,hash] of Object.entries(baseline.frozenFiles)){
  const approval=displayApproval.files[file];if(approval)assert.equal(approval.before,hash,'显示修正必须明确绑定原冻结hash');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),approval?.after??hash,'除获准显示修正外，发布不能改变冻结文件 '+file);
}
for(const [file,approval] of Object.entries(displayApproval.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),approval.after);
assert.match(read('question-preview.html'),/id="preview-title">题库显示预览（加载中…）/);
assert.doesNotMatch(read('question-preview.html'),/(162|179|199|287)\s*题/);
assert.match(read('js/questionPreview.js'),/querySelector\('#preview-title'\)\.textContent=`\$\{bank\.length\} 题显示预览`/);
const config=globalThis.MATH_PWA_VERSION;
assert.equal(config.cacheVersion,'grade7-math-v30');assert.equal(config.appVersion,'0.4.8');assert.equal(config.dbVersion,3);
assert.equal(Number(config.cacheVersion.split('-v')[1]),Number(baseline.baselineCache.split('-v')[1])+1);
const worker=read('service-worker.js'),self={MATH_PWA_VERSION:config,addEventListener(){}};
const context={self,importScripts:p=>assert.equal(p,'./js/version.js')};
vm.runInNewContext(worker+';globalThis.assetList=ASSETS;',context);
export const releaseAssets=Array.from(context.assetList);
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
assert.match(worker,/key\.startsWith\(CACHE_PREFIX\)&&key!==CACHE/);
assert.match(worker,/self\.skipWaiting\(\)/);assert.match(worker,/self\.clients\.claim\(\)/);
assert.match(read('js/updateManager.js'),/updateViaCache:'none'/);
const bank=JSON.parse(read('data/questions.json'));assert.equal(bank.length,287);assert.equal(bank.filter(q=>q.answerConstraint==='fully_factored').length,67);
console.log(`PWA release static PASS: v29 -> v30; ${releaseAssets.length} static entries; ${graph.size} dependency-graph nodes cached; business hashes unchanged; approved dynamic-title hashes verified.`);
