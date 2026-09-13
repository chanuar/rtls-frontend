import { Profiler, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import '../../src/index.css'

const root = createRoot(document.getElementById('root')!)
const timings: number[] = []
Object.assign(window, { unmountApp: () => root.unmount(), renderTimings: timings })
root.render(<StrictMode><Profiler id="App" onRender={(_, __, duration) => timings.push(duration)}><App /></Profiler></StrictMode>)
