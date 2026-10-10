import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })
const fmt = (v) => (typeof v === 'number' ? compact.format(v) : v)
const full = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumSignificantDigits: 6 }) : v)

const tick = { fill: 'var(--text-secondary)', fontSize: 12 }
const axisLine = { stroke: 'var(--grid)' }
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />

function Tip({ active, payload, rows }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="tip">
      {rows(d).map(([k, v]) => (
        <div key={k}><span>{k}</span><strong>{full(v)}</strong></div>
      ))}
    </div>
  )
}

export default function Chart({ chart }) {
  const { type, x_key, x_label, y_label, note, line, yscale } = chart
  const logScale = yscale === 'log'
  const data = logScale ? chart.data.map((d) => ({ ...d, _h: Math.log10(1 + d.count) })) : chart.data
  const y_key = logScale ? '_h' : chart.y_key
  const logTicks = logScale ? [0, 1, 2, 3, 4, 5, 6, 7].filter((t) => t <= Math.ceil(Math.max(...data.map((d) => d._h)))) : undefined
  let body

  if (type === 'bar') {
    body = (
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30 + 30)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" tick={tick} tickFormatter={fmt} axisLine={axisLine} tickLine={false} />
          <YAxis type="category" dataKey={x_key} width={110} tick={tick} axisLine={axisLine} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: 'var(--hover)' }} content={<Tip rows={(d) => [[d.label, d[y_key]], ...(d.pct != null ? [['Share', `${d.pct}%`]] : []), ...(d.rows != null ? [['Rows', d.rows]] : [])]} />} />
          <Bar dataKey={y_key} fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    )
  } else if (type === 'histogram') {
    body = (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }} barCategoryGap={1}>
          {grid}
          <XAxis dataKey="x0" tick={tick} tickFormatter={fmt} axisLine={axisLine} tickLine={false} interval={Math.max(0, Math.ceil(data.length / 6) - 1)} />
          <YAxis tick={tick} tickFormatter={logScale ? (t) => fmt(Math.round(10 ** t) - 1) : fmt} ticks={logTicks} domain={logScale ? [0, logTicks[logTicks.length - 1]] : undefined} axisLine={false} tickLine={false} width={44} />
          <Tooltip cursor={{ fill: 'var(--hover)' }} content={<Tip rows={(d) => [['Range', d.range], ['Rows', d.count], ...(d.outlier ? [['Flag', 'Unusual']] : [])]} />} />
          <Bar dataKey={y_key} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d.outlier ? 'var(--highlight)' : 'var(--series-1)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  } else if (type === 'line') {
    body = (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
          {grid}
          <XAxis dataKey={x_key} tick={tick} axisLine={axisLine} tickLine={false} minTickGap={48} />
          <YAxis tick={tick} tickFormatter={fmt} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
          <Tooltip content={<Tip rows={(d) => [[d[x_key], d[y_key]]]} />} />
          <Line dataKey={y_key} type="monotone" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    )
  } else if (type === 'scatter') {
    body = (
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
          {grid}
          <XAxis type="number" dataKey="x" tick={tick} tickFormatter={fmt} axisLine={axisLine} tickLine={false} domain={['auto', 'auto']} />
          <YAxis type="number" dataKey="y" tick={tick} tickFormatter={fmt} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<Tip rows={(d) => [[x_label, d.x], [y_label, d.y]]} />} />
          <Scatter data={data} fill="var(--series-1)" fillOpacity={0.45} isAnimationActive={false} />
          {line && <Line data={line} dataKey="y" stroke="var(--highlight)" strokeWidth={2} dot={false} legendType="none" isAnimationActive={false} activeDot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  return (
    <figure className="chart">
      {body}
      <figcaption>
        {type === 'bar' && !x_label ? null : (
          <span>
            {type === 'scatter' ? `Horizontal: ${x_label} · Vertical: ${y_label}` : type === 'line' ? `${y_label} by ${x_label}` : `${y_label} · ${x_label}`}
          </span>
        )}
        {note && <span>{note}</span>}
      </figcaption>
    </figure>
  )
}
