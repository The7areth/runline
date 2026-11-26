import type { Run } from '../../lib/running.ts';

const run = (id: string, date: string, seconds = 3000, extra: Partial<Run> = {}): Run =>
  ({ id, date, seconds, distance: 10, name: id, source: 'manual', ...extra });
const selected = run('selected', '2026-10-28', 3000, { splits: [300, 300, 100, 290, 310, 340, 400] });
const check = (date: string, restingHR: number | null) =>
  ({ date, restingHR, sleep: 7, fatigue: 2, soreness: 1 });
export const asOf = selected.date;
export const cases = {
  empty: { runs: [], selected: undefined, checks: [] },
  sparse: { runs: [selected], selected, checks: [check('2026-10-25', 60)] },
  boundaries: {
    runs: [selected, run('day6', '2026-10-22', 3060), run('day7', '2026-10-21', 3100),
      run('day13', '2026-10-15', 3200), run('day14', '2026-10-14', 3300, { timeBasis: 'elapsed' }),
      run('day27', '2026-10-01', 3000, { distance: 11 }), run('day28', '2026-09-30', 1000, { distance: 8 }),
      run('future', '2026-10-29')],
    selected, checks: [check(asOf, 64), check('2026-10-27', 59), check('2026-10-20', 60),
      check('2026-10-14', 62), check('2026-10-13', 100), check('2026-10-29', 99)],
  },
};
