import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchRuns, type Run } from '../api'
import { usePolling } from '../usePolling'
import Status from '../components/Status'
import { ProgressMini } from '../components/ProgressTracker'
import { METRICS, PARAM_LABELS, fmtDate } from '../format'

const PARAM_COLS = ['model', 'subArray', 'parallelRead', 'ADCprecision', 'cellBit', 'onoffratio', 'vari'] as const
const METRIC_COLS = METRICS.slice(0, 5)

type SortKey = { kind: 'param' | 'metric' | 'date'; key: string }

export default function RunsPage() {
  const { data: runs, error, setActive } = usePolling(fetchRuns, [])
  const [sort, setSort] = useState<SortKey>({ kind: 'date', key: 'startedAt' })
  const [desc, setDesc] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  // Keep refreshing only while something is still running
  useEffect(() => {
    if (runs) setActive(runs.some((r) => r.status === 'running'))
  }, [runs, setActive])

  const sorted = useMemo(() => {
    if (!runs) return []
    const value = (r: Run): number | string | undefined =>
      sort.kind === 'date' ? r.startedAt
        : sort.kind === 'param' ? r.params[sort.key as keyof Run['params']]
        : r.summary[sort.key as keyof Run['summary']]
    return [...runs].sort((a, b) => {
      const va = value(a), vb = value(b)
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return desc ? -cmp : cmp
    })
  }, [runs, sort, desc])

  const header = (kind: SortKey['kind'], key: string, label: string, numeric = true) => {
    const active = sort.kind === kind && sort.key === key
    return (
      <th className={numeric ? 'num' : ''} aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}>
        <button className="sort" onClick={() => {
          if (active) setDesc(!desc)
          else { setSort({ kind, key }); setDesc(true) }
        }}>
          {label}{active ? (desc ? ' ↓' : ' ↑') : ''}
        </button>
      </th>
    )
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  if (error && !runs) return <p className="error">Could not load runs: {error}</p>
  if (!runs) return <p className="muted">Loading…</p>

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Experiment runs</h1>
          <p className="muted">
            {runs.length} run{runs.length === 1 ? '' : 's'} in <code>results/</code>.
            Start one with <code>docker compose run --rm neurosim --model VGG8 --inference 1 …</code>
          </p>
        </div>
        <button
          className="primary"
          disabled={selected.size < 2}
          onClick={() => navigate(`/compare?runs=${[...selected].join(',')}`)}
        >
          Compare selected ({selected.size})
        </button>
      </div>

      {runs.length === 0 ? (
        <p className="empty">No results yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="runs">
            <thead>
              <tr>
                <th aria-label="Select" />
                {header('date', 'startedAt', 'Started', false)}
                <th>Status</th>
                {PARAM_COLS.map((k) => header('param', k, PARAM_LABELS[k], k !== 'model'))}
                {METRIC_COLS.map((m) => header('metric', m.key, m.label))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select run ${r.id}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td><Link to={`/runs/${encodeURIComponent(r.id)}`}>{fmtDate(r.startedAt)}</Link></td>
                  <td>{r.status === 'running' ? <ProgressMini run={r} /> : <Status run={r} />}</td>
                  {PARAM_COLS.map((k) => (
                    <td key={k} className={k !== 'model' ? 'num' : ''}>{r.params[k] ?? '—'}</td>
                  ))}
                  {METRIC_COLS.map((m) => (
                    <td key={m.key} className="num">{m.format(r.summary[m.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
