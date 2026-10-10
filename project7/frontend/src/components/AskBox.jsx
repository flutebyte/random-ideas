import { useState } from 'react'
import { askQuestion } from '../api.js'
import FindingCard from './FindingCard.jsx'

const EXAMPLES = ['Does {num} differ by {cat}?', 'Is {num} related to {num2}?', 'How has {num} changed over time?']

export default function AskBox({ datasetId, profile, answers, onAnswer }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const cols = (kind) => profile.columns.filter((c) => c.kind === kind).map((c) => c.name)
  const [num, num2] = cols('numeric')
  const [cat] = cols('categorical')
  const [date] = cols('datetime')
  const ideas = [
    cat && num && `Does ${num} differ by ${cat}?`,
    num && num2 && `Is ${num} related to ${num2}?`,
    date && num && `How has ${num} changed by ${date}?`,
  ].filter(Boolean)

  const submit = async (text) => {
    const question = text.trim()
    if (question.length < 3 || busy) return
    setBusy(true)
    setNotice('')
    try {
      const out = await askQuestion(datasetId, question)
      if (out.answered) {
        onAnswer(out)
        setQ('')
      } else {
        setNotice(out.reason)
      }
    } catch (err) {
      setNotice(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ask" aria-label="Ask a question">
      <h2>Ask your own question</h2>
      <p className="why">
        Answered the same way as above: computed exactly from your whole file, then checked. Your file is kept for
        15 minutes for this, then deleted.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); submit(q) }} className="ask-form">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} disabled={busy}
               placeholder="e.g. Does salary differ by department?" aria-label="Your question" />
        <button className="btn primary" disabled={busy || q.trim().length < 3}>{busy ? 'Working…' : 'Ask'}</button>
      </form>
      {ideas.length > 0 && (
        <p className="ideas">Try: {ideas.map((i) => <button key={i} type="button" className="link" disabled={busy} onClick={() => submit(i)}>{i}</button>)}</p>
      )}
      {notice && <p className="note" role="status">{notice}</p>}
      {answers.map((a, i) => (
        <FindingCard key={a.plan.id} index={`Q${i + 1}`} plan={a.plan} finding={a.finding} explanation={a.explanation} />
      ))}
    </section>
  )
}
