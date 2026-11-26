import { db, fail, originCheck, owner } from '@/lib/server';
import { importIntervals } from '@/lib/intervals';

export async function POST(req: Request) {
  try {
    originCheck(req);
    const uid = await owner();
    return Response.json(await importIntervals(db, uid, await req.json()));
  } catch (error) {
    return fail(error);
  }
}
