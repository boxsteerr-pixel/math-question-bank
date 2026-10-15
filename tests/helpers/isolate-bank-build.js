import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export function verifyIsolatedBuild(root,expectedFormal,expectedPending){
  const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'math-docx-promotion-'));
  for(const dir of ['tools','data','review','js'])fs.mkdirSync(path.join(isolated,dir));
  const files=['tools/build-final-bank.js','tools/factorizationConstraintApprovals.js','tools/docxPromotion.js','data/docx-promotion-2026-10.json','data/questions.json','data/questions_pending.json',...fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')).map(f=>'js/'+f)];
  for(const name of files)fs.copyFileSync(path.join(root,name),path.join(isolated,name));
  fs.writeFileSync(path.join(isolated,'package.json'),JSON.stringify({type:'module'}));
  for(let run=0;run<2;run++){
    execFileSync(process.execPath,[path.join(isolated,'tools/build-final-bank.js')],{cwd:isolated,encoding:'utf8'});
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(isolated,'data/questions.json'),'utf8')),expectedFormal,'287题重建必须完全一致');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(isolated,'data/questions_pending.json'),'utf8')),expectedPending,'280条pending必须只包含获准生命周期变更');
  }
  return isolated;
}
