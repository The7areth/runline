import type { Run } from "../running.ts";
import type { Checkin } from "../insights/evidence.ts";
import type { parseRecord } from './schema.ts';

export async function listRecords(db: D1Database, owner: string) {
  const rows = await db.prepare(
    'SELECT id,kind,body FROM records WHERE owner=? ORDER BY created DESC LIMIT 2000',
  ).bind(owner).all<{ id: string; kind: string; body: string }>();
  return rows.results.map(row => ({ id: row.id, kind: row.kind, ...JSON.parse(row.body) }));
}

export function prepareRecordWrite(db: D1Database, owner: string, id: string, kind: string, body: object) {
  return db.prepare(`
    INSERT INTO records (id,owner,kind,body,created) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET body=excluded.body,created=excluded.created
    WHERE records.owner=excluded.owner
  `).bind(id, owner, kind, JSON.stringify(body), new Date().toISOString());
}

export async function saveRecord(db: D1Database, owner: string, { kind, body }: ReturnType<typeof parseRecord>) {
  if ('files' in body && body.files) {
    for (const file of body.files) {
      const attachment = await db.prepare('SELECT id FROM files WHERE id=? AND owner=?').bind(file, owner).first();
      if (!attachment) throw new Error('INPUT:Attachment not found.');
    }
  }

  const id = kind === 'run' ? crypto.randomUUID() : [owner, kind, kind === 'goal' ? 'primary' : body.date].join(':');
  await prepareRecordWrite(db, owner, id, kind, body).run();
  return { id, ...body, kind };
}

export async function deleteRecord(db: D1Database, owner: string, id: string) {
  await db.prepare('DELETE FROM records WHERE id=? AND owner=?').bind(id, owner).run();
}

type StoredBody = { id: string; body: string };
function decode<T>(row: StoredBody): T {
  return { ...JSON.parse(row.body), id: row.id };
}

export async function selectedRun(db: D1Database, owner: string, id: string) {
  const row = await db.prepare("SELECT id,body FROM records WHERE owner=? AND kind='run' AND id=?")
    .bind(owner, id).first<StoredBody>();
  return row ? decode<Run>(row) : null;
}

export async function insightHistory(db: D1Database, owner: string, selected: Run, asOf: string) {
  const day = "json_extract(body,'$.date')";
  const columns = "id,json_remove(body,'$.notes','$.files','$.url','$.name') AS body";
  const recent = db.prepare(`SELECT ${columns} FROM records WHERE owner=? AND kind='run'
    AND ${day} BETWEEN date(?,'-27 days') AND ? ORDER BY ${day} DESC,id LIMIT 2001`).bind(owner, asOf, asOf);
  // The engine uses the most recent 20 eligible earlier runs, even outside the volume window.
  const similar = db.prepare(`SELECT ${columns} FROM records WHERE owner=? AND kind='run'
    AND ${day} < ? AND ${day} <= ?
    AND abs(json_extract(body,'$.distance')-?)/? <= 0.1
    AND coalesce(json_extract(body,'$.timeBasis'),'moving')=?
    ORDER BY ${day} DESC,id LIMIT 20`).bind(owner, selected.date, asOf, selected.distance,
      selected.distance, selected.timeBasis || 'moving');
  const checks = db.prepare(`SELECT ${columns} FROM records WHERE owner=? AND kind='checkin'
    AND ${day} <= ? ORDER BY ${day} DESC,id LIMIT 17`).bind(owner, asOf);
  const [period, matches, recovery] = await db.batch<StoredBody>([recent, similar, checks]);
  const runs = new Map<string, Run>();
  for (const row of [...period.results.slice(0, 2000), ...matches.results]) runs.set(row.id, decode<Run>(row));
  return { runs: [...runs.values()], checks: recovery.results.map(decode<Checkin>),
    coverage: period.results.length > 2000 ? 'truncated' as const : 'complete' as const };
}
