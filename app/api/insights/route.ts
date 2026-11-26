import { z } from 'zod/v4';
import { db, fail, originCheck, owner } from '@/lib/server';
import { insightHistory, selectedRun } from '@/lib/records/repository';
import { insightModel } from '@/lib/insights/model.server';
import { questionIntent } from '@/lib/insights/plan';
import { synthesize } from '@/lib/insights/synthesize.server';

const requestSchema = z.strictObject({ question: z.string().trim().min(1).max(500), selectedRunId: z.string().min(1).max(512) });
const headers = { 'Cache-Control': 'private, no-store' };

async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INPUT:Missing request body.');
  const bytes = new Uint8Array(8192);
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.length > bytes.length) {
        await reader.cancel();
        throw new Error('INPUT:Request too large.');
      }
      bytes.set(chunk.value, size);
      size += chunk.value.length;
    }
  } finally { reader.releaseLock(); }
  try {
    return requestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))));
  } catch { throw new Error('INPUT:Supply a selected run ID and a question of up to 500 characters.'); }
}

export async function POST(request: Request) {
  const started = performance.now();
  try {
    originCheck(request);
    const uid = await owner();
    const { question, selectedRunId } = await readInput(request);
    const database = db();
    const selected = await selectedRun(database, uid, selectedRunId);
    if (!selected) return Response.json({ error: 'Run not found.' }, { status: 404, headers });
    const intent = questionIntent(question);
    const asOf = intent === 'recovery' ? new Date().toISOString().slice(0, 10) : selected.date;
    const history = await insightHistory(database, uid, selected, asOf);
    const result = await synthesize({ ...history, selected, asOf, question, intent }, insightModel(), undefined, started);
    return Response.json(result, { headers });
  } catch (error) {
    const response = fail(error);
    response.headers.set('Cache-Control', headers['Cache-Control']);
    return response;
  }
}
