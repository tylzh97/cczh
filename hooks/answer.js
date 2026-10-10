// Feature 2: the main agent's final answer is translated into Chinese via DeepSeek and appended to the end of the answer block; display only, never enters the model context
import { splitCode, toTemplate, needsChinese } from './lib/template.js'
import { buildRequest, parseResponse } from './lib/deepseek.js'

// Translations persist in $.store (the plugin's own JSON file, outside the transcript and model context), surviving restarts, hot reloads and --resume
// Stored as [[hash, translation], ...], oldest first; the whole store is capped at 4 MiB, so only the most recent KEEP entries are kept
const STORE_KEY = 'translations'
const KEEP = 100

// In-memory cache: sha256(answer) → translation; loaded from $.store on first use, holding the Promise to avoid concurrent duplicate loads
let loading
// prompts/to-chinese.md, read on first use; reload the plugin after editing the .md
let system

// `$` can only be passed to functions in this file, so the IO lives here (prompt.js has an identical copy)
async function translate($, text) {
  const key = await $.env.get('DEEPSEEK_API_KEY')
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set')
  system ??= await $.fs.read(`${$.plugin.root}/prompts/to-chinese.md`)
  const [url, init] = buildRequest(system, text, key)
  return parseResponse(await $.http.fetch(url, init))
}

async function load($) {
  loading ??= $.store.get(STORE_KEY).then((v) => new Map(v ?? []))
  return loading
}

// Key by hash instead of storing the answer text, halving the space used
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function remember($, answer, chinese) {
  const cache = await load($)
  const key = await sha256(answer)
  // Delete then insert so a repeated answer moves to the newest position
  cache.delete(key)
  cache.set(key, chinese)
  while (cache.size > KEEP) cache.delete(cache.keys().next().value)
  await $.store.set(STORE_KEY, [...cache])
}

async function recall($, answer) {
  return (await load($)).get(await sha256(answer))
}

export function registerAnswer(on) {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // Only handle normal answers from the main loop; skip subagents, interrupts, errors and refusals
    if (e.agentId !== undefined || e.reason !== 'answer' || !e.answer) return r

    // Code blocks aren't sent to DeepSeek; the translation keeps [CODE n] since the original code is right above
    const { template } = toTemplate(splitCode(e.answer), 'code')
    if (!needsChinese(template)) return r
    $.ui.status('Translating answer…')
    try {
      const chinese = await translate($, template)
      // Already Chinese: don't append, don't store
      if (chinese !== null) await remember($, e.answer, chinese)
    } catch (err) {
      $.ui.log(`Answer translation failed: ${err.message}`)
    } finally {
      $.ui.status(undefined)
      // Redraw the answer block so ui.render appends the translation; if the store write failed it's still in memory
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // Only append the translation to the block matching e.answer: text blocks before tool calls and subagent output don't match and render unchanged
  // Not using turn.complete's { text } return (renders as one line, garbles newlines) nor ui.log (prefixes every line, no markdown rendering)
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const chinese = await recall($, e.props.text)
    if (!chinese) return next(e)
    return next({ ...e, props: { ...e.props, text: `${e.props.text}\n\n---\n\n${chinese}` } })
  })
}
