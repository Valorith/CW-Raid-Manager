export const EASTERN_TIME_ZONE = 'America/New_York';

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const easternPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

function getEasternParts(date: Date): DateTimeParts {
  const parts = easternPartsFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
    millisecond: date.getUTCMilliseconds()
  };
}

function getEasternOffsetMinutes(date: Date) {
  const parts = getEasternParts(date);
  const easternAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
  return (easternAsUtc - date.getTime()) / 60000;
}

function easternWallTimeToDate(parts: DateTimeParts) {
  const wallUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
  let utc = wallUtc - getEasternOffsetMinutes(new Date(wallUtc)) * 60000;
  utc = wallUtc - getEasternOffsetMinutes(new Date(utc)) * 60000;
  return new Date(utc);
}

function datePartsFromUtcCalendar(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function addEasternDays(date: Date, days: number) {
  const parts = getEasternParts(date);
  const target = datePartsFromUtcCalendar(parts.year, parts.month - 1, parts.day + days);
  return easternWallTimeToDate({ ...parts, ...target });
}

export function addEasternMonths(date: Date, months: number) {
  const parts = getEasternParts(date);
  const totalMonths = parts.month - 1 + months;
  const targetYear = parts.year + Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(parts.day, daysInTargetMonth);

  return easternWallTimeToDate({
    ...parts,
    year: targetYear,
    month: targetMonthIndex + 1,
    day: clampedDay
  });
}
