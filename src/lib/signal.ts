import { MAX_GAP_S } from './trajectory'
import type { Sample } from '../types'

export function analyzeSignal(samples: Sample[]) {
  let meanRms = 0, qualitySamples = 0, anchorSamples = 0
  let maxRms: number | null = null
  let minAnchors: number | null = null, maxAnchors: number | null = null
  const gaps: { start: string; end: string; seconds: number }[] = []

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    if (sample.quality !== null) {
      qualitySamples++
      meanRms += (sample.quality - meanRms) / qualitySamples
      maxRms = Math.max(maxRms ?? sample.quality, sample.quality)
    }
    if (sample.n_anchors !== null) {
      anchorSamples++
      minAnchors = Math.min(minAnchors ?? sample.n_anchors, sample.n_anchors)
      maxAnchors = Math.max(maxAnchors ?? sample.n_anchors, sample.n_anchors)
    }
    if (i === 0) continue
    const previous = samples[i - 1]
    const seconds = (Date.parse(sample.ts) - Date.parse(previous.ts)) / 1000
    if (seconds > MAX_GAP_S) gaps.push({ start: previous.ts, end: sample.ts, seconds })
  }

  const spanS = samples.length > 1
    ? (Date.parse(samples[samples.length - 1].ts) - Date.parse(samples[0].ts)) / 1000 : 0
  return {
    meanRms: qualitySamples ? meanRms : null,
    maxRms, qualitySamples, minAnchors, maxAnchors, anchorSamples,
    cadenceHz: spanS > 0 ? (samples.length - 1) / spanS : null,
    gaps,
  }
}
