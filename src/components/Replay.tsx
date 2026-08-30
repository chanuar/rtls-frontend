import { useEffect, useMemo, useRef, useState } from 'react'
import { positionAt } from '../lib/trajectory'
import type { Sample } from '../types'

const SPEEDS = [1, 4, 16, 60]

export function useReplay(samples: Sample[]) {
  const range = useMemo(() => {
    if (samples.length < 2) return null
    return {
      start: new Date(samples[0].ts).getTime(),
      end: new Date(samples[samples.length - 1].ts).getTime(),
    }
  }, [samples])

  const [cursor, setCursor] = useState<number>(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(16)
  const lastTick = useRef<number>(0)

  useEffect(() => {
    if (range) {
      setCursor(range.start)
      setPlaying(false)
    }
  }, [range])

  useEffect(() => {
    if (!playing || !range) return
    lastTick.current = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = now - lastTick.current
      lastTick.current = now
      setCursor((c) => {
        const next = c + dt * speed
        if (next >= range.end) {
          setPlaying(false)
          return range.end
        }
        return next
      })
    }, 66)
    return () => window.clearInterval(id)
  }, [playing, speed, range])

  const marker = useMemo(() => positionAt(samples, cursor), [samples, cursor])

  return { range, cursor, setCursor, playing, setPlaying, speed, setSpeed, marker }
}

interface BarProps {
  replay: ReturnType<typeof useReplay>
}

export function ReplayBar({ replay }: BarProps) {
  const { range, cursor, setCursor, playing, setPlaying, speed, setSpeed } = replay
  if (!range) return null

  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex items-center gap-3 border-t border-line bg-panel px-4 py-2.5">
      <button
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? 'Pausar reproducción' : 'Reproducir jornada'}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line-2 bg-panel-2 text-accent hover:border-accent/50"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="font-mono text-[11px] text-muted tabular-nums">{fmt(cursor)}</span>
      <input
        type="range"
        aria-label="Posición temporal"
        className="flex-1"
        min={range.start}
        max={range.end}
        step={1000}
        value={cursor}
        onChange={(e) => setCursor(Number(e.target.value))}
      />
      <span className="font-mono text-[11px] text-muted tabular-nums">{fmt(range.end)}</span>
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`rounded px-2 py-1 font-mono text-[11px] ${
              speed === s ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
            }`}
          >
            ×{s}
          </button>
        ))}
      </div>
    </div>
  )
}
