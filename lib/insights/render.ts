import { pace } from '../running.ts';
import type { CaveatId, EvidenceFinding } from './evidence.ts';

export type Finding = { title: string; detail: string; kind: EvidenceFinding['kind']; evidence: string[] };
const caveats: Record<CaveatId, string> = {
  missingImports: 'Missing imports can change this comparison.',
  noPriorVolume: 'The prior seven days have no records, so no percentage comparison is justified.',
  unmatchedConditions: 'Routes, effort and conditions are not matched; this alone is not a fitness change.',
  needComparables: 'At least two earlier runs within 10% of this distance and with the same time basis are needed for a pace comparison.',
  omittedMiddle: 'The middle kilometre is excluded for equal-length comparison.',
  partialSplits: 'The splits do not cover the complete activity.',
  heuristic: 'Check pauses, intervals, GPS or OCR before drawing conclusions. These are heuristic review flags.',
  noStream: 'Even with an average, zones and cardiac drift require additional measurements and a time series.',
  selfReport: 'These self-reports add context; they do not establish readiness or rule out injury.',
  reviewSelfReport: 'You reported high fatigue or soreness. Review how you feel before deciding on a demanding session.',
  noDiagnosis: 'A difference is an observation, not a diagnosis or automatic training decision.',
  staleOrAbsent: 'Record a recent check-in for sleep, fatigue and soreness. No readiness score is inferred from a run or an old check-in.',
  truncatedHistory: 'The available history is incomplete.',
};

export function renderFinding(f: EvidenceFinding): Finding {
  const note = f.requiredCaveats.map(id => caveats[id]).join(' ');
  const result = (title: string, detail: string, evidence: string[]) => ({ title, detail, kind: f.kind, evidence });
  switch (f.id) {
    case 'volume': {
      const m = f.metrics;
      const comparison = m.change ? `The prior seven days contain ${m.previous.value.toFixed(1)} km: a ${Math.abs(m.change.value).toFixed(0)}% ${f.direction === 'lower' ? 'decrease' : 'increase'} in recorded distance. ` : '';
      return result('Recent running volume', `${m.current.value.toFixed(1)} km across ${m.currentCount.value} runs in the seven days ending ${f.window.end}. ${comparison}${note}`,
        [`Current: ${m.currentCount.value} records`, `Previous: ${m.previousCount.value} records`]);
    }
    case 'comparablePace': {
      const m = f.metrics;
      const change = f.direction === 'equal' ? 'That is the same pace.' : `That is ${Math.abs(m.delta.value).toFixed(0)} sec/km ${f.direction}.`;
      return result('Compared with similar distances', `This run averages ${pace(m.current.value)}/km versus a ${pace(m.median.value)}/km median across ${m.candidates.length} earlier runs within 10% of its distance. ${change} ${note}`,
        m.candidates.map(c => `${c.date}: ${c.distance.value.toFixed(2)} km`));
    }
    case 'insufficientComparables':
      return result('Build a comparison baseline', note, [`${f.metrics.count.value} comparable records available`]);
    case 'splitPace': {
      const m = f.metrics;
      const change = f.direction === 'equal' ? 'The same pace in the latter section.' : `${Math.abs(m.change.value).toFixed(1)}% ${f.direction} pace in the latter section.`;
      // The legacy detail includes a final space when all splits are present.
      const middle = f.requiredCaveats.includes('omittedMiddle') ? ' ' + caveats.omittedMiddle : '';
      return result(m.complete ? 'Pacing across the run' : 'Pacing across visible splits',
        `First ${m.halfCount.value} full kilometres: ${pace(m.first.value)}/km; last ${m.halfCount.value}: ${pace(m.last.value)}/km. ${change}${middle} ${m.complete ? '' : caveats.partialSplits}`,
        [`${m.count.value} full-kilometre splits`]);
    }
    case 'unusualSplits': {
      const { flagged } = f.metrics;
      return result('Check unusual splits', `Kilometre${flagged.length > 1 ? 's' : ''} ${flagged.map(s => s.kilometre.value).join(', ')} differ substantially from the median split. ${note}`,
        flagged.map(s => `${s.kilometre.value}: ${pace(s.pace.value)}/km`));
    }
    case 'incompleteSplits':
      return result('Incomplete pacing evidence', 'Add the missing full-kilometre splits or an activity file to evaluate the entire run. Average pace does not replace the missing splits.',
        [`${f.metrics.count.value} splits for ${f.metrics.distance.value.toFixed(2)} km`]);
    case 'missingHeartRate':
      return result('Heart-rate evidence missing', 'No average heart rate is saved. ' + note, ['Heart-rate stream unavailable']);
    case 'recovery': {
      const m = f.metrics;
      return result('Recovery context', `Latest check-in (${m.date}): ${m.sleep ? m.sleep.value + ' hours sleep' : 'sleep unrecorded'}, fatigue ${m.fatigue.value}/5 and soreness ${m.soreness.value}/5. ${note}`, [m.date]);
    }
    case 'restingHeartRate': {
      const m = f.metrics;
      return result('Resting heart-rate baseline', `${m.current.value} bpm today versus a ${m.median.value.toFixed(0)} bpm median from ${m.count.value} earlier check-ins over 14 days. ${note}`,
        [`Difference: ${m.delta.value >= 0 ? '+' : ''}${m.delta.value.toFixed(0)} bpm`]);
    }
    case 'missingRecovery':
      return result('Recovery context is missing or stale', note, [f.metrics.latest ? 'Last check-in: ' + f.metrics.latest : 'No check-in before this analysis date']);
  }
}
