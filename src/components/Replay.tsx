import { useEffect, useMemo, useRef, useState } from 'react'
import { positionAt } from '../lib/trajectory'
import { periodTimeFormatter } from '../lib/time'
import type { Sample } from '../types'

const SPEEDS = [1, 4, 16, 60]

export function useReplay(samples: Sample[], active = true) {
  const range = useMemo(() => {
    if (samples.length < 2) return null
    return {
      start: new Date(samples[0].ts).getTime(),
      end: new Date(samples[samples.length - 1].ts).getTime(),
    }
  }, [samples])

  const [previousRange, setPreviousRange] = useState(range)
  const [cursor, setCursor] = useState(range?.start ?? 0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(16)
  const lastTick = useRef<number>(0)

  // Reset before children commit, so an old cursor cannot overwrite a first interaction.
  if (previousRange !== range) {
    setPreviousRange(range)
    setCursor(range?.start ?? 0)
    setPlaying(false)
  }

  useEffect(() => {
    if (!active) setPlaying(false)
  }, [active])

  useEffect(() => {
    if (!active || !playing || !range) return
    lastTick.current = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = now - lastTick.current
      lastTick.current = now
      setCursor(c => Math.min(c + dt * speed, range.end))
    }, 66)
    return () => window.clearInterval(id)
  }, [active, playing, speed, range])

  useEffect(() => {
    if (range && cursor >= range.end) setPlaying(false)
  }, [cursor, range])

  const marker = useMemo(() => positionAt(samples, cursor), [samples, cursor])

  return { range, cursor, setCursor, playing, setPlaying, speed, setSpeed, marker }
}

interface BarProps {
  replay: ReturnType<typeof useReplay>
}

export function ReplayBar({ replay }: BarProps) {
  const { range, cursor, setCursor, playing, setPlaying, speed, setSpeed } = replay
  const formatter = useMemo(() => range ? periodTimeFormatter(range.start, range.end, 'medium') : null, [range])
  if (!range || !formatter) return null

  return (
    <div className="replay-controls">
      <button
        disabled={range.start === range.end}
        onClick={() => {
          if (!playing && cursor >= range.end) setCursor(range.start)
          setPlaying(!playing)
        }}
        aria-label={playing ? 'Pausar reproducción' : 'Reproducir jornada'}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line-2 bg-panel-2 text-accent hover:border-accent/50"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="font-mono text-[13px] text-muted tabular-nums">{formatter.format(cursor)}</span>
      {range.start === range.end && <span className="text-[13px] text-muted">Sin intervalo reproducible</span>}
      {!replay.marker && <span className="text-[13px] text-warn">Sin datos en este intervalo</span>}
      <input
        type="range"
        disabled={range.start === range.end}
        aria-label="Posición temporal"
        aria-valuetext={new Date(cursor).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'medium' })}
        className="flex-1"
        min={range.start}
        max={range.end}
        step={1000}
        value={cursor}
        onChange={(e) => setCursor(Number(e.target.value))}
      />
      <span className="font-mono text-[13px] text-muted tabular-nums">{formatter.format(range.end)}</span>
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            aria-pressed={speed === s}
            className={`rounded px-2 py-1 font-mono text-[13px] ${
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
