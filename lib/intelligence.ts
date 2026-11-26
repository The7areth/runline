import { analyze, type Run, secondsPerKm, paceDirection, compareSplitGroups } from './running.ts';
import { renderFinding } from './insights/render.ts';
import type { Checkin, Evidence, EvidenceFinding, Measure, SourceRef, Unit, Window, FindingId } from './insights/evidence.ts';
export type { Checkin, Evidence, EvidenceFinding } from './insights/evidence.ts';
export type { Finding } from './insights/render.ts';

const DAY = 86400000;
const timestamp = (date: string) => Date.parse(date + 'T12:00:00Z');
const offset = (date: string, days: number) => new Date(timestamp(date) + days * DAY).toISOString().slice(0, 10);
const window = (start: string | null, end: string): Window => ({ start, end });
const measure = <U extends Unit>(value: number, unit: U): Measure<U> => ({ value, unit });
const count = (value: number) => measure(value, 'count');
const km = (value: number) => measure(value, 'km');
const perKm = (value: number) => measure(value, 's/km');
const bpm = (value: number) => measure(value, 'bpm');
const pct = (value: number) => measure(value, '%');
const sumKm = (runs: Run[]) => runs.reduce((total, run) => total + run.distance, 0);
const source = (kind: SourceRef['kind'], record: Run | Checkin): SourceRef =>
  ({ kind, id: record.id ?? null, date: record.date });
const runRef = (r: Run) => source('run', r);
const checkRef = (c: Checkin) => source('checkin', c);

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function activityFindings(selected: Run, history: Run[], truncated: boolean): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [];
  const activity = { window: window(selected.date, selected.date), sources: [runRef(selected)], comparator: null };
  const candidates = history.filter(run =>
    run.id !== selected.id && run.date < selected.date && selected.distance > 0 &&
    Math.abs(run.distance - selected.distance) / selected.distance <= 0.1 &&
    (run.timeBasis || 'moving') === (selected.timeBasis || 'moving'),
  ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const comparison = { ...activity, sources: [...activity.sources, ...candidates.map(runRef)],
    comparator: { basis: 'similarRuns' as const, window: window(null, offset(selected.date, -1)) } };
  if (candidates.length >= 2 && !truncated) {
    const prior = median(candidates.map(secondsPerKm));
    const current = secondsPerKm(selected);
    const direction = paceDirection(current, prior);
    findings.push({ ...comparison, id: 'comparablePace', kind: 'context', direction,
      metrics: { current: perKm(current), median: perKm(prior), delta: perKm(current - prior),
        candidates: candidates.map(r => ({ date: r.date, distance: km(r.distance) })) },
      allowedInterpretations: [direction], requiredCaveats: ['unmatchedConditions'] });
  } else {
    findings.push({ ...comparison, id: 'insufficientComparables', kind: 'missing', direction: 'unavailable',
      metrics: { count: count(candidates.length) }, allowedInterpretations: ['missing'],
      requiredCaveats: truncated ? ['truncatedHistory'] : ['needComparables'] });
  }

  const splits = selected.splits || [];
  const complete = splits.length >= Math.floor(selected.distance) && Math.abs(selected.distance - splits.length) < 1;
  if (splits.length >= 6) {
    const { length: n, first, last, percent, direction } = compareSplitGroups(splits, 2);
    findings.push({ ...activity, id: 'splitPace', kind: 'observation', direction,
      comparator: { basis: 'firstHalf', window: activity.window },
      metrics: { count: count(splits.length), halfCount: count(n), first: perKm(first), last: perKm(last),
        change: pct(percent), complete },
      allowedInterpretations: [direction], requiredCaveats: [
        ...(splits.length % 2 ? ['omittedMiddle' as const] : []), ...(complete ? [] : ['partialSplits' as const])] });
    const middle = median(splits);
    const flagged = splits.flatMap((s, i) => s < middle * 0.7 || s > middle * 1.4
      ? [{ kilometre: km(i + 1), pace: perKm(s) }] : []);
    if (flagged.length) findings.push({ ...activity, id: 'unusualSplits', kind: 'context', direction: 'unavailable',
      comparator: { basis: 'splitMedian', window: activity.window }, metrics: { flagged },
      allowedInterpretations: ['review'], requiredCaveats: ['heuristic'] });
  }
  if (!complete) findings.push({ ...activity, id: 'incompleteSplits', kind: 'missing', direction: 'unavailable',
    metrics: { count: count(splits.length), distance: km(selected.distance) },
    allowedInterpretations: ['missing'], requiredCaveats: ['partialSplits'] });
  if (!selected.hr) findings.push({ ...activity, id: 'missingHeartRate', kind: 'missing', direction: 'unavailable',
    metrics: { average: null }, allowedInterpretations: ['missing'], requiredCaveats: ['noStream'] });
  return findings;
}

function recoveryFindings(checkins: Checkin[], asOf: string, truncated: boolean): EvidenceFinding[] {
  const history = checkins.filter(c => c.date <= asOf).sort((a, b) => b.date.localeCompare(a.date));
  const latest = history[0];
  const recent = window(offset(asOf, -2), asOf);
  if (!latest || latest.date < recent.start! || truncated) {
    return [{ id: 'missingRecovery', kind: 'missing', direction: 'unavailable', comparator: null,
      window: recent, sources: latest ? [checkRef(latest)] : [], metrics: { latest: latest?.date ?? null },
      allowedInterpretations: ['missing'], requiredCaveats: [truncated ? 'truncatedHistory' : 'staleOrAbsent'] }];
  }
  const high = latest.fatigue >= 4 || latest.soreness >= 4;
  const findings: EvidenceFinding[] = [{ id: 'recovery', kind: 'context', direction: 'unavailable',
    comparator: null, window: recent, sources: [checkRef(latest)], metrics: { date: latest.date,
      sleep: latest.sleep == null ? null : measure(latest.sleep, 'hours'),
      fatigue: measure(latest.fatigue, 'score/5'), soreness: measure(latest.soreness, 'score/5') },
    allowedInterpretations: [high ? 'highSelfReport' : 'recorded'], requiredCaveats: [high ? 'reviewSelfReport' : 'selfReport'] }];
  const start = offset(latest.date, -14);
  const prior = history.filter((c): c is Checkin & { restingHR: number } =>
    c.date < latest.date && c.date >= start && typeof c.restingHR === 'number');
  if (latest.restingHR && prior.length >= 3) {
    const base = median(prior.map(c => c.restingHR));
    const delta = latest.restingHR - base;
    const direction = delta === 0 ? 'equal' : delta > 0 ? 'higher' : 'lower';
    findings.push({ id: 'restingHeartRate', kind: 'observation', direction,
      window: window(latest.date, latest.date), comparator: { basis: 'priorCheckins', window: window(start, offset(latest.date, -1)) },
      sources: [checkRef(latest), ...prior.map(checkRef)], metrics: {
        current: bpm(latest.restingHR), median: bpm(base), delta: bpm(delta), count: count(prior.length) },
      allowedInterpretations: [direction], requiredCaveats: ['noDiagnosis'] });
  }
  return findings;
}

export function buildEvidence(runs: Run[], selected: Run | undefined, checkins: Checkin[],
  asOf: string, inputCoverage: Evidence['inputCoverage'] = 'complete'): Evidence {
  const history = runs.filter(run => run.date <= asOf);
  const currentWindow = window(offset(asOf, -6), asOf);
  const previousWindow = window(offset(asOf, -13), offset(asOf, -7));
  const within = (range: Window) => history.filter(run => run.date >= range.start! && run.date <= range.end);
  const week = within(currentWindow);
  const previous = within(previousWindow);
  const month = within(window(offset(asOf, -27), asOf));
  const current = sumKm(week);
  const prior = sumKm(previous);
  const truncated = inputCoverage === 'truncated';
  const change = prior && !truncated ? pct((current - prior) / prior * 100) : null;
  const direction = !change ? 'unavailable' : current === prior ? 'equal' : current > prior ? 'higher' : 'lower';
  const findings: EvidenceFinding[] = [{ id: 'volume', kind: 'observation', direction, window: currentWindow,
    comparator: { basis: 'previousWeek', window: previousWindow }, sources: [...week, ...previous].map(runRef),
    metrics: { current: km(current), previous: km(prior), currentCount: count(week.length),
      previousCount: count(previous.length), change }, allowedInterpretations: [direction === 'unavailable' ? 'recorded' : direction],
    requiredCaveats: [...(truncated ? ['truncatedHistory' as const] : prior ? [] : ['noPriorVolume' as const]), 'missingImports'] }];
  if (selected) findings.push(...activityFindings(selected, history, truncated));
  findings.push(...recoveryFindings(checkins, asOf, truncated));
  return { version: 1, asOf, inputCoverage, findings, coverage: { runs28: month.length, km28: sumKm(month),
    longest28: month.reduce((max, run) => Math.max(max, run.distance), 0), weekKm: current, previousWeekKm: prior } };
}

const today = () => new Date().toISOString().slice(0, 10);

export function trainingBrief(runs: Run[], selected: Run | undefined, checkins: Checkin[] = [], asOf?: string) {
  const evidence = buildEvidence(runs, selected, checkins, asOf || selected?.date || today());
  return { asOf: evidence.asOf, findings: evidence.findings.map(renderFinding), coverage: evidence.coverage,
    tools: ['read_run_history', 'compare_recorded_periods', ...(selected ? ['inspect_split_coverage', 'compare_similar_distances'] : []), 'review_checkins'],
    mode: 'deterministic-evidence-engine' };
}

const recoveryIds: FindingId[] = ['recovery', 'missingRecovery', 'restingHeartRate'];
const comparisonIds: FindingId[] = ['volume', 'comparablePace', 'insufficientComparables', 'restingHeartRate'];
const pacingIds: FindingId[] = ['comparablePace', 'insufficientComparables', 'splitPace', 'unusualSplits', 'incompleteSplits'];

export function answerTraining(question: string, runs: Run[], selected: Run | undefined, checkins: Checkin[]) {
  if (!selected) return 'Import a run first so the analysis can use your own measurements.';
  const q = question.toLowerCase();
  const recovery = /recover|rest|sleep|tomorrow|fatigue|sore/.test(q);
  const evidence = buildEvidence(runs, selected, checkins, recovery ? today() : selected.date);
  let ids: FindingId[] | undefined;
  if (recovery) ids = recoveryIds;
  else if (/compar|trend|week|volume|progress/.test(q)) ids = comparisonIds;
  else if (/split|pac|slow|fast/.test(q)) ids = pacingIds;
  else if (/race|marathon|predict|finish/.test(q)) {
    const c = evidence.coverage;
    return `The 28-day record ending ${evidence.asOf} contains ${c.runs28} runs, ${c.km28.toFixed(1)} km and a longest run of ${c.longest28.toFixed(1)} km. This does not establish complete training coverage or marathon readiness. Use Race lab with a recent representative race effort to explore formula-based equivalents. A training run is not automatically a race benchmark.`;
  } else if (!/analy|run|train|summar|evidence|insight/.test(q)) {
    return 'I can currently analyze runs, compare recorded training, inspect splits, review recovery check-ins and explain race-estimate limitations. Try one of those questions. This is an evidence engine, not a general-purpose language model.';
  }
  const rendered = evidence.findings.filter(f => !ids || ids.includes(f.id)).map(renderFinding);
  return `${selected.name} · ${selected.date}\n${analyze(selected)[0]}\n\n` + rendered.map(f => f.title + '\n' + f.detail).join('\n\n');
}
