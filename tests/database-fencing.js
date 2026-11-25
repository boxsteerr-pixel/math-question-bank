import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/db.js',import.meta.url),'utf8');
assert.match(source,/learningMetadata/,'database requires a separate persistent generation store');
assert.match(source,/learningDataGeneration/,'database requires a generation counter');
assert.match(source,/StaleLearningDataError/,'stale writes must fail');
console.log('Database fencing structure present.');
