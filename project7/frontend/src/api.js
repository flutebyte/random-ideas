export async function getHealth() {
  try {
    const r = await fetch('/api/health')
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

/** Streams the file to the server as a raw body; XHR gives us upload progress. */
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/upload?filename=${encodeURIComponent(file.name)}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(new Error('The upload was interrupted. Please check your connection and try again.'))
    xhr.onload = () => {
      let body = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body.detail || `Upload failed (${xhr.status}).`))
    }
    xhr.send(file)
  })
}

export async function getPreview(datasetId) {
  const r = await fetch(`/api/preview/${datasetId}`)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.detail || 'We could not read that file.')
  return body
}

export async function saveNotes(datasetId, notes) {
  const r = await fetch(`/api/notes/${datasetId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notes),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not save your column descriptions.')
  }
}

/** Opens the SSE stream. Returns a function that closes it. */
export function streamAnalysis(datasetId, { samples }, onEvent, onFail) {
  const es = new EventSource(`/api/analyze/${datasetId}?consent=1&samples=${samples ? 1 : 0}`)
  let finished = false
  es.onmessage = (m) => {
    const evt = JSON.parse(m.data)
    if (evt.event === 'done' || evt.event === 'error') {
      finished = true
      es.close()
    }
    onEvent(evt)
  }
  es.onerror = () => {
    if (finished) return
    es.close()
    onFail()
  }
  return () => {
    finished = true
    es.close()
  }
}
