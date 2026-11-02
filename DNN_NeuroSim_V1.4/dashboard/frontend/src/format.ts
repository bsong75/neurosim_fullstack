import type { Params, Run, Summary } from './api'

// NeuroSim reports ns / pJ / um^2; pick a readable unit per value
const scale = (v: number, steps: [number, string][]) => {
  const abs = Math.abs(v)
  for (const [factor, unit] of steps) if (abs >= factor) return `${trim(v / factor)} ${unit}`
  const [factor, unit] = steps[steps.length - 1]
  return `${trim(v / factor)} ${unit}`
}

export const trim = (v: number) => {
  const abs = Math.abs(v)
  if (abs === 0) return '0'
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (abs >= 100) return v.toFixed(1)
  if (abs >= 1) return v.toFixed(2)
  return v.toPrecision(3)
}

export const fmtTime = (ns?: number) =>
  ns == null ? '—' : scale(ns, [[1e9, 's'], [1e6, 'ms'], [1e3, 'µs'], [1, 'ns']])
export const fmtEnergy = (pJ?: number) =>
  pJ == null ? '—' : scale(pJ, [[1e12, 'J'], [1e9, 'mJ'], [1e6, 'µJ'], [1e3, 'nJ'], [1, 'pJ']])
export const fmtArea = (um2?: number) =>
  um2 == null ? '—' : scale(um2, [[1e6, 'mm²'], [1, 'µm²']])
export const fmtPower = (uW?: number) =>
  uW == null ? '—' : scale(uW, [[1e6, 'W'], [1e3, 'mW'], [1, 'µW']])
export const fmtNum = (v?: number, unit = '') => (v == null ? '—' : `${trim(v)}${unit}`)
export const fmtPct = (v?: number) => (v == null ? '—' : `${v.toFixed(2)}%`)

export const fmtDate = (epochSec: number) =>
  new Date(epochSec * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

export const PARAM_LABELS: Record<keyof Params, string> = {
  model: 'Model',
  dataset: 'Dataset',
  mode: 'Mode',
  subArray: 'Sub-array',
  parallelRead: 'Parallel rows',
  ADCprecision: 'ADC bits',
  cellBit: 'Bits / cell',
  onoffratio: 'On/off ratio',
  vari: 'Variation',
  t: 'Retention t',
  v: 'Drift v',
  detect: 'Drift fixed',
  target: 'Drift target',
  wl_weight: 'Weight bits',
  wl_activate: 'Activation bits',
}

export type Metric = {
  key: keyof Summary
  label: string
  format: (v?: number) => string
  // value used on chart axes, in the unit named by axisUnit
  axis: (v: number) => number
  axisUnit: string
  better: 'higher' | 'lower'
}

export const METRICS: Metric[] = [
  { key: 'accuracy_pct', label: 'Accuracy', format: fmtPct, axis: (v) => v, axisUnit: '%', better: 'higher' },
  { key: 'tops_per_w', label: 'Energy efficiency', format: (v) => fmtNum(v, ' TOPS/W'), axis: (v) => v, axisUnit: 'TOPS/W', better: 'higher' },
  { key: 'chipArea_um2', label: 'Chip area', format: fmtArea, axis: (v) => v / 1e6, axisUnit: 'mm²', better: 'lower' },
  { key: 'readLatency_ns', label: 'Latency / image', format: fmtTime, axis: (v) => v / 1e3, axisUnit: 'µs', better: 'lower' },
  { key: 'readDynamicEnergy_pJ', label: 'Dynamic energy / image', format: fmtEnergy, axis: (v) => v / 1e6, axisUnit: 'µJ', better: 'lower' },
  { key: 'leakagePower_uW', label: 'Leakage power', format: fmtPower, axis: (v) => v / 1e3, axisUnit: 'mW', better: 'lower' },
  { key: 'fps', label: 'Throughput', format: (v) => fmtNum(v, ' FPS'), axis: (v) => v, axisUnit: 'FPS', better: 'higher' },
  { key: 'tops_per_mm2', label: 'Compute density', format: (v) => fmtNum(v, ' TOPS/mm²'), axis: (v) => v, axisUnit: 'TOPS/mm²', better: 'higher' },
]

// Short human label: only the settings that differ from the NeuroSim defaults
const DEFAULTS: Params = {
  subArray: 128, parallelRead: 128, ADCprecision: 5, cellBit: 1, onoffratio: 10,
  vari: 0, t: 0, v: 0, wl_weight: 8, wl_activate: 8,
}
export const runLabel = (run: Run) => {
  const p = run.params
  const diffs = (Object.keys(DEFAULTS) as (keyof Params)[])
    .filter((k) => p[k] != null && p[k] !== DEFAULTS[k])
    .map((k) => `${PARAM_LABELS[k]} ${p[k]}`)
  return [p.model, ...diffs].filter(Boolean).join(' · ')
}
