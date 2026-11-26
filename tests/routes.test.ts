import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { register } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { env, session } from './support/route-env.ts';

register('./support/route-loader.mjs', import.meta.url);
const records = await import('../app/api/records/route.ts');
const uploads = await import('../app/api/uploads/route.ts');
const intervals = await import('../app/api/intervals/route.ts');

const alice = 'alice';
const bob = 'bob';
const run = { name: 'Evening', date: '2026-10-05', distance: 4, seconds: 1200, source: 'manual' };
const query = { key: 'test-only-key', oldest: '2026-10-01', newest: '2026-10-31' };
let directory: string;
let dispose: (() => Promise<void>) | undefined;
let database: D1Database;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'runline-routes-'));
  const configPath = join(directory, 'wrangler.json');
  await writeFile(configPath, JSON.stringify({
    name: 'runline-contracts', compatibility_date: '2026-05-15',
    d1_databases: [{ binding: 'DB', database_name: 'records', database_id: '00000000-0000-4000-8000-000000000001' }],
    r2_buckets: [{ binding: 'BUCKET', bucket_name: 'attachments' }],
  }));
  const proxy = await getPlatformProxy<{ DB: D1Database; BUCKET: R2Bucket }>({ configPath, persist: false });
  dispose = proxy.dispose;
  database = proxy.env.DB;
  Object.assign(env, proxy.env);
  const migration = await readFile(new URL('../drizzle/0000_familiar_jane_foster.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) {
    await database.prepare(statement.trim()).run();
  }
});
beforeEach(async () => {
  session.userId = alice;
  env.DB = database;
  await database.batch(['records', 'files'].map(table => database.prepare('DELETE FROM ' + table)));
});
after(async () => {
  await dispose?.();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://runline.test/', { method: 'POST', headers, body: JSON.stringify(body) });
}
type ListedRecord = { id: string; fatigue?: number; date?: string };
type RecordList = { records: ListedRecord[] };

async function json<T = unknown>(response: Response, status = 200) {
  assert.equal(response.status, status);
  return response.json() as Promise<T>;
}
function save(kind: string, body: unknown) {
  return records.POST(post({ kind, body }));
}
function fileRequest(bytes: Uint8Array<ArrayBuffer>, name = 'image.png') {
  const form = new FormData();
  form.set('file', new File([bytes], name));
  return new Request('https://runline.test/', { method: 'POST', body: form });
}
function readFileById(id: string) {
  return uploads.GET(new Request('https://runline.test/?id=' + id));
}

test('all write routes check origin before identity and all routes require identity', async () => {
  session.userId = null;
  for (const handler of [records.POST, records.DELETE, uploads.POST, intervals.POST]) {
    assert.deepEqual(await json(await handler(post({}, { origin: 'https://other.test' })), 400),
      { error: 'This request must come from Runline.' });
    assert.deepEqual(await json(await handler(post({})), 401), { error: 'Sign in to save or connect your data.' });
  }
  assert.equal((await records.GET()).status, 401);
  assert.equal((await readFileById('missing')).status, 401);
});

test('records preserve run IDs, dated check-ins, primary goals and owner isolation', async () => {
  const first = await json<{ id: string }>(await save('run', run));
  assert.match(first.id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.deepEqual(first, { id: first.id, ...run, kind: 'run' });
  const check = { date: run.date, sleep: null, fatigue: 1, soreness: 2, restingHR: null, notes: '' };
  const goal = { name: 'Race', date: run.date, distance: 5, targetSeconds: 1500 };
  for (const entry of [check, { ...check, fatigue: 4 }]) {
    assert.deepEqual(await json(await save('checkin', entry)), { id: 'alice:checkin:' + run.date, ...entry, kind: 'checkin' });
  }
  for (const entry of [goal, { ...goal, date: '2027-01-01' }]) {
    assert.deepEqual(await json(await save('goal', entry)), { id: 'alice:goal:primary', ...entry, kind: 'goal' });
  }
  session.userId = bob;
  assert.deepEqual(await json(await records.DELETE(post({ id: first.id }))), { ok: true });
  assert.deepEqual(await json(await records.GET()), { records: [] });
  session.userId = alice;
  const response = await records.GET();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const listed = (await json<RecordList>(response)).records;
  assert.equal(listed.length, 3);
  assert.ok(listed.some((r) => r.fatigue === 4));
  assert.ok(listed.some((r) => r.date === '2027-01-01'));
  assert.deepEqual(await json(await records.DELETE(post({ id: first.id }))), { ok: true });
  assert.equal((await json<RecordList>(await records.GET())).records.length, 2);
});

test('records return the newest 2000 rows in descending creation order', async () => {
  await database.prepare(`WITH RECURSIVE seq(n) AS (VALUES(0) UNION ALL SELECT n+1 FROM seq WHERE n<2000)
    INSERT INTO records SELECT printf('%04d',n),'alice','run','{}',printf('%04d',n) FROM seq`).run();
  const ids = (await json<RecordList>(await records.GET())).records.map((r: { id: string }) => r.id);
  assert.deepEqual(ids, Array.from({ length: 2000 }, (_, i) => String(2000 - i).padStart(4, '0')));
});

test('records preserve body limit, schema errors and storage failures', async () => {
  assert.deepEqual(await json(await records.POST(post({}, { 'content-length': '30001' })), 400), { error: 'Request too large.' });
  assert.deepEqual(await json(await save('other', run), 400), { error: 'Unknown record type.' });
  assert.deepEqual(await json(await save('run', { ...run, date: '2026-02-30' }), 400), { error: 'date: Invalid date' });
  env.DB = undefined;
  assert.deepEqual(await json(await records.GET(), 503), { error: 'Storage is temporarily unavailable. Your input has not been cleared.' });
});

test('PNG and JPEG uploads round-trip privately and only the owner can attach them', async () => {
  for (const [type, signature] of [['image/png', [137, 80, 78, 71]], ['image/jpeg', [255, 216, 255]]] as const) {
    session.userId = alice;
    const bytes = Uint8Array.from(signature);
    const { id, name } = await json<{ id: string; name: string }>(await uploads.POST(fileRequest(bytes, 'shot')));
    assert.equal(name, 'shot');
    const response = await readFileById(id);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    assert.deepEqual((await json<{ files: string[] }>(await save('run', { ...run, files: [id] }))).files, [id]);
    session.userId = bob;
    const hidden = await readFileById(id);
    assert.equal(hidden.status, 404);
    assert.equal(await hidden.text(), 'Not found');
    assert.deepEqual(await json(await save('run', { ...run, files: [id] }), 400), { error: 'Attachment not found.' });
  }
});

test('uploads reject unsupported bytes and oversized files or request headers', async () => {
  assert.deepEqual(await json(await uploads.POST(fileRequest(new Uint8Array(4))), 400), { error: 'Choose a JPG or PNG screenshot.' });
  assert.deepEqual(await json(await uploads.POST(fileRequest(new Uint8Array(8 * 1024 * 1024 + 1))), 400), { error: 'Choose an image under 8 MB.' });
  assert.deepEqual(await json(await uploads.POST(post({}, { 'content-length': '9000001' })), 400), { error: 'Upload must be under 8 MB.' });
});

test('Intervals preserves key, date and provider rejection responses', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  assert.deepEqual(await json(await intervals.POST(post({ ...query, key: 'short' })), 400), { error: 'Enter a valid personal API key.' });
  assert.deepEqual(await json(await intervals.POST(post({ ...query, newest: '2027-10-01' })), 400), { error: 'Choose a date range of up to 180 days.' });
  assert.equal(upstream.mock.callCount(), 0);
  assert.deepEqual(await json(await intervals.POST(post(query)), 400), { error: 'Intervals.icu rejected this key. Check your personal API key and permissions.' });
});

test('Intervals skips invalid activities and upserts stable owner IDs in batches of 50', async t => {
  const batchSizes: number[] = [];
  env.DB = { prepare: database.prepare.bind(database), batch: (statements: D1PreparedStatement[]) => {
    batchSizes.push(statements.length);
    return database.batch(statements);
  } } as D1Database;
  const activity = { name: 'Imported', type: 'TrailRun', distance: 4000, moving_time: 1200, start_date_local: run.date };
  const activities = Array.from({ length: 51 }, (_, i) => ({ ...activity, id: String(i) }));
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://intervals.icu/api/v1/athlete/0/activities?oldest=2026-10-01&newest=2026-10-31');
    assert.equal(new Headers(init.headers).get('authorization'), 'Basic ' + btoa('API_KEY:' + query.key));
    return Response.json([...activities, activity, { ...activity, type: 'Ride' }]);
  });
  for (const user of [alice, alice, bob]) {
    session.userId = user;
    assert.deepEqual(await json(await intervals.POST(post(query))), {
      imported: 51, skipped: 2, message: 'Available running summaries synced. Your API key was not stored.',
    });
    const saved = (await json<RecordList>(await records.GET())).records;
    assert.equal(saved.length, 51);
    const imported = saved.find((r: { id: string }) => r.id === user + ':icu:0');
    assert.deepEqual(imported, { id: user + ':icu:0', kind: 'run', name: 'Imported', date: run.date,
      distance: 4, seconds: 1200, hr: null, elevation: null, source: 'intervals', timeBasis: 'moving',
      notes: 'Summary synced from Intervals.icu. Only available running activities are imported; no raw streams or wellness data are synced in this version.' });
  }
  assert.deepEqual(batchSizes, [50, 1, 50, 1, 50, 1]);
});

test('missing upload metadata or object both yield a plain-text 404', async () => {
  const { id } = await json<{ id: string }>(await uploads.POST(fileRequest(new Uint8Array([255, 216, 255]))));
  await env.BUCKET!.delete(alice + '/' + id);
  for (const candidate of [id, 'unknown']) {
    const response = await readFileById(candidate);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
  }
});

test('Intervals distinguishes other upstream failures and unexpected payloads', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  assert.deepEqual(await json(await intervals.POST(post(query)), 400), { error: 'Intervals.icu could not return activities (429). Try again later.' });
  upstream.mock.mockImplementation(async () => Response.json({}));
  assert.deepEqual(await json(await intervals.POST(post(query)), 400), { error: 'Unexpected Intervals.icu response.' });
});
