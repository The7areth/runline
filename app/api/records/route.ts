import { db, fail, originCheck, owner } from '@/lib/server';
import { parseRecord } from '@/lib/records/schema';
import { deleteRecord, listRecords, saveRecord } from '@/lib/records/repository';

export async function GET() {
  try {
    const uid = await owner();
    const records = await listRecords(db(), uid);
    return Response.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    originCheck(req);
    const uid = await owner();
    if (Number(req.headers.get('content-length')) > 30000) throw new Error('INPUT:Request too large.');
    const record = parseRecord(await req.json());
    return Response.json(await saveRecord(db(), uid, record));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    originCheck(req);
    const uid = await owner();
    const { id } = await req.json() as { id: unknown };
    await deleteRecord(db(), uid, String(id));
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
