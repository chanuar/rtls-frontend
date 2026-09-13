import { useState } from 'react'

export interface Period {
  start: Date
  end: Date
}

function startOfDay(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

export function todayPeriod(now = new Date()): Period {
  const start = startOfDay(now)
  return { start, end: new Date(Math.max(now.getTime(), start.getTime() + 1)) }
}

export function isValidPeriod({ start, end }: Period): boolean {
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start
}

function localInput(date: Date): string {
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  const [draft, setDraft] = useState(() => ({ value, start: localInput(value.start), end: localInput(value.end) }))
  if (draft.value !== value) setDraft({ value, start: localInput(value.start), end: localInput(value.end) })
  const valid = isValidPeriod(value)
  function edit(key: 'start' | 'end', text: string) {
    const date = new Date(text)
    const next = { ...value, [key]: localInput(date) === text && text !== '' ? date : new Date(NaN) }
    setDraft({ ...draft, value: next, [key]: text })
    onChange(next)
  }
  function preset(kind: 'today' | 'yesterday' | 'week') {
    const now = new Date()
    if (kind === 'today') return onChange(todayPeriod(now))
    const start = new Date(now)
    start.setDate(start.getDate() - (kind === 'yesterday' ? 1 : 6))
    start.setHours(8, 0, 0, 0)
    const end = kind === 'yesterday' ? new Date(start) : now
    if (kind === 'yesterday') end.setHours(21, 0, 0, 0)
    onChange({ start, end })
  }
  return <div className="period-picker">
    <div className="period-presets" role="group" aria-label="Periodos rápidos">
      {([['today', 'Hoy'], ['yesterday', 'Ayer'], ['week', '7 días']] as const).map(([key, label]) => (
        <button key={key} type="button" onClick={() => preset(key)}>{label}</button>
      ))}
    </div>
    {([['start', 'Desde'], ['end', 'Hasta']] as const).map(([key, label]) => (
      <label key={key} className="period-field">
        <span>{label}</span>
        <input type="datetime-local" value={draft[key]} required
          aria-invalid={!valid} aria-describedby={valid ? 'period-help' : 'period-error'}
          onChange={event => edit(key, event.target.value)} />
      </label>
    ))}
    <p id="period-help" className="field-hint">Fecha y hora local de este navegador.</p>
    {!valid && <p id="period-error" role="alert" className="field-error">Completa ambas fechas. El final debe ser posterior al inicio.</p>}
  </div>
}
