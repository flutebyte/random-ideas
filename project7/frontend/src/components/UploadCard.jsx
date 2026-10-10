import { useRef, useState } from 'react'

const fmtSize = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`)

export default function UploadCard({ health, onStart }) {
  const [file, setFile] = useState(null)
  const [consent, setConsent] = useState(false)
  const [samples, setSamples] = useState(false)
  const [drag, setDrag] = useState(false)
  const [problem, setProblem] = useState('')
  const input = useRef(null)
  const limitMb = health?.max_upload_mb ?? 1024
  const ai = health?.ai !== false

  const pick = (f) => {
    setProblem('')
    if (!f) return
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) return setProblem('Please choose a .csv file.')
    if (f.size > limitMb * 1024 * 1024) return setProblem(`That file is ${fmtSize(f.size)}. The limit is ${limitMb} MB.`)
    if (f.size === 0) return setProblem('That file is empty.')
    setFile(f)
  }

  return (
    <section className="card upload">
      <h1>Drop in a spreadsheet. Get plain-English answers.</h1>
      <p className="lede">
        Upload a CSV and we'll work out what's worth looking at, run the numbers, and explain what they mean, no
        data skills needed.
      </p>

      <div
        className={`drop ${drag ? 'drag' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => pick(e.target.files[0])} />
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span>{fmtSize(file.size)} · click to choose a different file</span>
          </>
        ) : (
          <>
            <strong>Choose a CSV file or drag it here</strong>
            <span>Up to {limitMb >= 1024 ? `${limitMb / 1024} GB` : `${limitMb} MB`}</span>
          </>
        )}
      </div>
      {problem && <p className="problem" role="alert">{problem}</p>}

      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {ai
            ? 'I agree that summary statistics from my file (column names, counts, ranges, common values) are sent to Anthropic’s Claude to produce this analysis, and that I’m allowed to share this data.'
            : 'I’m allowed to analyze this data. In demo mode nothing leaves this server.'}
        </span>
      </label>

      {ai && (
        <label className="check">
          <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />
          <span>
            Also share 5 example rows (numbers, dates and categories only) for better suggestions.
            <em> Optional. Off by default. ID and free-text columns are never included.</em>
          </span>
        </label>
      )}

      <details className="fine">
        <summary>What happens to my file?</summary>
        <ul>
          <li>The file is processed on this server and deleted as soon as the analysis finishes.</li>
          <li>Your raw rows are never stored, and never sent to the AI (except the optional 5 examples).</li>
          <li>All calculations are done by code, so numbers are exact.</li>
        </ul>
      </details>

      <button className="btn primary" disabled={!file || !consent} onClick={() => onStart(file, { samples })}>
        Analyze my data
      </button>
    </section>
  )
}
