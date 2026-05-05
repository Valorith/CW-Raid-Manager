export const EASTERN_TIME_ZONE = 'America/New_York';

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
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
    second: value('second')
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
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
    date.getUTCMilliseconds()
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
    0
  );
  let utc = wallUtc - getEasternOffsetMinutes(new Date(wallUtc)) * 60000;
  utc = wallUtc - getEasternOffsetMinutes(new Date(utc)) * 60000;
  return new Date(utc);
}

export function easternDateTimeInputToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const date = easternWallTimeToDate({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: 0
  });
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function easternDateInputToIso(value: string, boundary: 'start' | 'end' = 'start') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = easternWallTimeToDate({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: boundary === 'end' ? 23 : 0,
    minute: boundary === 'end' ? 59 : 0,
    second: boundary === 'end' ? 59 : 0
  });
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToEasternDateTimeInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = getEasternParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatEasternDateTime(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return 'Unknown start';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...options
  }).format(date);
}

export function formatEasternDate(value: string | Date, fallback = 'unknown date') {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium'
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    dateStyle: 'medium'
  }).format(date);
}

export function formatEasternTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

export function easternDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = getEasternParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
