import { Profiler, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FloorPlan } from '../../src/components/FloorPlan'
import { positionAt } from '../../src/lib/trajectory'

const samples = Array.from({ length: 120961 }, (_, i) => ({
  ts: new Date(Date.UTC(2026, 8, 1) + i * 5000).toISOString(),
  x: 14 + Math.sin(i / 100) * 10, y: 3 + Math.cos(i / 100), quality: 0.1, n_anchors: 4,
}))
const timings: number[] = []
function Benchmark() {
  const [cursor, setCursor] = useState(Date.parse(samples[60480].ts))
  const marker = useMemo(() => positionAt(samples, cursor), [cursor])
  return <>
    <button onClick={() => setCursor(c => c + 1000)}>Avanzar</button>
    <FloorPlan anchors={[]} live={{}} trails={{}} tagIds={[]} selectedTag={null} onSelect={() => {}}
      mode="replay" replayPath={samples} replayTime={cursor} replayMarker={marker} />
  </>
}

export function mountBenchmark() {
  const root = createRoot(document.getElementById('root')!)
  Object.assign(window, { benchmarkTimings: timings })
  root.render(<Profiler id="Replay" onRender={(_, __, duration) => timings.push(duration)}><Benchmark /></Profiler>)
}
