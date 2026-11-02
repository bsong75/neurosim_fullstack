import { useEffect, useState } from 'react'
import type { Run, Stage } from '../api'

// Ticks once a second so elapsed times move between server polls
function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export const fmtDuration = (sec?: number | null) => {
  if (sec == null || !isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${String(r).padStart(2, '0')}s`
  return `${r}s`
}

const ICON: Record<Stage['state'], string> = {
  done: '✓', active: '◷', pending: '○', unknown: '?', failed: '✕',
}

const fraction = (s: Stage) =>
  s.done != null && s.total ? Math.min(1, s.done / s.total) : null

function stageDetail(s: Stage, now: number) {
  const parts: string[] = []
  if (s.done != null && s.total != null) {
    parts.push(s.unit === '%' ? `${s.done}%` : `${s.done} / ${s.total} ${s.unit ?? ''}`.trim())
  }
  if (s.startedAt != null && s.state !== 'pending') {
    parts.push(fmtDuration((s.endedAt ?? now) - s.startedAt))
  }
  if (s.state === 'active' && s.etaSeconds != null) parts.push(`~${fmtDuration(s.etaSeconds)} left`)
  if (s.state === 'unknown') parts.push('not visible yet')
  return parts.join(' · ')
}

// Full tracker for the run detail page
export function ProgressTracker({ run }: { run: Run }) {
  const now = useNow()
  const p = run.progress
  const start = p.startedAt ?? run.startedAt
  const end = p.endedAt ?? (run.status === 'running' ? now : run.modifiedAt)
  const active = p.stages.find((s) => s.state === 'active')
  const remaining = run.status === 'running' ? totalRemaining(run) : null

  return (
    <div className="card progress-card">
      <div className="progress-head">
        <h3>{run.status === 'running' ? 'Progress' : run.status === 'failed' ? 'Stopped' : 'Finished'}</h3>
        <span className="muted small">
          {run.status === 'running' ? 'Running for ' : 'Took '}{fmtDuration(end - start)}
          {remaining != null && <> · about {fmtDuration(remaining)} left in this step</>}
        </span>
      </div>

      <ol className="steps">
        {p.stages.map((s, idx) => {
          const f = fraction(s)
          return (
            <li key={s.key} className={`step step-${s.state}`} aria-current={s.state === 'active' ? 'step' : undefined}>
              <div className="step-top">
                <span className="step-icon" aria-hidden>{ICON[s.state]}</span>
                <span className="step-label">{idx + 1}. {s.label}</span>
              </div>
              <div
                className={`bar ${s.state === 'active' && f == null ? 'bar-indeterminate' : ''}`}
                role="progressbar"
                aria-label={s.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={s.state === 'done' ? 100 : f != null ? Math.round(f * 100) : undefined}
              >
                <div className="bar-fill" style={{ width: s.state === 'done' ? '100%' : f != null ? `${f * 100}%` : undefined }} />
              </div>
              <div className="step-detail">{stageDetail(s, now) || (s.state === 'pending' ? 'waiting' : '')}</div>
            </li>
          )
        })}
      </ol>

      {!p.live && run.status === 'running' && (
        <p className="muted small note">
          This run started before progress tracking was added, and its output appears only when it
          finishes, so the current step can't be seen. Runs started from now on show live progress.
        </p>
      )}
      {active?.key === 'inference' && (
        <p className="muted small note">
          The accuracy test runs all 10,000 test images through the simulated chip, 200 at a time.
        </p>
      )}
    </div>
  )
}

function totalRemaining(run: Run) {
  const s = run.progress.stages.find((x) => x.state === 'active')
  return s?.etaSeconds ?? null
}

// Compact version for the runs table
export function ProgressMini({ run }: { run: Run }) {
  const s = run.progress.stages.find((x) => x.state === 'active')
  const idx = s ? run.progress.stages.indexOf(s) + 1 : null
  const f = s ? fraction(s) : null
  return (
    <div className="mini">
      <div className={`bar ${f == null ? 'bar-indeterminate' : ''}`} role="progressbar"
        aria-label="Run progress" aria-valuenow={f != null ? Math.round(f * 100) : undefined}>
        <div className="bar-fill" style={{ width: f != null ? `${f * 100}%` : undefined }} />
      </div>
      <span className="mini-label">
        {s ? `Step ${idx}/4 · ${s.label}${f != null ? ` ${Math.round(f * 100)}%` : ''}` : 'Step unknown'}
        {s?.etaSeconds != null && ` · ~${fmtDuration(s.etaSeconds)}`}
      </span>
    </div>
  )
}
