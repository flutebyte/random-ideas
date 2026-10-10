import Chart from './Chart.jsx'

const TYPE_LABEL = {
  correlation: 'Relationship',
  trend: 'Trend over time',
  outliers: 'Unusual values',
  imbalance: 'Balance',
  distribution: 'Typical values',
  group_compare: 'Group comparison',
}

const label = (k) => k.replace(/_/g, ' ')
const show = (v) => {
  if (v === null || v === undefined) return '–'
  if (Array.isArray(v)) return v.map(show).join(', ')
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${label(k)}: ${show(x)}`).join(' · ')
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumSignificantDigits: 6 })
  return String(v)
}

export default function FindingCard({ index, plan, finding, explanation, skippedReason }) {
  const meanings = Object.entries(finding?.labels || plan.labels || {})
  return (
    <article className={`card finding ${finding ? 'ready' : ''}`}>
      <div className="f-head">
        <span className="f-num">{index}</span>
        <div>
          <span className="f-type">{TYPE_LABEL[plan.type] || plan.type}</span>
          <h3>{plan.title}</h3>
          {plan.why && <p className="why">{plan.why}</p>}
          {meanings.length > 0 && (
            <p className="meanings">
              {meanings.map(([col, meaning]) => <span key={col}><code>{col}</code> = {meaning}</span>)}
            </p>
          )}
        </div>
      </div>

      {skippedReason ? (
        <p className="note">Skipped: {skippedReason}</p>
      ) : !finding ? (
        <div className="skeleton" aria-label="Checking"><span /><span /><span /></div>
      ) : (
        <>
          <Chart chart={finding.chart} />
          {explanation ? (
            <div className="explain fade">
              <p className="headline">{explanation.headline}</p>
              <p>{explanation.explanation}</p>
              <p className="sowhat"><strong>What to do with this:</strong> {explanation.so_what}</p>
              {explanation.caveat && <p className="caveat">Keep in mind: {explanation.caveat}</p>}
              {explanation.source === 'template' && <p className="src">Built-in summary (AI not used)</p>}
            </div>
          ) : (
            <p className="writing"><span className="pulse small" aria-hidden="true" /> Writing this up in plain English…</p>
          )}
          <details className="calc">
            <summary>How this was calculated</summary>
            <table>
              <tbody>
                {Object.entries(finding.stats).map(([k, v]) => (
                  <tr key={k}><th>{label(k)}</th><td>{show(v)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </article>
  )
}
