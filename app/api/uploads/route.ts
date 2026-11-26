import { bucket, db, fail, originCheck, owner } from '@/lib/server';
import { readImage, saveImage } from '@/lib/uploads';

const storage = { db, bucket };

export async function POST(req: Request) {
  try {
    originCheck(req);
    const uid = await owner();
    if (Number(req.headers.get('content-length')) > 9000000) throw new Error('INPUT:Upload must be under 8 MB.');
    const form = await req.formData();
    return Response.json(await saveImage(storage, uid, form.get('file')));
  } catch (error) {
    return fail(error);
  }
}

export async function GET(req: Request) {
  try {
    const uid = await owner();
    const image = await readImage(storage, uid, new URL(req.url).searchParams.get('id'));
    if (!image) return new Response('Not found', { status: 404 });
    return new Response(image.body, {
      headers: {
        'Content-Type': image.type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
