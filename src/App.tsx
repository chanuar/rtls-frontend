import { useEffect, useState } from 'react'
import { TEST_LAYOUT } from './config'
import { useStore } from './store'
import { Workspace } from './components/Workspace'
import { ConnectionBadge, ConnectionError } from './components/TrackingView'
import type { Page } from './types'
import { ThemeSelect } from './components/ThemeSelect'

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
              +
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight">
                {TEST_LAYOUT ? 'Laboratorio UWB' : 'Farmacia · RTLS'}
              </h1>
              <p className="brand-subtitle mt-0.5 text-[13px] text-muted">
                Localización UWB
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
                className={`rounded px-3 py-1 text-[13px] ${
                  page === p ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="header-status"><ConnectionBadge /><ThemeSelect /></div>
      </header>
      <ConnectionError />

      <Workspace page={page} />
    </div>
  )
}
