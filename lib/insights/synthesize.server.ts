import { buildEvidence } from '../intelligence.ts';
import type { Run } from '../running.ts';
import type { Checkin, Evidence } from './evidence.ts';
import { caveats, renderFinding, type Finding } from './render.ts';
import { choicesFor, promptVersion, schemaVersion, validatePlan, type Intent } from './plan.ts';
import type { InsightModel } from './model.server.ts';

type Reason = 'unsupported' | 'raceLimits' | 'noEvidence' | 'provider' | 'timeout' | 'schema' | 'selection' | 'takeaway' | 'intent';
export type InsightAnswer = { mode: 'ai' | 'deterministic'; takeaway: string; evidence: Finding[]; caveats: string[]; fallbackReason?: Reason };

export async function synthesize(input: { question: string; intent: Intent; selected: Run; runs: Run[];
  checks: Checkin[]; asOf: string; coverage: Evidence['inputCoverage'] }, model: InsightModel,
  log: (entry: object) => void = entry => console.info(JSON.stringify(entry)), started = performance.now()): Promise<InsightAnswer> {
  const begin = performance.now();
  const evidence = buildEvidence(input.runs, input.selected, input.checks, input.asOf, input.coverage);
  const choices = choicesFor(input.intent, evidence);
  const evidenceMs = performance.now() - begin;
  const eligible = evidence.findings.filter(f => choices.some(c => c.findingId === f.id));
  const limitations = [...new Set(evidence.findings.flatMap(f => f.requiredCaveats))].map(id => caveats[id]);
  let modelMs = 0;
  let validationMs = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  function finish(answer: InsightAnswer) {
    log({ event: 'runline.insights', requestId: crypto.randomUUID(), engineVersion: evidence.version,
      promptVersion, schemaVersion, provider: model.provider, model: model.model, mode: answer.mode,
      fallbackReason: answer.fallbackReason ?? null, evidenceMs, modelMs, validationMs,
      totalMs: performance.now() - started, inputTokens, outputTokens,
      estimatedApiCostUsd: model.provider === 'ollama' ? 0 : null });
    return answer;
  }
  function fallback(reason: Reason, takeaway = 'Calculated from the available training records.') {
    return finish({ mode: 'deterministic', takeaway, evidence: eligible.map(renderFinding),
      caveats: limitations, fallbackReason: reason });
  }
  if (input.intent === 'unsupported') return fallback('unsupported', 'Ask about recorded training, pace, splits, volume or recovery.');
  if (input.intent === 'raceLimits') {
    const c = evidence.coverage;
    return fallback('raceLimits', `Available records in the 28 days ending ${evidence.asOf}: ${c.runs28} runs, ${c.km28.toFixed(1)} km, longest ${c.longest28.toFixed(1)} km. These records cannot establish race readiness.`);
  }
  if (!choices.length) return fallback('noEvidence', 'There is insufficient evidence for this question.');
  const signal = AbortSignal.timeout(5000);
  const modelStart = performance.now();
  let reply: Awaited<ReturnType<InsightModel['generatePlan']>>;
  try {
    reply = await model.generatePlan({ question: input.question, intent: input.intent, choices }, { signal });
    if (signal.aborted) throw new Error('timeout');
  } catch {
    modelMs = performance.now() - modelStart;
    return fallback(signal.aborted ? 'timeout' : 'provider');
  }
  modelMs = performance.now() - modelStart;
  inputTokens = reply.inputTokens ?? null;
  outputTokens = reply.outputTokens ?? null;
  const validationStart = performance.now();
  const result = validatePlan(reply.candidate, input.intent, evidence);
  validationMs = performance.now() - validationStart;
  if (result.reason) return fallback(result.reason);
  return finish({ mode: 'ai', takeaway: result.takeaway, evidence: result.ordered.map(renderFinding), caveats: limitations });
}
