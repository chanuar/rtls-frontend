import { memo, useMemo } from 'react'
import { isContinuous, sampleIndexAt } from '../lib/trajectory'
import type { Sample } from '../types'

const CHUNK_SAMPLES = 256
interface Chunk { start: number; path: string; offsets: number[] }

const ReplayChunk = memo(function ReplayChunk({ chunk, index }: { chunk: Chunk; index: number }) {
  return <>
    <path d={chunk.path} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={1.5} />
    <path d={chunk.path.slice(0, chunk.offsets[index - chunk.start] ?? 0)} fill="none"
      stroke="#00d4ff" strokeWidth={2} strokeOpacity={0.8} strokeLinejoin="round" />
  </>
})

export function ReplayPath({ samples, time, minX, maxY, scale }: {
  samples: Sample[]; time: number; minX: number; maxY: number; scale: number
}) {
  const geometry = useMemo(() => {
    const chunks: Chunk[] = []
    const timestamps = samples.map(s => Date.parse(s.ts))
    for (let i = 0; i < samples.length; i += CHUNK_SAMPLES) {
      const start = Math.max(0, i - 1)
      const chunk: Chunk = { start, path: '', offsets: [] }
      for (let j = start; j < Math.min(i + CHUNK_SAMPLES, samples.length); j++) {
        const s = samples[j]
        chunk.path += `${j > start && isContinuous(samples[j - 1], s) ? 'L' : 'M'} ${(s.x - minX) * scale} ${(maxY - s.y) * scale} `
        chunk.offsets.push(chunk.path.length)
      }
      chunks.push(chunk)
    }
    return { chunks, timestamps }
  }, [samples, minX, maxY, scale])
  const index = sampleIndexAt(samples, time, geometry.timestamps)
  return <>{geometry.chunks.map(chunk => <ReplayChunk key={chunk.start} chunk={chunk}
    index={Math.max(chunk.start - 1, Math.min(index, chunk.start + chunk.offsets.length - 1))} />)}</>
}
