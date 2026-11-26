import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { trainingBrief, answerTraining } from '../lib/intelligence.ts';
import { cases, asOf } from './fixtures/evidence-cases.ts';

const snapshots = JSON.parse(readFileSync(new URL('./fixtures/evidence-parity.json', import.meta.url), 'utf8'));
for (const [name, { runs, selected, checks }] of Object.entries(cases)) {
  test('merged-main wrapper parity: ' + name, () => {
    assert.deepEqual(trainingBrief(runs, selected, checks, asOf), snapshots[name].brief);
    for (const [question, answer] of Object.entries(snapshots[name].answers)) {
      assert.equal(answerTraining(question, runs, selected, checks), answer);
    }
  });
}
