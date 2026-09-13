import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ENTRANCE, FLOOR, TEST_LAYOUT, ZONES, qualityLevel, tagColor } from '../config'
import type { Anchor, HeatBin, LivePosition, Sample } from '../types'
import { isContinuous } from '../lib/trajectory'
import { ReplayPath } from './ReplayPath'

const SCALE = 64 // px por metro
const MARGIN = 0.7 // metros de margen alrededor de los anchors

interface Props {
  anchors: Anchor[]
  live: Record<string, LivePosition>
  freshTags?: string[]
  now?: number
  trails: Record<string, Sample[]>
  tagIds: string[]
  selectedTag: string | null
  onSelect: (tag: string) => void
  mode: 'live' | 'replay'
  replayPath?: Sample[]
  replayMarker?: { x: number; y: number } | null
  replayTime?: number
  heat?: { cell: number; bins: HeatBin[] } | null
}

const QUALITY_COLOR = { ok: 'var(--color-ok)', warn: 'var(--color-warn)', bad: 'var(--color-danger)' } as const

function heatColor(t: number): string {
  return `color-mix(in oklab, var(--heat-low), var(--heat-high) ${t * 100}%)`
}

const TagLabel = memo(function TagLabel({ label, color, markerX, mapWidth }: {
  label: string; color: string; markerX: number; mapWidth: number
}) {
  const ref = useRef<SVGTextElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const width = node.getComputedTextLength()
    const left = markerX + 14 + width <= mapWidth - 8
      ? markerX + 14 : Math.max(8, markerX - 14 - width)
    node.setAttribute('x', String(left - markerX))
  }, [label, markerX, mapWidth])
  return <text ref={ref} x={14} y={4} fill={color} fontSize={11} fontWeight={600} fontFamily="var(--font-mono)">
    {label}
  </text>
})

export function FloorPlan(p: Props) {
  const [hoverZone, setHoverZone] = useState<string | null>(null)

  const bounds = useMemo(() => {
    const xs = p.anchors.map((a) => a.x)
    const ys = p.anchors.map((a) => a.y)
    const areaMinX = TEST_LAYOUT && xs.length ? Math.min(...xs) : 0
    const areaMinY = TEST_LAYOUT && ys.length ? Math.min(...ys) : 0
    const areaMaxX = TEST_LAYOUT && xs.length ? Math.max(...xs) : FLOOR.depth
    const areaMaxY = TEST_LAYOUT && ys.length ? Math.max(...ys) : FLOOR.width
    const minX = areaMinX - MARGIN
    const minY = areaMinY - MARGIN
    const maxX = areaMaxX + MARGIN
    const maxY = areaMaxY + MARGIN
    return { minX, minY, w: maxX - minX, h: maxY - minY, areaMinX, areaMinY, areaMaxX, areaMaxY }
  }, [p.anchors])

  const X = (x: number) => (x - bounds.minX) * SCALE
  const Y = (y: number) => (bounds.minY + bounds.h - y) * SCALE
  const W = bounds.w * SCALE
  const H = bounds.h * SCALE

  const gridLines = useMemo(() => {
    const v: number[] = []
    const h: number[] = []
    for (let x = Math.ceil(bounds.minX); x <= bounds.minX + bounds.w; x++) v.push(x)
    for (let y = Math.ceil(bounds.minY); y <= bounds.minY + bounds.h; y++) h.push(y)
    return { v, h }
  }, [bounds])

  const maxHeat = useMemo(
    () => Math.max(1, ...(p.heat?.bins.map((b) => b.count) ?? [1])),
    [p.heat],
  )

  const trailsToDraw = p.mode === 'live' ? p.trails : {}

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      role="group"
      aria-label={TEST_LAYOUT ? 'Área de prueba con posiciones UWB' : 'Plano de la farmacia con posiciones de empleados'}
      style={{ maxHeight: '100%' }}
    >
      {gridLines.v.map((x) => (
        <line key={`v${x}`} x1={X(x)} y1={0} x2={X(x)} y2={H} stroke="var(--map-grid)" />
      ))}
      {gridLines.h.map((y) => (
        <line key={`h${y}`} x1={0} y1={Y(y)} x2={W} y2={Y(y)} stroke="var(--map-grid)" />
      ))}

      {TEST_LAYOUT ? (
        <rect
          x={X(bounds.areaMinX)}
          y={Y(bounds.areaMaxY)}
          width={(bounds.areaMaxX - bounds.areaMinX) * SCALE}
          height={(bounds.areaMaxY - bounds.areaMinY) * SCALE}
          fill="var(--map-zone)"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="7 5"
        />
      ) : (
        <>
          <path
            d={`M ${X(0)} ${Y(ENTRANCE.y0)} L ${X(0)} ${Y(0)} L ${X(FLOOR.depth)} ${Y(0)} L ${X(FLOOR.depth)} ${Y(FLOOR.width)} L ${X(0)} ${Y(FLOOR.width)} L ${X(0)} ${Y(ENTRANCE.y1)}`}
            fill="none"
            stroke="var(--map-wall)"
            strokeWidth={3}
            strokeLinejoin="miter"
          />
          <text
            x={X(-0.35)}
            y={Y((ENTRANCE.y0 + ENTRANCE.y1) / 2)}
            fill="var(--color-muted)"
            fontSize={10}
            textAnchor="middle"
            transform={`rotate(-90 ${X(-0.35)} ${Y((ENTRANCE.y0 + ENTRANCE.y1) / 2)})`}
            style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
          >
            Entrada
          </text>
        </>
      )}

      {ZONES.map((z) => (
        <g
          key={z.id}
          onMouseEnter={() => setHoverZone(z.id)}
          onMouseLeave={() => setHoverZone(null)}
        >
          <rect
            x={X(z.x)}
            y={Y(z.y + z.h)}
            width={z.w * SCALE}
            height={z.h * SCALE}
            rx={6}
            fill={hoverZone === z.id ? 'var(--map-zone-hover)' : 'var(--map-zone)'}
            stroke={hoverZone === z.id ? 'var(--color-accent)' : 'var(--map-zone-line)'}
            strokeDasharray="5 4"
          />
          {z.w * SCALE >= 90 && (
            <text
              x={X(z.x) + 7}
              y={Y(z.y + z.h) + 15}
              fill={hoverZone === z.id ? 'var(--color-accent)' : 'var(--color-muted)'}
              fontSize={10}
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {z.name}
            </text>
          )}
          <title>{`${z.name} · ${(z.w * z.h).toFixed(1)} m²`}</title>
        </g>
      ))}

      {p.heat?.bins.map((b) => {
        const t = b.count / maxHeat
        return (
          <rect
            key={`${b.cx},${b.cy}`}
            x={X(b.cx * p.heat!.cell)}
            y={Y((b.cy + 1) * p.heat!.cell)}
            width={p.heat!.cell * SCALE}
            height={p.heat!.cell * SCALE}
            fill={heatColor(t)}
            opacity={0.12 + 0.5 * t}
            rx={2}
          />
        )
      })}

      {p.mode === 'replay' && p.replayPath && p.replayPath.length > 1 && (
        <ReplayPath samples={p.replayPath} time={p.replayTime ?? 0}
          minX={bounds.minX} maxY={bounds.minY + bounds.h} scale={SCALE} />
      )}

      {p.anchors.map((a) => (
        <g key={a.id}>
          <rect
            x={X(a.x) - 5}
            y={Y(a.y) - 5}
            width={10}
            height={10}
            transform={`rotate(45 ${X(a.x)} ${Y(a.y)})`}
            fill="var(--map-background)"
            stroke="var(--color-accent)"
            strokeWidth={1.2}
          />
          <text x={X(a.x) + 10} y={Y(a.y) + 4} fill="var(--color-muted)" fontSize={12} fontFamily="var(--font-mono)">
            {a.id}
          </text>
          <title>{`${a.id} · (${a.x}, ${a.y}, ${a.z} m)${a.description ? ' · ' + a.description : ''}`}</title>
        </g>
      ))}

      {Object.entries(trailsToDraw).map(([tag, trail]) => {
        const color = tagColor(tag, p.tagIds)
        return trail.slice(1).map((s, i) => isContinuous(trail[i], s) && (
          <line
            key={`${tag}-${i}`}
            x1={X(trail[i].x)}
            y1={Y(trail[i].y)}
            x2={X(s.x)}
            y2={Y(s.y)}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={((i + 1) / trail.length) * 0.45}
          />
        ))
      })}

      {p.mode === 'live' &&
        Object.values(p.live).map((pos) => {
          const stale = p.freshTags !== undefined && !p.freshTags.includes(pos.tag)
          const age = Math.max(0, Math.floor(((p.now ?? Date.now()) - Date.parse(pos.ts)) / 1000))
          const label = stale ? `${pos.tag} · Última posición · hace ${age} s` : pos.tag
          const color = stale ? 'var(--color-muted)' : tagColor(pos.tag, p.tagIds)
          const selected = pos.tag === p.selectedTag
          const q = stale ? 'var(--color-warn)' : QUALITY_COLOR[qualityLevel(pos.quality)]
          return (
            <g
              key={pos.tag}
              onClick={() => p.onSelect(pos.tag)}
              role="button"
              tabIndex={0}
              aria-label={`Seleccionar ${label}`}
              aria-pressed={selected}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  p.onSelect(pos.tag)
                }
              }}
              style={{ cursor: 'pointer', transition: 'transform 0.9s linear' }}
              transform={`translate(${X(pos.x)} ${Y(pos.y)})`}
            >
              {selected && !stale && <circle className="tag-pulse" r={9} fill="none" stroke={color} strokeWidth={1.5} />}
              <circle r={selected ? 8 : 6.5} fill={color} stroke="var(--map-background)" strokeWidth={2} />
              <circle r={selected ? 11.5 : 10} fill="none" stroke={q} strokeWidth={1.5} opacity={0.9} strokeDasharray={stale ? "3 3" : undefined} />
              <TagLabel label={label} color={color} markerX={X(pos.x)} mapWidth={W} />
              <title>{`${pos.tag} · (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) m · rms ${pos.quality.toFixed(2)} m · ${pos.n_anchors} anchors`}</title>
            </g>
          )
        })}

      {p.mode === 'replay' && p.replayMarker && (
        <g transform={`translate(${X(p.replayMarker.x)} ${Y(p.replayMarker.y)})`}>
          <circle className="tag-pulse" r={9} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
          <circle r={8} fill="var(--color-accent)" stroke="var(--map-background)" strokeWidth={2} />
        </g>
      )}
    </svg>
  )
}
