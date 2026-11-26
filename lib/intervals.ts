import { prepareRecordWrite } from './records/repository.ts';

type ImportRequest = { key: string; oldest: string; newest: string };
type Activity = {
  id?: string | number;
  type: string;
  name?: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
};

async function fetchActivities({ key, oldest, newest }: ImportRequest): Promise<Activity[]> {
  if (typeof key !== 'string' || key.length < 8 || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new Error('INPUT:Enter a valid personal API key.');
  }
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const days = (Date.parse(newest) - Date.parse(oldest)) / 86400000;
  if (!date.test(oldest) || !date.test(newest) || !(days >= 0) || days > 180) {
    throw new Error('INPUT:Choose a date range of up to 180 days.');
  }
  const url = `https://intervals.icu/api/v1/athlete/0/activities?oldest=${oldest}&newest=${newest}`;
  const response = await fetch(url, {
    headers: { Authorization: 'Basic ' + btoa('API_KEY:' + key), Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('INPUT:Intervals.icu rejected this key. Check your personal API key and permissions.');
  }
  if (!response.ok) {
    throw new Error(`INPUT:Intervals.icu could not return activities (${response.status}). Try again later.`);
  }
  const activities = await response.json();
  if (!Array.isArray(activities)) throw new Error('INPUT:Unexpected Intervals.icu response.');
  return activities;
}

function normalizeRun(activity: Activity) {
  return {
    name: String(activity.name || 'Imported run').slice(0, 120),
    date: activity.start_date_local.slice(0, 10),
    distance: Number(activity.distance) / 1000,
    seconds: Number(activity.moving_time),
    hr: activity.average_heartrate ?? null,
    elevation: activity.total_elevation_gain ?? null,
    source: 'intervals',
    timeBasis: 'moving',
    notes: 'Summary synced from Intervals.icu. Only available running activities are imported; no raw streams or wellness data are synced in this version.',
  };
}

export async function importIntervals(getDb: () => D1Database, owner: string, input: ImportRequest) {
  const activities = await fetchActivities(input);
  const runs = activities.filter(activity =>
    ['Run', 'TrailRun', 'VirtualRun'].includes(activity.type) &&
    Number(activity.distance) > 0 && Number(activity.moving_time) > 0,
  ).slice(0, 500);

  const statements: D1PreparedStatement[] = [];
  for (const activity of runs) {
    if (!activity.id || !/^\d{4}-\d{2}-\d{2}/.test(activity.start_date_local || '')) continue;
    const id = owner + ':icu:' + activity.id;
    statements.push(prepareRecordWrite(getDb(), owner, id, 'run', normalizeRun(activity)));
  }
  for (let i = 0; i < statements.length; i += 50) {
    await getDb().batch(statements.slice(i, i + 50));
  }
  return {
    imported: statements.length,
    skipped: activities.length - statements.length,
    message: 'Available running summaries synced. Your API key was not stored.',
  };
}
