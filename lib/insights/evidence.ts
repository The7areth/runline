/** Internal evidence contract. Dates are inclusive UTC calendar dates. */
export type Checkin = {
  id?: string; date: string; sleep: number | null; fatigue: number;
  soreness: number; restingHR: number | null; notes?: string;
};
export type SourceRef = { kind: 'run' | 'checkin'; id: string | null; date: string };
export type Window = { start: string | null; end: string };
export type Direction = 'higher' | 'lower' | 'faster' | 'slower' | 'equal' | 'unavailable';
export type Unit = 'km' | 's/km' | '%' | 'count' | 'hours' | 'score/5' | 'bpm';
export type Measure<U extends Unit> = { value: number; unit: U };
type Count = Measure<'count'>;
type Distance = Measure<'km'>;
type Pace = Measure<'s/km'>;

type Metrics = {
  volume: { current: Distance; previous: Distance; currentCount: Count; previousCount: Count; change: Measure<'%'> | null };
  comparablePace: { current: Pace; median: Pace; delta: Pace; candidates: { date: string; distance: Distance }[] };
  insufficientComparables: { count: Count };
  splitPace: { count: Count; halfCount: Count; first: Pace; last: Pace; change: Measure<'%'>; complete: boolean };
  unusualSplits: { flagged: { kilometre: Distance; pace: Pace }[] };
  incompleteSplits: { count: Count; distance: Distance };
  missingHeartRate: { average: null };
  recovery: { date: string; sleep: Measure<'hours'> | null; fatigue: Measure<'score/5'>; soreness: Measure<'score/5'> };
  restingHeartRate: { current: Measure<'bpm'>; median: Measure<'bpm'>; delta: Measure<'bpm'>; count: Count };
  missingRecovery: { latest: string | null };
};

export type FindingId = keyof Metrics;
export type Interpretation = 'recorded' | 'missing' | 'review' | 'highSelfReport' | Exclude<Direction, 'unavailable'>;
export type CaveatId = 'missingImports' | 'noPriorVolume' | 'unmatchedConditions' | 'needComparables'
  | 'omittedMiddle' | 'partialSplits' | 'heuristic' | 'noStream' | 'selfReport'
  | 'reviewSelfReport' | 'noDiagnosis' | 'staleOrAbsent' | 'truncatedHistory';

type Metadata = {
  kind: 'observation' | 'context' | 'missing';
  direction: Direction;
  window: Window;
  comparator: { basis: 'previousWeek' | 'similarRuns' | 'firstHalf' | 'priorCheckins' | 'splitMedian'; window: Window } | null;
  sources: SourceRef[];
  allowedInterpretations: Interpretation[];
  requiredCaveats: CaveatId[];
};
export type EvidenceFinding = {
  [K in FindingId]: Metadata & { id: K; metrics: Metrics[K] }
}[FindingId];

export type Evidence = {
  version: 1;
  asOf: string;
  inputCoverage: 'complete' | 'truncated';
  findings: EvidenceFinding[];
  coverage: { runs28: number; km28: number; longest28: number; weekKm: number; previousWeekKm: number };
};
