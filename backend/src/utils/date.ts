// The backend container runs with the system default timezone (UTC in Docker, unset
// elsewhere) which has nothing to do with where the stores actually are. "Today" for
// reports/stats must follow the business's calendar day, not the server's, otherwise
// records synced in the first hour after local midnight land on the wrong day.
const BUSINESS_TIMEZONE = 'Africa/Casablanca';

function offsetMinutesAt(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);

  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUTC - date.getTime()) / 60000;
}

// Today's calendar date in the business timezone, as YYYY-MM-DD.
export function todayInBusinessTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// The UTC instant corresponding to 00:00:00 today in the business timezone —
// use this as the lower bound when filtering "received today".
export function startOfTodayUtc(): Date {
  const guess = new Date(`${todayInBusinessTz()}T00:00:00.000Z`);
  const offsetMinutes = offsetMinutesAt(BUSINESS_TIMEZONE, guess);
  return new Date(guess.getTime() - offsetMinutes * 60000);
}
