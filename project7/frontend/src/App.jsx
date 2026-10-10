import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { endSession, getHealth, getPreview, saveNotes, streamAnalysis, uploadFile } from './api.js'
import { initialState, reducer } from './state.js'
import UploadCard from './components/UploadCard.jsx'
import ColumnReview from './components/ColumnReview.jsx'
import Progress from './components/Progress.jsx'
import DataGlance from './components/DataGlance.jsx'
import FindingCard from './components/FindingCard.jsx'
import AskBox from './components/AskBox.jsx'
import { buildReport, downloadReport } from './report.js'

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [health, setHealth] = useState(null)
  const closeStream = useRef(null)

  useEffect(() => {
    getHealth().then(setHealth)
    return () => closeStream.current?.()
  }, [])

  const start = useCallback(async (file, { samples }) => {
    dispatch({ type: 'upload_start', fileName: file.name })
    try {
      const { dataset_id } = await uploadFile(file, (pct) => dispatch({ type: 'upload_progress', pct }))
      const preview = await getPreview(dataset_id)
      dispatch({ type: 'upload_done', datasetId: dataset_id, preview, samples })
    } catch (err) {
      dispatch({ type: 'fail', message: err.message })
    }
  }, [])

  const confirm = async (notes) => {
    const { datasetId, samples } = state
    dispatch({ type: 'analysis_start' })
    try {
      await saveNotes(datasetId, notes)
      closeStream.current = streamAnalysis(
        datasetId,
        { samples },
        (event) => dispatch({ type: 'event', event }),
        () => dispatch({ type: 'fail', message: 'The connection dropped before the analysis finished. Please upload the file again.' }),
      )
    } catch (err) {
      dispatch({ type: 'fail', message: err.message })
    }
  }

  const reset = () => {
    closeStream.current?.()
    if (state.datasetId) endSession(state.datasetId)
    dispatch({ type: 'reset' })
  }

  const busy = state.phase === 'uploading' || state.phase === 'analyzing'
  const showResults = state.plan.length > 0

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M21 21l7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          DataLens
        </div>
        {(state.phase === 'done' || state.phase === 'error') && (
          <button className="link" onClick={reset}>Analyze another file</button>
        )}
      </header>

      <main>
        {health && !health.ai && (
          <div className="banner" role="note">
            <strong>Demo mode.</strong> No AI key is configured on this server, so a built-in rule-based
            analyst is used instead of Claude. Nothing leaves this server.
          </div>
        )}

        {state.phase === 'idle' && <UploadCard health={health} onStart={start} />}

        {state.phase === 'review' && (
          <ColumnReview preview={state.preview} fileName={state.fileName} ai={health?.ai !== false} onConfirm={confirm} onCancel={reset} />
        )}

        {busy && <Progress state={state} />}

        {state.phase === 'error' && (
          <div className="error" role="alert">
            <strong>We couldn't finish that.</strong>
            <p>{state.error}</p>
            <button className="btn" onClick={reset}>Try again</button>
          </div>
        )}

        {state.profile && <DataGlance profile={state.profile} fileName={state.fileName} />}

        {showResults && (
          <section aria-label="Findings" className="findings">
            <div className="res-head">
              <h2>{state.phase === 'done' ? 'What we found' : 'Checking your data…'}</h2>
              {state.phase === 'done' && (
                <button className="btn secondary" onClick={() => downloadReport(buildReport(state))}>Download report</button>
              )}
            </div>
            {state.plan.map((p, i) => (
              <FindingCard
                key={p.id}
                index={i + 1}
                plan={p}
                finding={state.findings[p.id]}
                explanation={state.explanations[p.id]}
                skippedReason={state.skipped[p.id]}
              />
            ))}
          </section>
        )}

        {state.phase === 'done' && state.canAsk && (
          <AskBox datasetId={state.datasetId} profile={state.profile} answers={state.answers}
                  onAnswer={(answer) => dispatch({ type: 'answer', answer })} />
        )}
      </main>

      <footer>
        Analyses are computed by code, not by AI, so the numbers are exact. The AI only chooses what to check and
        explains the results in plain language.
      </footer>
    </div>
  )
}
