// Builds a standalone Markdown report from the finished analysis (client-side; nothing is uploaded).
export function buildReport(state) {
  const p = state.profile
  const lines = [`# DataLens report: ${state.fileName}`, '', `${p.row_count.toLocaleString()} rows, ${p.column_count} columns.`, '']
  state.plan.forEach((item, i) => {
    const e = state.explanations[item.id]
    if (!state.findings[item.id]) return
    lines.push(`## ${i + 1}. ${item.title}`, '')
    if (e) {
      lines.push(`**${e.headline}**`, '', e.explanation, '', `What to do with this: ${e.so_what}`)
      if (e.caveat) lines.push('', `Keep in mind: ${e.caveat}`)
      if (e.verified) lines.push('', `_${e.verified.checked} figures checked against the calculation._`)
      lines.push('')
    }
  })
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
