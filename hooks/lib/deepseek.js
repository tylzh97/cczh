// Building and parsing DeepSeek requests: pure functions, IO happens in the entry modules (the loader doesn't allow `$` to be passed across imports)

const API = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-flash'
// When the text is already in the target language DeepSeek replies with just this token instead of echoing it back (see prompts/*.md)
const UNCHANGED = 'LANGUAGE_UNCHANGED'

/**
 * Build a translation request (thinking disabled, ~1 second).
 *
 * @param {string} system System prompt, from prompts/*.md.
 * @param {string} text The template to translate.
 * @param {string} key DeepSeek API key.
 * @returns {[string, import('claude-code').HttpInit]} [url, init], passed straight to $.http.fetch.
 */
export function buildRequest(system, text, key) {
  const init = {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
    }),
  }
  return [API, init]
}

/**
 * Extract the translation from a $.http.fetch response.
 *
 * @param {import('claude-code').HttpResponse} r The $.http.fetch result.
 * @returns {string | null} The translation; null when the text is already in the target language.
 * @throws {Error} HTTP failure or empty response.
 */
export function parseResponse(r) {
  if (!r.ok) throw new Error(`DeepSeek HTTP ${r.status}: ${r.text.slice(0, 200)}`)
  const translated = JSON.parse(r.text).choices?.[0]?.message?.content?.trim()
  if (!translated) throw new Error('DeepSeek returned empty content')
  return translated === UNCHANGED ? null : translated
}
