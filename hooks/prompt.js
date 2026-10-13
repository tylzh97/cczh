// Feature 1: text the user types is translated into English via DeepSeek before it reaches Claude; pasted content is kept as-is and never sent to DeepSeek
import { installTracker, takeParts } from './lib/tracker.js'
import { toTemplate, fill } from './lib/template.js'
import { needsEnglish } from './lib/lang.js'
import { buildRequest, parseResponse } from './lib/deepseek.js'
import { settings } from './lib/settings.js'
import { fromJSON, toJSON, lookup, insert } from './lib/cache.js'

// prompts/to-english.md, read on first use; reload the plugin after editing the .md
let system

// Translations of repeated prompts are served from an LFU cache in $.store instead of asking DeepSeek again (see lib/cache.js)
const CACHE_KEY = 'promptCache'
const CACHE_LIMIT = 200

// Loaded from $.store on first use, holding the Promise to avoid concurrent duplicate loads
let loading

// `$` can only be passed to functions in this file, so the IO lives here (answer.js has an identical copy)
async function translate($, text) {
  // userConfig first, then the environment (settings.json env included)
  const key = settings.apiKey || (await $.env.get('DEEPSEEK_API_KEY'))
  if (!key) throw new Error('no DeepSeek API key: set pluginConfigs.cczh.options.deepseek_api_key or DEEPSEEK_API_KEY')
  system ??= await $.fs.read(`${$.plugin.root}/prompts/to-english.md`)
  const [url, init] = buildRequest(system, text, key)
  return parseResponse(await $.http.fetch(url, init))
}

async function loadCache($) {
  // On failure forget the rejected Promise so the next call retries instead of failing forever
  loading ??= $.store.get(CACHE_KEY).then(fromJSON, (err) => {
    loading = undefined
    throw err
  })
  return loading
}

async function saveCache($, cache) {
  // A failed write only costs a DeepSeek call later; the in-memory cache still serves this session
  try {
    await $.store.set(CACHE_KEY, toJSON(cache))
  } catch (err) {
    $.ui.log(`Saving translation cache failed: ${err.message}`)
  }
}

export function registerPrompt(on) {
  installTracker(on)

  on('prompt.submit', async ($, e, next) => {
    // Only translate prompts typed in the terminal; subagents, notifications, peer messages etc. don't come from the composer and pass through unchanged
    if (e.origin.kind !== 'composer') return next(e)
    // Take the parts even when off, so this prompt's segments don't leak into the next one after /cczh on
    const parts = takeParts(e)
    if (!settings.enabled) return next(e)
    const { template, hidden } = toTemplate(parts, 'paste')
    if (!needsEnglish(template)) return next(e)

    // On failure send the original text rather than swallowing the user's prompt
    let text = e.text
    try {
      // An unreadable store just means no cache this time; loadCache retries on the next prompt
      const cache = await loadCache($).catch(() => undefined)
      const hit = cache && lookup(cache, template)
      const english = hit ? hit.value : await translate($, template)
      if (english !== null) text = fill(english, hidden, 'paste')
      // Stored only after fill succeeded, so a bad translation (placeholder mismatch) is never cached
      if (cache) {
        if (!hit) insert(cache, template, english, CACHE_LIMIT)
        await saveCache($, cache)
      }
      // Already English: send as-is, without echoing the review lines
      if (english === null) return next(e)
      // Visual feedback: show the pre-translation text (pastes as placeholders) for review; $.ui.log isn't sent to the model and renders a single line, so log line by line
      for (const line of template.split('\n')) $.ui.log(line)
      // Served from the cache, no DeepSeek call this time
      if (hit) $.ui.log('(cached)')
    } catch (err) {
      $.ui.log(`Translation failed, sending original: ${err.message}`)
    }
    return next({ ...e, text })
  })
}
