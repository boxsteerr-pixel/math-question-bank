import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditPromotion} from './docxPromotion.js';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const manifest=auditPromotion(read('data/questions.json'),read('data/questions_pending.json'));
const target=new URL('data/docx-promotion-2026-10.json',root);
if(fs.existsSync(target))throw Error('Manifest already exists: do not overwrite an approved identity mapping');
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');
console.log(`Preflight PASS: ${manifest.entries.length}/88; manifest ${fileURLToPath(target)}`);
