import { z } from 'zod/v4';
import type { Evidence, EvidenceFinding, FindingId, Interpretation } from './evidence.ts';

const intents = ['summary', 'volume', 'comparablePace', 'splits', 'recovery', 'raceLimits', 'unsupported'] as const;
export type Intent = typeof intents[number];

export function questionIntent(question: string): Intent {
  if (/recover|resting|sleep|tomorrow|fatigue|sore|\brest\b/i.test(question)) return 'recovery';
  if (/race|marathon|predict|finish/i.test(question)) return 'raceLimits';
  if (/split|latter|first half|second half/i.test(question)) return 'splits';
  if (/pace|pacing|fast|slow/i.test(question)) return 'comparablePace';
  if (/compar|trend|week|volume|progress|distance/i.test(question)) return 'volume';
  return /analy|run|train|summar|evidence|insight/i.test(question) ? 'summary' : 'unsupported';
}

const plan = z.strictObject({
  intent: z.enum(intents),
  findings: z.array(z.strictObject({ findingId: z.string().min(1), interpretation: z.string().min(1) })).min(1).max(4),
  takeaway: z.string().min(1).max(240),
});
export const planJsonSchema = z.toJSONSchema(plan);
export const promptVersion = 'runline-plan-1';
export const schemaVersion = 1;

const eligible: Record<Exclude<Intent, 'summary'>, FindingId[]> = {
  comparablePace: ['comparablePace', 'insufficientComparables'],
  volume: ['volume'], splits: ['splitPace', 'unusualSplits', 'incompleteSplits'],
  recovery: ['recovery', 'restingHeartRate', 'missingRecovery'], raceLimits: [], unsupported: [],
};
const sentences: Record<FindingId, Partial<Record<Interpretation, string>>> = {
  volume: { higher: 'Recorded weekly distance increased.', lower: 'Recorded weekly distance decreased.',
    equal: 'Recorded weekly distance was unchanged.', recorded: 'Only the available running volume can be described.' },
  comparablePace: { faster: 'The selected run was faster than its comparable baseline.',
    slower: 'The selected run was slower than its comparable baseline.', equal: 'The selected run matched its comparable pace baseline.' },
  insufficientComparables: { missing: 'The available history does not establish a pace comparison.' },
  splitPace: { faster: 'The latter visible splits were faster.', slower: 'The latter visible splits were slower.',
    equal: 'Both groups of visible splits had the same pace.' },
  unusualSplits: { review: 'Some visible splits merit a closer look.' },
  incompleteSplits: { missing: 'The splits cover only part of the activity.' },
  missingHeartRate: { missing: 'Average heart rate is missing.' },
  recovery: { recorded: 'A recent recovery check-in adds context.', highSelfReport: 'The latest check-in flags fatigue or soreness.' },
  restingHeartRate: { higher: 'Resting heart rate was above its recorded baseline.',
    lower: 'Resting heart rate was below its recorded baseline.', equal: 'Resting heart rate matched its recorded baseline.' },
  missingRecovery: { missing: 'The available check-ins do not establish current recovery context.' },
};

export function choicesFor(intent: Intent, evidence: Evidence) {
  return evidence.findings.filter(f => intent === 'summary' || eligible[intent].includes(f.id)).flatMap(f =>
    f.allowedInterpretations.flatMap(interpretation => {
      const sentence = sentences[f.id][interpretation];
      return sentence ? [{ findingId: f.id, interpretation, sentence }] : [];
    }));
}
export type Choices = ReturnType<typeof choicesFor>;

export function validatePlan(candidate: unknown, intent: Intent, evidence: Evidence) {
  const parsed = plan.safeParse(candidate);
  if (!parsed.success) return { reason: 'schema' } as const;
  const data = parsed.data;
  if (data.intent !== intent) return { reason: 'intent' } as const;
  const choices = choicesFor(intent, evidence);
  const ordered: EvidenceFinding[] = [];
  const allowed: string[] = [];
  for (const pick of data.findings) {
    const finding = evidence.findings.find(f => f.id === pick.findingId);
    const choice = choices.find(c => c.findingId === pick.findingId && c.interpretation === pick.interpretation);
    if (!finding || !choice || ordered.includes(finding)) return { reason: 'selection' } as const;
    ordered.push(finding);
    allowed.push(choice.sentence);
  }
  const takeaway = data.takeaway.trim().replace(/\s+/gu, ' ');
  if (takeaway !== allowed[0] && !(allowed.length >= 2 && takeaway === allowed.slice(0, 2).join(' '))) {
    return { reason: 'takeaway' } as const;
  }
  return { ordered, takeaway } as const;
}
