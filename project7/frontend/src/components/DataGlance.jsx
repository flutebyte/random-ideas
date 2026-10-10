const KIND_LABEL = {
  numeric: 'number',
  categorical: 'category',
  datetime: 'date',
  id: 'ID',
  text: 'text',
  constant: 'constant',
  empty: 'empty',
  other: 'other',
}

export default function DataGlance({ profile, fileName }) {
  const counts = profile.columns.reduce((a, c) => ({ ...a, [c.kind]: (a[c.kind] || 0) + 1 }), {})
  const worstMissing = profile.columns.filter((c) => c.null_pct >= 20)

  return (
    <section className="card glance">
      <h2>Your data at a glance</h2>
      <p className="sub">{fileName}</p>
      <dl className="facts">
        <div><dt>Rows</dt><dd>{profile.row_count.toLocaleString()}</dd></div>
        <div><dt>Columns</dt><dd>{profile.column_count}</dd></div>
        <div><dt>Numbers</dt><dd>{counts.numeric || 0}</dd></div>
        <div><dt>Categories</dt><dd>{counts.categorical || 0}</dd></div>
        <div><dt>Dates</dt><dd>{counts.datetime || 0}</dd></div>
      </dl>
      {profile.warnings.map((w) => <p key={w} className="note warn">{w}</p>)}
      {worstMissing.length > 0 && (
        <p className="note warn">
          {worstMissing.length === 1 ? 'One column has' : `${worstMissing.length} columns have`} lots of missing
          values: {worstMissing.slice(0, 4).map((c) => `${c.name} (${c.null_pct}%)`).join(', ')}
          {worstMissing.length > 4 ? '…' : ''}
        </p>
      )}
      <details>
        <summary>Show all columns</summary>
        <div className="chips">
          {profile.columns.map((c) => (
            <span key={c.name} className={`chip k-${c.kind}`} title={`${c.dtype} · ${c.null_pct}% missing · ~${c.distinct.toLocaleString()} distinct`}>
              {c.name}<small>{c.description || KIND_LABEL[c.kind] || c.kind}</small>
            </span>
          ))}
        </div>
      </details>
    </section>
  )
}
