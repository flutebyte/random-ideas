export const STAGES = [
  ['loading', 'Reading file'],
  ['profiling', 'Profiling'],
  ['planning', 'Choosing checks'],
  ['analyzing', 'Analyzing'],
  ['explaining', 'Explaining'],
]

export const initialState = {
  phase: 'idle', // idle | uploading | review | analyzing | done | error
  datasetId: null,
  preview: null,
  samples: false,
  fileName: '',
  uploadPct: 0,
  stage: null,
  message: '',
  mode: null, // ai | demo | fallback
  profile: null,
  plan: [],
  findings: {},
  explanations: {},
  skipped: {},
  canAsk: false,
  answers: [],
  error: null,
}

export function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialState
    case 'upload_start':
      return { ...initialState, phase: 'uploading', fileName: action.fileName }
    case 'upload_done':
      return { ...state, phase: 'review', datasetId: action.datasetId, preview: action.preview, samples: action.samples }
    case 'upload_progress':
      return { ...state, uploadPct: action.pct }
    case 'analysis_start':
      return { ...state, phase: 'analyzing', stage: 'loading', message: 'Starting...' }
    case 'answer':
      return { ...state, answers: [...state.answers, action.answer] }
    case 'fail':
      return { ...state, phase: 'error', error: action.message }
    case 'event':
      return applyEvent(state, action.event)
    default:
      return state
  }
}

function applyEvent(state, e) {
  switch (e.event) {
    case 'status':
      return { ...state, stage: e.stage === 'queued' ? state.stage : e.stage, message: e.message, mode: e.mode ?? state.mode }
    case 'profile':
      return { ...state, profile: e }
    case 'plan':
      return { ...state, plan: e.findings, mode: e.mode }
    case 'finding':
      return { ...state, findings: { ...state.findings, [e.id]: e } }
    case 'explanation':
      return { ...state, explanations: { ...state.explanations, [e.id]: e } }
    case 'finding_skipped':
      return { ...state, skipped: { ...state.skipped, [e.id]: e.reason } }
    case 'done':
      return { ...state, phase: 'done', stage: null, message: '', canAsk: !!e.can_ask }
    case 'error':
      return { ...state, phase: 'error', error: e.message }
    default:
      return state
  }
}
