import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchRuns, type Params, type Run } from '../api'
import { usePolling } from '../usePolling'
import { CompareScatter } from '../components/Charts'
import { METRICS, PARAM_LABELS, runLabel } from '../format'

const NUMERIC_PARAMS: (keyof Params)[] = [
  'ADCprecision', 'cellBit', 'subArray', 'parallelRead', 'onoffratio', 'vari', 't', 'v', 'wl_weight', 'wl_activate',
]

export default function ComparePage() {
  const { data: runs, error } = usePolling(fetchRuns, [], 15000)
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const picked = search.get('runs')?.split(',').filter(Boolean)

  const pool = useMemo(
    () => (runs ?? []).filter((r) => r.summary.accuracy_pct != null || r.summary.chipArea_um2 != null)
      .filter((r) => !picked || picked.includes(r.id)),
    [runs, picked?.join(',')],
  )

  // Default x-axis: the first setting that actually varies across these runs
  const varying = NUMERIC_PARAMS.filter((k) => new Set(pool.map((r) => r.params[k])).size > 1)
  const [xKey, setXKey] = useState<keyof Params>()
  const [yKey, setYKey] = useState(METRICS[0].key)
  const x = xKey ?? varying[0] ?? 'ADCprecision'
  const metric = METRICS.find((m) => m.key === yKey)!

  if (error && !runs) return <p className="error">Could not load runs: {error}</p>
  if (!runs) return <p className="muted">Loading…</p>

  const points = pool
    .filter((r) => typeof r.params[x] === 'number' && r.summary[metric.key] != null)
    .map((r) => ({
      x: r.params[x] as number,
      y: metric.axis(r.summary[metric.key]!),
      run: r,
      label: runLabel(r),
      display: metric.format(r.summary[metric.key]),
    }))

  const best = (key: typeof metric.key) => {
    const m = METRICS.find((mm) => mm.key === key)!
    const vals = pool.map((r) => r.summary[key]).filter((v): v is number => v != null)
    // A tie across every run has no "best"
    if (new Set(vals).size < 2) return undefined
    return m.better === 'higher' ? Math.max(...vals) : Math.min(...vals)
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Compare runs</h1>
          <p className="muted">
            {picked ? <>{pool.length} selected runs · <Link to="/compare">use all runs</Link></> : `${pool.length} runs with results`}
          </p>
        </div>
      </div>

      <div className="filters">
        <label>
          Setting (x-axis)
          <select value={x} onChange={(e) => setXKey(e.target.value as keyof Params)}>
            {NUMERIC_PARAMS.map((k) => (
              <option key={k} value={k}>{PARAM_LABELS[k]}{varying.includes(k) ? '' : ' (same in all runs)'}</option>
            ))}
          </select>
        </label>
        <label>
          Result (y-axis)
          <select value={yKey} onChange={(e) => setYKey(e.target.value as typeof yKey)}>
            {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {pool.length < 2 ? (
        <p className="empty">Comparisons need at least two finished runs. Change one setting per run, e.g. <code>--ADCprecision 4</code>, <code>6</code>, <code>7</code>.</p>
      ) : (
        <>
          <div className="card">
            <h3>{metric.label} vs {PARAM_LABELS[x]}</h3>
            <p className="muted small">
              One dot per run ({metric.better} is better). Click a dot to open the run.
              {!varying.includes(x) && ' This setting is the same in every run, so all dots share one x value.'}
            </p>
            <CompareScatter
              points={points}
              xLabel={PARAM_LABELS[x]}
              yLabel={`${metric.label} (${metric.axisUnit})`}
              onSelect={(r: Run) => navigate(`/runs/${encodeURIComponent(r.id)}`)}
            />
          </div>

          <h2>Side by side</h2>
          <p className="muted small">Bold marks the best value in each column.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  {varying.map((k) => <th key={k} className="num">{PARAM_LABELS[k]}</th>)}
                  {METRICS.map((m) => <th key={m.key} className="num">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {pool.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/runs/${encodeURIComponent(r.id)}`}>{runLabel(r)}</Link></td>
                    {varying.map((k) => <td key={k} className="num">{String(r.params[k] ?? '—')}</td>)}
                    {METRICS.map((m) => {
                      const v = r.summary[m.key]
                      return (
                        <td key={m.key} className={`num ${v != null && v === best(m.key) ? 'best' : ''}`}>
                          {m.format(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
