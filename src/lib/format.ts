const TIME_ZONE = 'Asia/Manila'

const dateTimeFormat = new Intl.DateTimeFormat('en-PH', {
  timeZone: TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dateFormat = new Intl.DateTimeFormat('en-PH', {
  timeZone: TIME_ZONE,
  dateStyle: 'medium',
})

const timeFormat = new Intl.DateTimeFormat('en-PH', {
  timeZone: TIME_ZONE,
  timeStyle: 'short',
})

const EMPTY = '—'

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormat.format(new Date(value)) : EMPTY
}

export function formatTime(value: string | null | undefined): string {
  return value ? timeFormat.format(new Date(value)) : EMPTY
}

// event_date is a date-only string; anchor it to Manila midnight so it never shifts a day.
export function formatEventDate(value: string | null | undefined): string {
  return value ? dateFormat.format(new Date(`${value}T00:00:00+08:00`)) : EMPTY
}

// YYYY-MM-DD in Manila, for file names.
export function manilaDateStamp(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date())
}
