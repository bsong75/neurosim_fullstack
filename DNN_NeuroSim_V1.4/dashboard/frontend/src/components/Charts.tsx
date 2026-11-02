import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis, type TooltipProps,
} from 'recharts'
import type { Layer, Run } from '../api'
import { PARTS, useTheme, type Theme } from '../theme'
import { trim } from '../format'

const BAR_MAX = 24
const RADIUS: [number, number, number, number] = [4, 4, 0, 0]

const axisProps = (t: Theme) => ({
  stroke: t.axis,
  tick: { fill: t.muted, fontSize: 12 },
  tickLine: false,
})

function Box({ children }: { children: React.ReactNode }) {
  return <div className="tooltip">{children}</div>
}

// ---- Per-layer stacked breakdown (latency or energy) ----

type StackProps = {
  layers: Layer[]
  kind: 'latency_ns' | 'energy_pJ'
  unit: string
  toUnit: (v: number) => number
  format: (v?: number) => string
}

export function LayerBreakdownChart({ layers, kind, unit, toUnit, format }: StackProps) {
  const t = useTheme()
  const rows = layers.map((l) => {
    const row: Record<string, number | string> = { name: `L${l.layer}` }
    for (const p of PARTS) row[p.key] = toUnit(l.breakdown?.[p.key]?.[kind] ?? 0)
    return row
  })

  const tip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null
    const layer = layers.find((l) => `L${l.layer}` === label)
    const total = PARTS.reduce((s, p) => s + (layer?.breakdown?.[p.key]?.[kind] ?? 0), 0)
    return (
      <Box>
        <strong>Layer {layer?.layer}</strong> · {format(total)}
        {[...PARTS].reverse().map((p) => (
          <div key={p.key} className="tip-row">
            <span className="swatch" style={{ background: t.series[PARTS.indexOf(p)] }} />
            {p.label}<span className="tip-val">{format(layer?.breakdown?.[p.key]?.[kind])}</span>
          </div>
        ))}
      </Box>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="name" {...axisProps(t)} />
        <YAxis {...axisProps(t)} axisLine={false} tickFormatter={trim}
          label={{ value: unit, angle: -90, position: 'insideLeft', fill: t.muted, fontSize: 12 }} />
        <Tooltip content={tip} cursor={{ fill: t.grid, opacity: 0.5 }} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: t.textSecondary }}>{value}</span>} />
        {PARTS.map((p, i) => (
          <Bar key={p.key} dataKey={p.key} name={p.label} stackId="s" fill={t.series[i]}
            maxBarSize={BAR_MAX} stroke={t.surface} strokeWidth={2}
            radius={i === PARTS.length - 1 ? RADIUS : undefined} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---- Single-series bars (area components, per-layer metric) ----

type SimpleBarProps = {
  rows: { name: string; value: number; display: string }[]
  unit: string
  layout?: 'horizontal' | 'vertical'
}

export function SimpleBarChart({ rows, unit, layout = 'horizontal' }: SimpleBarProps) {
  const t = useTheme()
  const vertical = layout === 'vertical'
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null
    const row = payload[0].payload as SimpleBarProps['rows'][number]
    return <Box><strong>{row.name}</strong> · {row.display}</Box>
  }
  return (
    <ResponsiveContainer width="100%" height={vertical ? 40 * rows.length + 40 : 260}>
      <BarChart data={rows} layout={layout} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={vertical} horizontal={!vertical} stroke={t.grid} />
        {vertical ? (
          <>
            <XAxis type="number" {...axisProps(t)} tickFormatter={trim}
              label={{ value: unit, position: 'insideBottomRight', offset: -2, fill: t.muted, fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={150} {...axisProps(t)} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" {...axisProps(t)} />
            <YAxis {...axisProps(t)} axisLine={false} tickFormatter={trim}
              label={{ value: unit, angle: -90, position: 'insideLeft', fill: t.muted, fontSize: 12 }} />
          </>
        )}
        <Tooltip content={tip} cursor={{ fill: t.grid, opacity: 0.5 }} />
        <Bar dataKey="value" fill={t.sequential} maxBarSize={BAR_MAX}
          radius={vertical ? [0, 4, 4, 0] : RADIUS} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---- Compare: one setting (x) vs one result (y), one dot per run ----

type ScatterProps = {
  points: { x: number; y: number; run: Run; label: string; display: string }[]
  xLabel: string
  yLabel: string
  onSelect?: (run: Run) => void
}

export function CompareScatter({ points, xLabel, yLabel, onSelect }: ScatterProps) {
  const t = useTheme()
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as ScatterProps['points'][number]
    return (
      <Box>
        <strong>{p.label}</strong>
        <div className="tip-row">{xLabel}<span className="tip-val">{p.x}</span></div>
        <div className="tip-row">{yLabel}<span className="tip-val">{p.display}</span></div>
      </Box>
    )
  }
  // Settings take a few discrete values: tick exactly those, and pad both axes so dots clear the edges
  const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b)
  const pad = (lo: number, hi: number) => (hi - lo || Math.abs(hi) || 1) * 0.08
  const xPad = pad(xs[0] ?? 0, xs[xs.length - 1] ?? 0)
  const ys = points.map((p) => p.y)
  const yPad = pad(Math.min(...ys), Math.max(...ys))
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 16 }}>
        <CartesianGrid stroke={t.grid} />
        <XAxis type="number" dataKey="x" name={xLabel} {...axisProps(t)} ticks={xs} tickFormatter={(v: number) => String(+v.toPrecision(4))}
          domain={[(min: number) => min - xPad, (max: number) => max + xPad]}
          label={{ value: xLabel, position: 'insideBottom', offset: -12, fill: t.muted, fontSize: 12 }} />
        <YAxis type="number" dataKey="y" name={yLabel} {...axisProps(t)} axisLine={false}
          domain={[(min: number) => min - yPad, (max: number) => max + yPad]} tickFormatter={trim}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: t.muted, fontSize: 12 }} />
        <ZAxis range={[90, 90]} />
        <Tooltip content={tip} cursor={{ stroke: t.axis }} />
        <Scatter data={points} fill={t.sequential} stroke={t.surface} strokeWidth={2}
          cursor={onSelect ? 'pointer' : undefined}
          onClick={(d) => onSelect?.((d as unknown as ScatterProps['points'][number]).run)}
          isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
