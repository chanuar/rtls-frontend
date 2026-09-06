import { useMemo, useState } from 'react'

export interface Period {
  start: Date
  end: Date
}

interface Props {
  value: Period
  onChange: (p: Period) => void
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function withTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function PeriodPicker({ value, onChange }: Props) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = startOfDay(value.start)
    d.setDate(1)
    return d
  })
  const [picking, setPicking] = useState<Date | null>(null)

  const dayStart = startOfDay(value.start)
  const dayEnd = startOfDay(value.end)
  const timeFrom = toHHMM(value.start)
  const timeTo = toHHMM(value.end)

  const grid = useMemo(() => {
    const first = new Date(viewMonth)
    const offset = (first.getDay() + 6) % 7 // lunes = 0
    const cells: (Date | null)[] = Array(offset).fill(null)
    const month = viewMonth.getMonth()
    const d = new Date(viewMonth)
    while (d.getMonth() === month) {
      cells.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewMonth])

  const monthLabel = viewMonth
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase())

  function pickDay(day: Date) {
    if (!picking) {
      setPicking(day)
      onChange({ start: withTime(day, timeFrom), end: withTime(day, timeTo) })
    } else {
      const [a, b] = picking <= day ? [picking, day] : [day, picking]
      setPicking(null)
      onChange({ start: withTime(a, timeFrom), end: withTime(b, timeTo) })
    }
  }

  function setTimes(from: string, to: string) {
    onChange({ start: withTime(dayStart, from), end: withTime(dayEnd, to) })
  }

  function preset(kind: 'today' | 'yesterday' | 'week') {
    const now = new Date()
    setPicking(null)
    if (kind === 'today') {
      onChange({ start: withTime(now, '08:00'), end: now })
    } else if (kind === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      onChange({ start: withTime(y, '08:00'), end: withTime(y, '21:00') })
    } else {
      const w = new Date(now)
      w.setDate(w.getDate() - 6)
      onChange({ start: withTime(w, '08:00'), end: now })
    }
    setViewMonth(() => {
      const d = startOfDay(new Date())
      d.setDate(1)
      return d
    })
  }

  const inRange = (day: Date) => day >= dayStart && day <= dayEnd
  const today = startOfDay(new Date())

  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-3 flex gap-1">
        {(
          [
            ['today', 'Hoy'],
            ['yesterday', 'Ayer'],
            ['week', '7 días'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => preset(k)}
            className="flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-accent"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button
          aria-label="Mes anterior"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-fg"
        >
          ‹
        </button>
        <span className="text-[12px] font-medium">{monthLabel}</span>
        <button
          aria-label="Mes siguiente"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-fg"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={d + i} className="pb-1 text-[10px] font-medium text-muted">
            {d}
          </span>
        ))}
        {grid.map((day, i) => {
          if (!day) return <span key={i} />
          const isStart = sameDay(day, dayStart)
          const isEnd = sameDay(day, dayEnd)
          const mid = inRange(day) && !isStart && !isEnd
          const isToday = sameDay(day, today)
          return (
            <button
              key={i}
              onClick={() => pickDay(day)}
              aria-label={day.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
              className={[
                'mx-auto flex h-7 w-7 items-center justify-center font-mono text-[11px] transition-colors',
                isStart || isEnd
                  ? 'rounded-md bg-accent text-ink font-semibold'
                  : mid
                    ? 'rounded-none bg-accent/12 text-accent'
                    : 'rounded-md text-fg hover:bg-panel-2',
                isToday && !isStart && !isEnd ? 'ring-1 ring-inset ring-line-2' : '',
              ].join(' ')}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {picking && (
        <p className="mt-1.5 text-[10px] text-accent">Elige el día final del rango…</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted">
          Desde
          <input
            type="time"
            value={timeFrom}
            onChange={(e) => setTimes(e.target.value, timeTo)}
            className="rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-[12px] text-fg"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted">
          Hasta
          <input
            type="time"
            value={timeTo}
            onChange={(e) => setTimes(timeFrom, e.target.value)}
            className="rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-[12px] text-fg"
          />
        </label>
      </div>

      <p className="mt-2 font-mono text-[10px] text-muted">
        {value.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} {toHHMM(value.start)}
        {' → '}
        {value.end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} {toHHMM(value.end)}
      </p>
    </div>
  )
}
