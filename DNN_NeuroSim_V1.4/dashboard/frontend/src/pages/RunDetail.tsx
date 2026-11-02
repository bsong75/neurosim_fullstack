import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchLog, fetchRun, type Layer } from '../api'
import { usePolling } from '../usePolling'
import Status from '../components/Status'
import { ProgressTracker } from '../components/ProgressTracker'
import { LayerBreakdownChart, SimpleBarChart } from '../components/Charts'
import {
  METRICS, PARAM_LABELS, fmtArea, fmtDate, fmtEnergy, fmtNum, fmtPower, fmtTime, runLabel,
} from '../format'

const TILE_METRICS = ['accuracy_pct', 'tops_per_w', 'chipArea_um2', 'readLatency_ns', 'readDynamicEnergy_pJ', 'fps'] as const

export default function RunDetail() {
  const { id = '' } = useParams()
  const { data: run, error, setActive } = usePolling(() => fetchRun(id), [id])
  const [showLog, setShowLog] = useState(false)
  const [log, setLog] = useState<string>()
  const [view, setView] = useState<'chart' | 'table'>('chart')

  useEffect(() => {
    if (run) setActive(run.status === 'running')
  }, [run, setActive])

  useEffect(() => {
    if (showLog) fetchLog(id).then(setLog).catch((e) => setLog(String(e)))
  }, [showLog, id, run?.modifiedAt])

  if (error && !run) return <p className="error">Could not load run: {error}</p>
  if (!run) return <p className="muted">Loading…</p>

  const s = run.summary
  const layers = run.layers ?? []
  const hasHardware = s.chipArea_um2 != null

  const areaRows = [
    ['Memory arrays', s.areaArray_um2],
    ['ADC / sense amps', s.areaADC_um2],
    ['Accumulation', s.areaAccum_um2],
    ['Interconnect', s.areaIC_um2],
    ['Other peripheries', s.areaOther_um2],
  ]
    .filter(([, v]) => v != null)
    .map(([name, v]) => ({ name: name as string, value: (v as number) / 1e6, display: fmtArea(v as number) }))
    .sort((a, b) => b.value - a.value)

  return (
    <section>
      <p className="crumbs"><Link to="/">← All runs</Link></p>
      <div className="page-head">
        <div>
          <h1>{runLabel(run)}</h1>
          <p className="muted">
            Started {fmtDate(run.startedAt)} · <Status run={run} />
            {s.neurosimRuntime_s != null && <> · NeuroSim took {fmtNum(s.neurosimRuntime_s, ' s')}</>}
          </p>
        </div>
      </div>

      <div className="params">
        {(Object.keys(PARAM_LABELS) as (keyof typeof PARAM_LABELS)[])
          .filter((k) => run.params[k] != null)
          .map((k) => (
            <span key={k} className="chip"><span className="muted">{PARAM_LABELS[k]}</span> {String(run.params[k])}</span>
          ))}
      </div>

      <ProgressTracker run={run} />

      <div className="tiles">
        {TILE_METRICS.map((key) => {
          const m = METRICS.find((x) => x.key === key)!
          return (
            <div key={key} className="tile">
              <div className="tile-label">{m.label}</div>
              <div className="tile-value">{m.format(s[key])}</div>
              {key === 'accuracy_pct' && s.correct != null && (
                <div className="tile-sub">{s.correct.toLocaleString()} / {s.total?.toLocaleString()} images</div>
              )}
              {key === 'readDynamicEnergy_pJ' && s.leakageEnergy_pJ != null && (
                <div className="tile-sub">+ {fmtEnergy(s.leakageEnergy_pJ)} leakage</div>
              )}
            </div>
          )
        })}
      </div>

      {!hasHardware ? (
        <p className="empty">
          {run.status === 'running'
            ? 'Hardware results appear here when step 4 (chip estimate) finishes. This page refreshes automatically.'
            : 'No NeuroSim hardware report in this run.'}
        </p>
      ) : (
        <>
          <div className="section-head">
            <h2>Per layer</h2>
            <div className="seg" role="tablist">
              <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Charts</button>
              <button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
            </div>
          </div>
          {view === 'chart' ? (
            <div className="grid2">
              <div className="card">
                <h3>Latency by layer</h3>
                <p className="muted small">Where each layer spends its time, split by circuit block</p>
                <LayerBreakdownChart layers={layers} kind="latency_ns" unit="µs" toUnit={(v) => v / 1e3} format={fmtTime} />
              </div>
              <div className="card">
                <h3>Dynamic energy by layer</h3>
                <p className="muted small">Energy each layer uses per image, split by circuit block</p>
                <LayerBreakdownChart layers={layers} kind="energy_pJ" unit="nJ" toUnit={(v) => v / 1e3} format={fmtEnergy} />
              </div>
            </div>
          ) : (
            <LayerTable layers={layers} />
          )}

          <div className="grid2">
            <div className="card">
              <h3>Chip area by component</h3>
              <p className="muted small">Total {fmtArea(s.chipArea_um2)}</p>
              <SimpleBarChart rows={areaRows} unit="mm²" layout="vertical" />
            </div>
            <div className="card">
              <h3>Chip summary</h3>
              <dl className="kv">
                <dt>Clock period</dt><dd>{fmtTime(s.clockPeriod_ns)}</dd>
                <dt>Leakage power</dt><dd>{fmtPower(s.leakagePower_uW)}</dd>
                <dt>Buffer latency</dt><dd>{fmtTime(s.bufferLatency_ns)}</dd>
                <dt>Buffer energy</dt><dd>{fmtEnergy(s.bufferEnergy_pJ)}</dd>
                <dt>Interconnect latency</dt><dd>{fmtTime(s.icLatency_ns)}</dd>
                <dt>Interconnect energy</dt><dd>{fmtEnergy(s.icEnergy_pJ)}</dd>
                <dt>Throughput</dt><dd>{fmtNum(s.tops, ' TOPS')}</dd>
                <dt>Compute density</dt><dd>{fmtNum(s.tops_per_mm2, ' TOPS/mm²')}</dd>
                <dt>Memory utilization</dt><dd>{fmtNum(s.memoryUtilization_pct, '%')}</dd>
              </dl>
            </div>
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Raw output</h2>
        <button onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show last 200 lines'}</button>
      </div>
      {showLog && <pre className="log">{log ?? 'Loading…'}</pre>}
      <p className="muted small">File: <code>results/{run.file}</code></p>
    </section>
  )
}

function LayerTable({ layers }: { layers: Layer[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th className="num">Tiles</th>
            <th className="num">Utilization</th>
            <th className="num">Latency</th>
            <th className="num">Dynamic energy</th>
            <th className="num">Leakage power</th>
            <th className="num">ADC latency</th>
            <th className="num">ADC energy</th>
          </tr>
        </thead>
        <tbody>
          {layers.map((l) => (
            <tr key={l.layer}>
              <td>{l.layer}</td>
              <td className="num">{fmtNum(l.tiles)}</td>
              <td className="num">{l.utilization != null ? `${(l.utilization * 100).toFixed(1)}%` : '—'}</td>
              <td className="num">{fmtTime(l.readLatency_ns)}</td>
              <td className="num">{fmtEnergy(l.readDynamicEnergy_pJ)}</td>
              <td className="num">{fmtPower(l.leakagePower_uW)}</td>
              <td className="num">{fmtTime(l.breakdown?.adc?.latency_ns)}</td>
              <td className="num">{fmtEnergy(l.breakdown?.adc?.energy_pJ)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
