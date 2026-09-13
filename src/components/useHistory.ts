import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchHeatmap, fetchPositions } from '../lib/api'
import { demoHeatmap, demoTrajectory } from '../lib/demo'
import { analyzeTrajectory } from '../lib/trajectory'
import { isValidPeriod, type Period } from './PeriodPicker'
import type { Heatmap, Sample } from '../types'

const EMPTY_SAMPLES: Sample[] = []

export function useHistory({ selectedTag, period, demo, showHeat }: {
  selectedTag: string | null; period: Period; demo: boolean; showHeat: boolean
}) {
  const queryKey = JSON.stringify([selectedTag, period.start.getTime(), period.end.getTime(), demo])
  const [loaded, setLoaded] = useState<{ key: string; trajectory: Sample[] } | null>(null)
  const historyLoaded = loaded?.key === queryKey
  const trajectory = historyLoaded ? loaded.trajectory : EMPTY_SAMPLES
  const [heatResult, setHeatResult] = useState<{ source: typeof loaded; heat: Heatmap | null; error: string | null } | null>(null)
  const currentHeat = loaded?.key === queryKey && heatResult?.source === loaded ? heatResult : null
  const heat = currentHeat?.heat ?? null
  const heatError = currentHeat?.error ?? null
  const heatLoading = showHeat && loaded?.key === queryKey && !currentHeat
  useEffect(() => {
    if (!showHeat || !loaded || loaded.key !== queryKey || !selectedTag) return
    let cancelled = false
    setHeatResult(null)
    const pending = demo
      ? Promise.resolve({ cell: 0.5, bins: demoHeatmap(loaded.trajectory, 0.5) })
      : fetchHeatmap(period.start, period.end, 0.5, selectedTag)
    pending.then(
      heat => { if (!cancelled) setHeatResult({ source: loaded, heat, error: null }) },
      error => { if (!cancelled) setHeatResult({ source: loaded, heat: null, error: error instanceof Error ? error.message : 'Error al cargar el mapa de calor.' }) },
    )
    return () => { cancelled = true }
  }, [showHeat, loaded, queryKey, selectedTag, demo, period])
  const request = useRef(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const historyMessage = loading ? 'Cargando jornada…' : loadError ?? (
    !historyLoaded ? 'Selecciona un tag y un periodo, y pulsa «Cargar jornada».'
      : trajectory.length === 0 ? 'No hay posiciones en este periodo. Prueba otro periodo.'
        : trajectory.length === 1 ? 'Solo hay una muestra: se muestra la posición observada, pero no hay un intervalo para reproducir ni calcular estadísticas.'
          : null
  )
  useEffect(() => {
    request.current = request.current + 1
    setLoading(false)
    setLoadError(null)
    return () => { request.current++ }
  }, [queryKey])

  const stats = useMemo(() => (trajectory.length > 1 ? analyzeTrajectory(trajectory) : null), [trajectory])

  async function loadRange() {
    if (!selectedTag) return
    if (!isValidPeriod(period)) {
      setLoadError('El final debe ser posterior al inicio.')
      return
    }
    const id = ++request.current
    setLoading(true)
    setLoadError(null)
    setLoaded(null)
    try {
      if (demo) {
        const traj = demoTrajectory(selectedTag, period.start, period.end)
        setLoaded({ key: queryKey, trajectory: traj })
      } else {
        const traj = await fetchPositions(selectedTag, period.start, period.end)
        if (id !== request.current) return
        setLoaded({ key: queryKey, trajectory: traj })
      }
    } catch (err) {
      if (id === request.current) setLoadError(err instanceof Error ? err.message : 'Error al cargar los datos')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }

  return { historyLoaded, trajectory, heat, heatError, heatLoading, loading, loadError, historyMessage, stats, loadRange }
}
