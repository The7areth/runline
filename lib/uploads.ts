type Storage = { db: () => D1Database; bucket: () => R2Bucket };

export async function saveImage(storage: Storage, owner: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size > 8 * 1024 * 1024) {
    throw new Error('INPUT:Choose an image under 8 MB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (!jpeg && !png) throw new Error('INPUT:Choose a JPG or PNG screenshot.');

  const type = jpeg ? 'image/jpeg' : 'image/png';
  const id = crypto.randomUUID();
  await storage.bucket().put(owner + '/' + id, bytes, { httpMetadata: { contentType: type } });
  await storage.db().prepare('INSERT INTO files (id,owner,name,type,size) VALUES (?,?,?,?,?)')
    .bind(id, owner, file.name.slice(0, 200), type, file.size).run();
  return { id, name: file.name };
}

export async function readImage(storage: Storage, owner: string, id: string | null) {
  const row = await storage.db().prepare('SELECT type FROM files WHERE id=? AND owner=?')
    .bind(id, owner).first<{ type: string }>();
  if (!row) return null;
  const file = await storage.bucket().get(owner + '/' + id);
  return file ? { body: file.body, type: row.type } : null;
}
