import type { Run } from '../api'

// Status color never stands alone: icon + label always accompany it
const STATUS = {
  complete: { icon: '✓', label: 'Complete' },
  running: { icon: '◷', label: 'Running' },
  failed: { icon: '✕', label: 'Failed' },
} as const

export default function Status({ run }: { run: Run }) {
  const s = STATUS[run.status]
  return (
    <span className={`status status-${run.status}`} title={run.stage}>
      <span aria-hidden>{s.icon}</span> {s.label}
      {run.status === 'running' && <span className="stage"> · {run.stage}</span>}
    </span>
  )
}
