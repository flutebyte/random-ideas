// Builds a standalone Markdown report from the finished analysis (client-side; nothing is uploaded).
function section(lines, heading, title, e) {
  lines.push(`## ${heading}. ${title}`, '')
  if (!e) return
  lines.push(`**${e.headline}**`, '', e.explanation, '', `What to do with this: ${e.so_what}`)
  if (e.caveat) lines.push('', `Keep in mind: ${e.caveat}`)
  if (e.verified) lines.push('', `_${e.verified.checked} figures checked against the calculation._`)
  lines.push('')
}

export function buildReport(state) {
  const p = state.profile
  const lines = [`# DataLens report: ${state.fileName}`, '', `${p.row_count.toLocaleString()} rows, ${p.column_count} columns.`, '']
  const missing = p.columns.filter((c) => c.null_pct >= 20).map((c) => `${c.name} (${c.null_pct}%)`)
  const notes = [...(p.warnings || []), ...(missing.length ? [`Columns with lots of missing values: ${missing.join(', ')}`] : [])]
  if (notes.length) lines.push('**Data notes**', '', ...notes.map((w) => `- ${w}`), '')
  if (state.summary.length) {
    lines.push('## The short version', '', ...state.summary.map((it, i) => `${i + 1}. ${it.headline}`), '')
  }
  state.plan.forEach((item, i) => {
    if (state.findings[item.id]) section(lines, i + 1, item.title, state.explanations[item.id])
  })
  if (state.answers.length) {
    lines.push('# Your questions', '')
    state.answers.forEach((a, i) => section(lines, `Q${i + 1}`, a.plan.title, a.explanation))
  }
  lines.push('---', 'All numbers were computed by SQL on the full file; the AI only chose the checks and wrote the explanations.')
  return lines.join('\n')
}

export function downloadReport(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'datalens-report.md' })
  a.click()
  URL.revokeObjectURL(url)
}

/** Opens the browser's print dialog (choose "Save as PDF"). Charts are included; calculation tables are expanded. */
export function printReport(fileName) {
  const details = [...document.querySelectorAll('details.calc')]
  const wasOpen = details.map((d) => d.open)
  const oldTitle = document.title
  details.forEach((d) => { d.open = true })
  document.title = `DataLens report - ${fileName}`
  const restore = () => {
    details.forEach((d, i) => { d.open = wasOpen[i] })
    document.title = oldTitle
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}
