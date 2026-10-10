import { useMemo, useState } from 'react'

function Row({ col, value, onChange }) {
  return (
    <div className="col-row">
      <code>{col.name}</code>
      <div className="examples" aria-label={`Example values of ${col.name}`}>
        {col.examples.length ? col.examples.map((e) => <span key={e} title={e}>{e}</span>) : <span>(empty)</span>}
      </div>
      <input
        type="text"
        value={value || ''}
        maxLength={120}
        placeholder="What is this? e.g. Employee age"
        aria-label={`What does ${col.name} mean?`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export default function ColumnReview({ preview, fileName, ai, onConfirm, onCancel }) {
  const [context, setContext] = useState('')
  const [labels, setLabels] = useState({})
  const { unclear, clear } = useMemo(() => ({
    unclear: preview.columns.filter((c) => c.cryptic),
    clear: preview.columns.filter((c) => !c.cryptic),
  }), [preview])

  const set = (name) => (v) => setLabels((l) => ({ ...l, [name]: v }))
  const filled = Object.values(labels).filter((v) => v.trim()).length

  return (
    <section className="card review">
      <h2>Check your columns</h2>
      <p className="lede">
        <strong>{fileName}</strong> has {preview.columns.length} columns. Column names like <code>a</code> or{' '}
        <code>col_3</code> are hard to read, so tell us what they mean and the results will make sense.
        Everything on this page is optional{ai ? ', and what you type is shared with Claude like the rest of the summary' : ''}.
      </p>

      <label className="field">
        What is this file about?
        <textarea
          value={context}
          maxLength={600}
          onChange={(e) => setContext(e.target.value)}
          placeholder='e.g. "Employee records for our yearly HR review: pay, overtime, and who left"'
        />
      </label>

      {unclear.length > 0 ? (
        <>
          <h3>
            Unclear names <span className="tag">{unclear.length}</span>
          </h3>
          <p className="note">Look at the example values to work out what each one is. If you're unsure, leave it blank and the AI will make a careful guess.</p>
          <div className="col-list">
            {unclear.map((c) => <Row key={c.name} col={c} value={labels[c.name]} onChange={set(c.name)} />)}
          </div>
        </>
      ) : (
        <p className="note">All column names look readable. You can still add meanings below.</p>
      )}

      {clear.length > 0 && (
        <details open={unclear.length === 0 && clear.length <= 8}>
          <summary>{unclear.length ? `Other columns (${clear.length})` : `Columns (${clear.length})`}</summary>
          <div className="col-list">
            {clear.map((c) => <Row key={c.name} col={c} value={labels[c.name]} onChange={set(c.name)} />)}
          </div>
        </details>
      )}

      <div className="actions">
        <button className="btn primary" onClick={() => onConfirm({ context, labels })}>
          {filled ? `Start analysis (${filled} described)` : 'Start analysis'}
        </button>
        <button className="link" onClick={onCancel}>Choose a different file</button>
      </div>
    </section>
  )
}
