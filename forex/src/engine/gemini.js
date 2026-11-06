// gemini.js — OPTIONAL LLM second-opinion layer (the Perceptrader idea).
// Off by default. When the user pastes a free Gemini API key in settings, the
// math signal summary is sent to Gemini for a context/sanity check. It can only
// CONFIRM, WARN, or (mildly) VETO — it never invents a trade on its own.

const MODEL = 'gemini-2.5-flash'; // free-tier friendly, fast
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function geminiFilter(apiKey, symbol, signal) {
  if (!apiKey) return null;

  const summary = [
    `Pair: ${symbol}`,
    `Math signal: ${signal.action} (score ${signal.score}, confidence ${signal.confidence}%)`,
    `Higher timeframe: ${signal.higherTF ? signal.higherTF.action : 'n/a'} (${signal.alignment || 'n/a'})`,
    ...signal.reasons.map(r => `- ${r.name}: ${r.vote} — ${r.detail}`)
  ].join('\n');

  const prompt =
`You are a risk-focused forex trading assistant. A technical-confluence engine produced this signal:

${summary}

Give a SECOND OPINION as strict JSON only (no markdown), shape:
{"verdict":"CONFIRM|WARN|VETO","note":"<=18 words","risk":"low|medium|high"}

Rules:
- CONFIRM only if the technical picture is coherent and no obvious red flag.
- WARN if it looks like a chop/range, weak agreement, or stretched into a level.
- VETO only for a clear contradiction (e.g. buying into strong opposing higher-timeframe trend).
- Never suggest martingale, averaging down, or increasing size after losses.`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 120 }
      })
    });
    if (!res.ok) return { verdict: 'ERROR', note: 'Gemini HTTP ' + res.status, risk: 'unknown' };
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { verdict: 'ERROR', note: 'no JSON from model', risk: 'unknown' };
    const parsed = JSON.parse(match[0]);
    return {
      verdict: parsed.verdict || 'WARN',
      note: parsed.note || '',
      risk: parsed.risk || 'medium'
    };
  } catch (e) {
    return { verdict: 'ERROR', note: String(e.message || e).slice(0, 60), risk: 'unknown' };
  }
}

// Apply the LLM verdict to the math signal (non-destructive metadata + a small
// confidence nudge). VETO downgrades a directional call to NEUTRAL.
export function applyLlm(signal, llm) {
  if (!llm) return signal;
  const out = { ...signal, llm };
  if (llm.verdict === 'VETO' && signal.action !== 'NEUTRAL') {
    out.action = 'NEUTRAL';
    out.confidence = Math.round(signal.confidence * 0.4);
    out.llmVetoed = true;
  } else if (llm.verdict === 'WARN') {
    out.confidence = Math.round(signal.confidence * 0.8);
  } else if (llm.verdict === 'CONFIRM') {
    out.confidence = Math.min(100, Math.round(signal.confidence * 1.1));
  }
  return out;
}
