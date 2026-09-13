import { Profiler, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import '../../src/index.css'

// Install after Playwright's clock, before React starts any application timers.
const activeIntervals = new Set<number>()
const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window)
window.setInterval = ((...args: Parameters<typeof start>) => {
  const id = start(...args)
  if (!new Error().stack?.includes('/@vite/client')) activeIntervals.add(id)
  return id
}) as typeof window.setInterval
window.clearInterval = id => { activeIntervals.delete(id!); stop(id) }

const root = createRoot(document.getElementById('root')!)
const timings: number[] = []
Object.assign(window, { unmountApp: () => root.unmount(), renderTimings: timings, activeIntervals })
root.render(<StrictMode><Profiler id="App" onRender={(_, __, duration) => timings.push(duration)}><App /></Profiler></StrictMode>)
