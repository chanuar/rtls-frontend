import { useEffect, useState } from 'react'
import { TEST_LAYOUT } from './config'
import { useStore } from './store'
import { Workspace } from './components/Workspace'
import { ConnectionBadge, ConnectionError } from './components/TrackingView'
import type { Page } from './types'

export default function App() {
  const [page, setPage] = useState<Page>('plan')
  useEffect(() => {
    void useStore.getState().init()
    return () => useStore.getState().stop()
  }, [])
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-navigation">
          <div className="flex items-center gap-3">
            <div className="brand-mark" aria-hidden="true">
              UWB
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight">
                RTLS · {TEST_LAYOUT ? 'Prueba UWB' : 'Farmacia'}
              </h1>
              <p className="mt-0.5 text-[11px] text-muted">
                Localización en interiores
              </p>
            </div>
          </div>
          <nav className="page-navigation" aria-label="Navegación principal">
            {(
              [
                ['plan', 'Plano'],
                ['insights', 'Análisis'],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-current={page === p ? 'page' : undefined}
                className={`rounded px-3 py-1 text-[12px] ${
                  page === p ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <ConnectionBadge />
      </header>
      <ConnectionError />

      <Workspace page={page} />
    </div>
  )
}
