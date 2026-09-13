export const isTimestamp = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10)

// Compare validated ISO timestamps without losing fractions beyond milliseconds.
export function compareTimestamps(a: string, b: string): number {
  const milliseconds = Date.parse(a) - Date.parse(b)
  if (milliseconds !== 0) return milliseconds
  const fractionA = (a.match(/\.(\d+)/)?.[1] ?? '').replace(/0+$/, '')
  const fractionB = (b.match(/\.(\d+)/)?.[1] ?? '').replace(/0+$/, '')
  return fractionA === fractionB ? 0 : fractionA < fractionB ? -1 : 1
}

export function periodTimeFormatter(start: number, end: number, timeStyle: 'short' | 'medium' = 'short') {
  return new Intl.DateTimeFormat('es-ES', {
    timeStyle,
    dateStyle: new Date(start).toDateString() === new Date(end).toDateString() ? undefined : 'short',
  })
}
