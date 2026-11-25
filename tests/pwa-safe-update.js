import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../js/version.js';
import { compareLearningCounts, mergeQuestionRecord, questionSignature, DB_VERSION } from '../js/db.js';

const before = { answers: 100, checkins: 10, wrongQuestions: 20, dailyTasks: 10, questionHistory: 80 };
assert.deepEqual(compareLearningCounts(before, { ...before }), []);
assert.deepEqual(compareLearningCounts(before, { ...before, answers: 0 }), ['answers']);
const old = { id: 'Q0001', question: '1+1', answer: '2', answerType: 'number', displayQuestion: '1 + 1' };
const same = { ...old, displayQuestion: '1＋1' };
const changed = { ...old, question: '2+2', answer: '4' };
const fixed = { ...old, id: 'Q0125', question: '3x-2y-[4x-3(x-y)]', answer: '2x-5y' };
assert.equal(questionSignature(old), questionSignature(same));
assert.equal(mergeQuestionRecord(old, same).changed, true);
const warnings = [];
const protectedRecord = mergeQuestionRecord(old, changed, message => warnings.push(message));
assert.equal(protectedRecord.changed, false);
assert.equal(protectedRecord.record.question, '1+1');
assert.equal(mergeQuestionRecord({ ...old, id: 'Q0125' }, fixed).record.answer, '2x-5y', '仅已确认题目允许强制同步');
assert.equal(warnings.length, 1);
assert.equal(DB_VERSION, 3);

const source = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const scope = 'https://example.invalid/math/';
const configured = globalThis.MATH_PWA_VERSION;
const current = configured.cacheVersion;
const version = Number(current.split('-v').at(-1));
const skipped = 'grade7-math-v' + (version - 1);
const previous = 'grade7-math-v' + (version - 2);
const retired = 'grade7-math-v' + (version - 3);
const app = new URL('./js/app.js', scope).href;
const home = new URL('./index.html', scope).href;
const entries = new Map([
  ['foreign-cache', new Map()],
  [retired, new Map([[home, { release: retired }]])],
  [previous, new Map([
    [home, { release: previous }],
    [app, { release: previous }],
    [new URL('./.pwa-client/old-document', scope).href, new Response('')]
  ])],
  [skipped, new Map()]
]);
const ready = { id: 'ready', url: scope, type: 'window' };
const practice = { id: 'practice', url: scope, type: 'window' };
const unrelated = { id: 'unrelated', url: 'https://example.invalid/other/', type: 'window' };
const handlers = new Map();
let windows = [];
let claims = 0;
let takeovers = 0;
let installError;
const worker = {
  registration: { scope },
  skipWaiting: async () => { takeovers++; },
  clients: {
    claim: async () => { claims++; },
    matchAll: async options => {
      assert.equal(options.includeUncontrolled, true);
      return windows;
    }
  },
  addEventListener: (event, handler) => handlers.set(event, handler)
};
vm.runInNewContext(source, {
  self: worker,
  location: new URL(scope),
  URL,
  Request,
  Response,
  importScripts: () => { worker.MATH_PWA_VERSION = configured; },
  fetch: async () => assert.fail('Known release assets cannot fall through to the live server'),
  caches: {
    open: async name => {
      if (!entries.has(name)) entries.set(name, new Map());
      const cache = entries.get(name);
      return {
        addAll: async requests => {
          if (installError) throw installError;
          requests.forEach(request => {
            assert.equal(request.cache, 'reload');
            cache.set(request.url, { release: name });
          });
        },
        match: async request => cache.get(request),
        put: async (request, response) => cache.set(request, response),
        delete: async request => cache.delete(request)
      };
    },
    keys: async () => [...entries.keys()],
    delete: async name => entries.delete(name)
  }
});
async function dispatch(type, details = {}) {
  const jobs = [];
  const replies = [];
  handlers.get(type)({
    waitUntil: job => jobs.push(job),
    respondWith: job => jobs.push(job),
    ports: [{ postMessage: value => replies.push(value) }],
    ...details
  });
  return { results: await Promise.all(jobs), replies };
}

installError = Error('missing shell asset');
await assert.rejects(dispatch('install'), /missing shell asset/);
assert.equal(entries.get(previous).get(app).release, previous);
assert.equal(takeovers, 0);

installError = undefined;
await dispatch('install');
assert.equal(takeovers, 0, 'Install must leave an existing page on its old controller');
for (const asset of [
  'data/questions.json', 'js/db.js', 'js/questionBankFix.js', 'js/app.js', 'js/version.js',
  'js/knowledgePoints.js', 'js/formatMath.js', 'js/questionEngine.js', 'js/scoring.js',
  'js/factorizedForm.js', 'js/scoringPolicy.js', 'js/attemptPolicy.js'
]) assert.ok(entries.get(current).has(new URL(asset, scope).href), 'Missing cached asset ' + asset);

await dispatch('message', { data: { type: 'SKIP_WAITING' }, source: ready });
assert.equal(takeovers, 0, 'A v34 client must not force a disruptive takeover');
const metadata = await dispatch('message', { data: { type: 'GET_RELEASE' }, source: ready });
assert.equal(metadata.replies[0].appVersion, configured.appVersion);
const apply = { data: { type: 'APPLY_SAFE_UPDATE' }, source: ready };
windows = [ready, practice, unrelated];
const rejected = await dispatch('message', apply);
assert.equal(rejected.replies[0].status, 'blocked');
assert.equal(takeovers, 0, 'A second tab can still contain unsubmitted input');
windows = [ready, unrelated];
const accepted = await dispatch('message', apply);
assert.equal(accepted.replies[0].status, 'activating');
assert.equal(takeovers, 1);

await dispatch('activate');
assert.equal(claims, 0, 'First install and natural migration cannot take over open pages');
assert.deepEqual([...entries.keys()].sort(), [current, previous, 'foreign-cache'].sort());
const navigation = await dispatch('fetch', {
  request: { method: 'GET', mode: 'navigate', url: home },
  resultingClientId: 'new-document'
});
assert.equal(navigation.results[0].release, current);
const oldDocument = await dispatch('fetch', { request: new Request(app), clientId: 'old-document' });
assert.equal(oldDocument.results[0].release, previous, 'Pages crossing handoff keep the release of their HTML');
const newDocument = await dispatch('fetch', { request: new Request(app), clientId: 'new-document' });
assert.equal(newDocument.results[0].release, current);
const missing = await dispatch('fetch', {
  request: new Request(new URL('./js/not-cached.js', scope)),
  clientId: 'new-document'
});
assert.equal(missing.results[0].status, 503, 'A missing module cannot silently mix in live release files');

console.log('PWA safe-update policy and lifecycle tests passed.');
