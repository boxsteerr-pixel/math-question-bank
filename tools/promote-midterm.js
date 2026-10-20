import fs from 'node:fs';
import assert from 'node:assert/strict';
import {applyMidtermPromotion} from './midtermPromotion.js';
const url=p=>new URL('../'+p,import.meta.url),read=p=>JSON.parse(fs.readFileSync(url(p),'utf8'));
const bank=read('data/questions.json'),manifest=read('data/midterm-promotion-2026-10.json');
const final=applyMidtermPromotion(bank,manifest);
assert.deepEqual(final.slice(0,287),bank.slice(0,287));
fs.writeFileSync(url('data/questions.json'),JSON.stringify(final,null,2)+'\n');
console.log(`Midterm append PASS: ${bank.length} -> ${final.length}; original287 unchanged; pending/history untouched.`);
