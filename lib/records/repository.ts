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
