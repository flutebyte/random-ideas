export default function ShortVersion({ items, plan }) {
  if (!items.length) return null
  const number = (id) => plan.findIndex((p) => p.id === id) + 1
  return (
    <section className="card short" aria-label="The short version">
      <h2>The short version</h2>
      <p className="why">The strongest results, strongest first. Details and charts are below.</p>
      <ol>
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#finding-${it.id}`}>{it.headline}</a>
            <span className="f-ref"> (check {number(it.id)})</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
