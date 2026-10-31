import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import '../../js/version.js';
export const release=JSON.parse(fs.readFileSync(new URL('../fixtures/pwa-release-368-baseline.json',import.meta.url),'utf8'));
export const currentBank=JSON.parse(fs.readFileSync(new URL('../../data/questions.json',import.meta.url),'utf8'));
// A release-specific hash/count remains pinned; uniqueness/range checks derive from the real bank.
assert.equal(currentBank.length,release.expectedCount);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../../data/questions.json',import.meta.url))).digest('hex'),release.expectedFormalSha256);
assert.equal(new Set(currentBank.map(q=>q.id)).size,currentBank.length);
assert.deepEqual(currentBank.map(q=>q.id),Array.from({length:currentBank.length},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
assert.equal(currentBank.at(-1).id,release.expectedMaxId);
assert.equal(globalThis.MATH_PWA_VERSION.questionBankVersion,release.expectedQuestionBankVersion);
assert.equal(Number(globalThis.MATH_PWA_VERSION.questionBankVersion.split('.').at(-1)),currentBank.length);
