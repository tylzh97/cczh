// Feature 1: text the user types is translated into English via DeepSeek before it reaches Claude; pasted content is kept as-is and never sent to DeepSeek
import { installTracker, takeParts } from './lib/tracker.js'
import { toTemplate, needsEnglish, fill } from './lib/template.js'
import { buildRequest, parseResponse } from './lib/deepseek.js'

// prompts/to-english.md, read on first use; reload the plugin after editing the .md
let system

// `$` can only be passed to functions in this file, so the IO lives here (answer.js has an identical copy)
async function translate($, text) {
  const key = await $.env.get('DEEPSEEK_API_KEY')
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set')
  system ??= await $.fs.read(`${$.plugin.root}/prompts/to-english.md`)
  const [url, init] = buildRequest(system, text, key)
  return parseResponse(await $.http.fetch(url, init))
}

export function registerPrompt(on) {
  installTracker(on)

  on('prompt.submit', async ($, e, next) => {
    // Only translate prompts typed in the terminal; subagents, notifications, peer messages etc. don't come from the composer and pass through unchanged
    if (e.origin.kind !== 'composer') return next(e)
    const { template, hidden } = toTemplate(takeParts(e), 'paste')
    if (!needsEnglish(template)) return next(e)

    // On failure send the original text rather than swallowing the user's prompt
    let text = e.text
    try {
      const english = await translate($, template)
      // Already English: send as-is, without echoing the review lines
      if (english === null) return next(e)
      text = fill(english, hidden, 'paste')
      // Visual feedback: show the pre-translation text (pastes as placeholders) for review; $.ui.log isn't sent to the model and renders a single line, so log line by line
      for (const line of template.split('\n')) $.ui.log(line)
    } catch (err) {
      $.ui.log(`Translation failed, sending original: ${err.message}`)
    }
    return next({ ...e, text })
  })
}
