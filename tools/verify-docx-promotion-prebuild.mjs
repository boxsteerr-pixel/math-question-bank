import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {applyDocxPromotions} from './docxPromotion.js';
import {verifyIsolatedBuild} from '../tests/helpers/isolate-bank-build.js';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const pending=read('data/questions_pending.json');
const expected=applyDocxPromotions(read('data/questions.json'),pending,read('data/docx-promotion-2026-10.json'));
console.log('Prebuild PASS: '+verifyIsolatedBuild(root,expected,pending));
