export type Params = {
  model?: string
  dataset?: string
  mode?: string
  subArray?: number
  parallelRead?: number
  ADCprecision?: number
  cellBit?: number
  onoffratio?: number
  vari?: number
  t?: number
  v?: number
  detect?: number
  target?: number
  wl_weight?: number
  wl_activate?: number
}

export type Summary = Partial<{
  accuracy_pct: number
  correct: number
  total: number
  testLoss: number
  chipArea_um2: number
  areaArray_um2: number
  areaIC_um2: number
  areaADC_um2: number
  areaAccum_um2: number
  areaOther_um2: number
  clockPeriod_ns: number
  readLatency_ns: number
  readDynamicEnergy_pJ: number
  leakageEnergy_pJ: number
  leakagePower_uW: number
  bufferLatency_ns: number
  bufferEnergy_pJ: number
  icLatency_ns: number
  icEnergy_pJ: number
  tops_per_w: number
  tops: number
  fps: number
  tops_per_mm2: number
  memoryUtilization_pct: number
  neurosimRuntime_s: number
}>

export type Part = 'adc' | 'accum' | 'other'
export type Breakdown = Partial<Record<Part, { latency_ns?: number; energy_pJ?: number }>>

export type Layer = {
  layer: number
  tiles?: number
  speedUp?: number
  utilization?: number
  readLatency_ns?: number
  readDynamicEnergy_pJ?: number
  leakagePower_uW?: number
  leakageEnergy_pJ?: number
  bufferLatency_ns?: number
  bufferEnergy_pJ?: number
  icLatency_ns?: number
  icEnergy_pJ?: number
  breakdown?: Breakdown
}

export type StageState = 'done' | 'active' | 'pending' | 'unknown' | 'failed'

export type Stage = {
  key: 'download' | 'trace' | 'inference' | 'neurosim'
  label: string
  state: StageState
  done: number | null
  total: number | null
  unit: string | null
  startedAt: number | null
  endedAt: number | null
  etaSeconds: number | null
}

export type Progress = {
  live: boolean
  current: Stage['key'] | null
  stages: Stage[]
  startedAt: number | null
  endedAt: number | null
  exitCode: number | null
  serverTime: number
}

export type Run = {
  id: string
  file: string
  startedAt: number
  modifiedAt: number
  status: 'running' | 'complete' | 'failed'
  stage: string
  params: Params
  summary: Summary
  chipBreakdown: Breakdown
  layers?: Layer[]
  progress: Progress
}

async function get<T>(url: string, asText = false): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (asText ? res.text() : res.json()) as Promise<T>
}

export const fetchRuns = () => get<Run[]>('/api/runs')
export const fetchRun = (id: string) => get<Run>(`/api/runs/${encodeURIComponent(id)}`)
export const fetchLog = (id: string) => get<string>(`/api/runs/${encodeURIComponent(id)}/log`, true)
