import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesize } from '../lib/insights/synthesize.server.ts';
import type { InsightModel, ModelInput } from '../lib/insights/model.server.ts';
import { questionIntent } from '../lib/insights/plan.ts';
import { cases, asOf } from './fixtures/evidence-cases.ts';

const selected = { ...cases.boundaries.selected, name: 'private-name', notes: 'private-note', url: 'private-url', files: ['private-file'] };
const input = { ...cases.boundaries, selected, asOf, coverage: 'complete', question: 'Was I faster this week?', intent: 'comparablePace' } as const;
const question = input.question;
const ordered = { findingId: 'comparablePace', interpretation: 'faster' };
const valid = { intent: 'comparablePace', findings: [ordered], takeaway: 'The selected run was faster than its comparable baseline.' };
function fake(generatePlan: InsightModel['generatePlan']): InsightModel {
  return { provider: 'fake', model: 'fixture', generatePlan };
}
async function run(candidate: unknown) {
  return synthesize(input, fake(async () => ({ candidate })), () => {});
}

test('validated synthesis renders evidence and omitted caveats; model input and telemetry are minimized', async () => {
  let received: ModelInput | undefined;
  const events: object[] = [];
  const answer = await synthesize(input, fake(async payload => {
    received = payload;
    return { candidate: valid, inputTokens: 44, outputTokens: 15 };
  }), e => events.push(e));
  assert.equal(questionIntent(question), 'comparablePace');
  assert.equal(answer.mode, 'ai');
  assert.equal(answer.takeaway, valid.takeaway);
  assert.match(answer.evidence[0].detail, /\/km median/);
  assert.ok(answer.caveats.some(c => c.startsWith('The splits do not cover')));
  assert.deepEqual(received, { question, intent: 'comparablePace', choices: [{ ...ordered, sentence: valid.takeaway }] });
  assert.equal(events.length, 1);
  const event = events[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(event).sort(), ['event','requestId','engineVersion','promptVersion','schemaVersion','provider','model','mode',
    'fallbackReason','evidenceMs','modelMs','validationMs','totalMs','inputTokens','outputTokens','estimatedApiCostUsd'].sort());
  assert.equal(event.inputTokens, 44);
  assert.equal(event.outputTokens, 15);
  assert.ok(!JSON.stringify(events).includes(question));
});

for (const [name, candidate, reason] of [
  ['missing field', { findings: [ordered] }, 'schema'],
  ['extra key', { ...valid, secret: true }, 'schema'],
  ['extra nested key', { ...valid, findings: [{ ...ordered, extra: 1 }] }, 'schema'],
  ['unknown finding', { ...valid, findings: [{ ...ordered, findingId: 'invented' }] }, 'selection'],
  ['incompatible direction', { ...valid, findings: [{ ...ordered, interpretation: 'slower' }] }, 'selection'],
  ['duplicate selection', { ...valid, findings: [ordered, ordered] }, 'selection'],
  ['wrong intent', { ...valid, intent: 'volume' }, 'intent'],
  ['irrelevant weekly volume', { ...valid, findings: [{ findingId: 'volume', interpretation: 'equal' }] }, 'selection'],
  ...['You ran five minutes faster.', 'Your pace improved by 2%.', 'You improved on Monday.', 'You are ready to race.']
    .map(text => [text, { ...valid, takeaway: valid.takeaway + ' ' + text }, 'takeaway']),
] as const) {
  test('whole-plan fallback: ' + name, async () => {
    const result = await run(candidate);
    assert.equal(result.mode, 'deterministic');
    assert.equal(result.fallbackReason, reason);
    assert.ok(!result.takeaway.includes(valid.takeaway));
    assert.ok(result.evidence.length);
  });
}

test('exact tie forbids a faster claim even with a valid equal interpretation', async () => {
  const runs = [selected, ...['2026-10-15','2026-10-14'].map(date => ({ ...selected, id: date, date }))];
  const result = await synthesize({ ...input, runs }, fake(async () => ({
    candidate: { ...valid, findings: [{ ...ordered, interpretation: 'equal' }] },
  })), () => {});
  assert.equal(result.fallbackReason, 'takeaway');
  assert.match(result.evidence[0].detail, /same pace/);
});

test('two supported sentences follow the declared selection order', async () => {
  const result = await synthesize({ ...input, question: 'Summarize my run', intent: 'summary' }, fake(async ({ choices }) => {
    const picks = choices.slice(0, 2);
    return { candidate: { intent: 'summary', findings: picks.map(({ findingId, interpretation }) => ({ findingId, interpretation })),
      takeaway: picks.map(c => c.sentence).join(' ') } };
  }), () => {});
  assert.equal(result.mode, 'ai');
  assert.equal(result.evidence.length, 2);
});

test('one five-second signal covers model work; timeout telemetry contains only a reason code', async t => {
  const signals: AbortSignal[] = [];
  const timeout = t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    assert.equal(ms, 5000);
    const controller = new AbortController();
    queueMicrotask(() => controller.abort());
    return controller.signal;
  });
  const events: object[] = [];
  const result = await synthesize(input, fake(async (_input, { signal }) => {
    signals.push(signal);
    await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('private body')), { once: true }));
    throw new Error('unreachable');
  }), e => events.push(e));
  assert.equal(result.fallbackReason, 'timeout');
  assert.equal(timeout.mock.callCount(), 1);
  assert.equal(signals.length, 1);
  assert.ok(!JSON.stringify(events).includes('private body'));
});
