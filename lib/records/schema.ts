import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  value => !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  'Invalid date',
);

const run = z.object({
  name: z.string().min(1).max(120),
  date,
  distance: z.number().positive().max(500),
  seconds: z.number().positive().max(604800),
  hr: z.number().min(25).max(240).nullish(),
  cadence: z.number().min(20).max(300).nullish(),
  elevation: z.number().min(0).max(30000).nullish(),
  rpe: z.number().min(1).max(10).nullish(),
  source: z.enum(['manual', 'screenshot', 'gpx', 'tcx', 'intervals', 'strava-link']),
  url: z.string().max(600).optional().refine(
    value => !value || /^https:\/\/(www\.)?(strava\.com|strava\.app\.link)\//.test(value),
    'Use a Strava HTTPS link',
  ),
  splits: z.array(z.number().positive().max(7200)).max(500).optional(),
  notes: z.string().max(5000).optional(),
  files: z.array(z.string().uuid()).max(6).optional(),
  timeBasis: z.enum(['moving', 'elapsed']).optional(),
});

const checkin = z.object({
  date,
  sleep: z.number().min(0).max(24).nullable(),
  fatigue: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  restingHR: z.number().min(25).max(180).nullable(),
  notes: z.string().max(2000),
});

const goal = z.object({
  name: z.string().min(1).max(100),
  date,
  distance: z.number().min(1).max(200),
  targetSeconds: z.number().positive().max(172800),
});

export function parseRecord(input: { kind?: unknown; body?: unknown }) {
  const { kind } = input;
  if (kind !== 'run' && kind !== 'checkin' && kind !== 'goal') {
    throw new Error('INPUT:Unknown record type.');
  }
  const parsed = { run, goal, checkin }[kind].safeParse(input.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message);
    throw new Error('INPUT:' + issues.join('; '));
  }
  return { kind, body: parsed.data } as const;
}
