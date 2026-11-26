import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEvidence, trainingBrief, answerTraining } from '../lib/intelligence.ts';
import { analyze } from '../lib/running.ts';
import { cases, asOf } from './fixtures/evidence-cases.ts';

test('versioned evidence carries raw units, time windows and only contributing records', () => {
  const { runs, selected, checks } = cases.boundaries;
  const e = buildEvidence(runs, selected, checks, asOf);
  assert.equal(e.version, 1);
  assert.equal(e.inputCoverage, 'complete');
  assert.equal(new Set(e.findings.map(f => f.id)).size, e.findings.length);
  const volume = e.findings.find(f => f.id === 'volume')!;
  assert.deepEqual(volume.window, { start: '2026-10-22', end: asOf });
  assert.deepEqual(volume.comparator, { basis: 'previousWeek', window: { start: '2026-10-15', end: '2026-10-21' } });
  assert.deepEqual(volume.metrics.current, { value: 20, unit: 'km' });
  assert.deepEqual(volume.sources.map(s => s.id), ['selected', 'day6', 'day7', 'day13']);
  const comparable = e.findings.find(f => f.id === 'comparablePace')!;
  assert.deepEqual(comparable.sources.map(s => s.id), ['selected', 'day6', 'day7', 'day13', 'day27']);
  assert.deepEqual(comparable.allowedInterpretations, ['faster']);
  assert.deepEqual(comparable.requiredCaveats, ['unmatchedConditions']);
  assert.equal(comparable.metrics.delta.unit, 's/km');
  const hr = e.findings.find(f => f.id === 'restingHeartRate')!;
  assert.deepEqual(hr.metrics.median, { value: 60, unit: 'bpm' });
  assert.deepEqual(hr.sources.map(s => s.date), [asOf, '2026-10-27', '2026-10-20', '2026-10-14']);
});

for (const [label, offset, expected] of [
  ['exact tie', 0, 'equal'], ['slightly slower', 0.01, 'slower'], ['slightly faster', -0.01, 'faster'],
] as const) {
  test('use unrounded pace for comparable runs and splits: ' + label, () => {
    const selected = { ...cases.boundaries.selected, distance: 6, seconds: 1800 + offset,
      splits: [300, 300, 300, 300 + offset, 300 + offset, 300 + offset] };
    const runs = [selected, ...['2026-10-20', '2026-10-19'].map(date =>
      ({ ...selected, id: date, date, seconds: 1800 }))];
    const evidence = buildEvidence(runs, selected, [], asOf);
    const rendered = trainingBrief(runs, selected, []).findings;
    for (const id of ['comparablePace', 'splitPace'] as const) {
      const index = evidence.findings.findIndex(f => f.id === id);
      assert.equal(evidence.findings[index].direction, expected);
      assert.deepEqual(evidence.findings[index].allowedInterpretations, [expected]);
      assert.ok(rendered[index].detail.includes(expected === 'equal' ? 'same pace' : expected));
      if (!offset) assert.doesNotMatch(rendered[index].detail, /faster|slower/);
    }
    assert.ok(analyze(selected)[1].includes(expected === 'equal' ? 'same pace' : expected));
  });
}

test('truncated history suppresses historical comparisons and preserves measured activity splits', () => {
  const { selected, runs, checks } = cases.boundaries;
  const findings = buildEvidence(runs, selected, checks, asOf, 'truncated').findings;
  assert.ok(!findings.some(f => f.id === 'comparablePace' || f.id === 'restingHeartRate'));
  const volume = findings.find(f => f.id === 'volume')!;
  assert.equal(volume.metrics.change, null);
  assert.equal(volume.direction, 'unavailable');
  assert.ok(volume.requiredCaveats.includes('truncatedHistory'));
  assert.ok(findings.some(f => f.id === 'splitPace'));
});

test('recovery Ask uses today while the selected-run brief uses its historical date', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 10) });
  const { selected, runs, checks } = cases.boundaries;
  assert.ok(trainingBrief(runs, selected, checks).findings.some(f => f.title === 'Recovery context'));
  assert.match(answerTraining('sleep', runs, selected, checks), /Recovery context is missing or stale/);
  const frozen = JSON.stringify(buildEvidence(runs, selected, checks, asOf));
  t.mock.timers.tick(30 * 86400000);
  assert.equal(JSON.stringify(buildEvidence(runs, selected, checks, asOf)), frozen);
});
