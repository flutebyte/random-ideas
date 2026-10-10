import { STAGES } from '../state.js'

export default function Progress({ state }) {
  const uploading = state.phase === 'uploading'
  const idx = STAGES.findIndex(([k]) => k === state.stage)
  const pct = Math.round(state.uploadPct * 100)

  return (
    <section className="card progress" aria-live="polite">
      <div className="live">
        <span className="pulse" aria-hidden="true" />
        <span className="live-text">
          {uploading ? (pct >= 100 ? 'Checking your file…' : `Uploading ${state.fileName}… ${pct}%`) : state.message}
        </span>
      </div>
      {uploading ? (
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <ol className="steps">
          {STAGES.map(([key, label], i) => (
            <li key={key} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
              <span className="dot" />
              {label}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
