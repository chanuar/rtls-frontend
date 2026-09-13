import type { Heatmap } from '../types'

export function maxHeatCount(heat: Heatmap | null | undefined): number {
  return heat?.bins.reduce((max, bin) => Math.max(max, bin.count), 0) ?? 0
}
