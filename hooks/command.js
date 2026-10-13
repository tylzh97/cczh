// Feature 3: /cczh on|off turns both translations on and off; turning on (or loading while on) pings DeepSeek to confirm it's usable
import { settings } from './lib/settings.js'
import { buildPing, pingProblem } from './lib/deepseek.js'

const COMMAND = 'cczh'
const STORE_KEY = 'enabled'
const PING_TIMEOUT = 5000

// userConfig first, then the environment (settings.json env included), as translate() does
async function apiKey($) {
  return settings.apiKey || (await $.env.get('DEEPSEEK_API_KEY'))
}

// Never cached: every call is a real request. Resolves to the reason DeepSeek can't be used, or undefined
async function ping($, key) {
  const [url, init] = buildPing(key)
  // $.http.fetch can't be aborted, so race it against a timer, and stop the timer once the request settles
  const timer = new AbortController()
  // A rejected sleep must not read as success (undefined); once aborted the race is already settled, so its value is unread
  const timeout = $.clock.sleep(PING_TIMEOUT, { signal: timer.signal }).then(
    () => `timed out after ${PING_TIMEOUT / 1000}s`,
    (err) => `ping timer failed: ${err.message}`,
  )
  const request = $.http.fetch(url, init).then(pingProblem, (err) => err.message)
  try {
    return await Promise.race([request, timeout])
  } finally {
    timer.abort()
  }
}

// The line to show after a ping; no key means no ping
async function check($) {
  const key = await apiKey($)
  if (!key) return undefined
  const problem = await ping($, key)
  return problem ? `cczh is on, but DeepSeek is unreachable: ${problem}` : 'cczh enabled'
}

async function setEnabled($, enabled) {
  settings.enabled = enabled
  // A failed write only loses the state on restart; this session already uses it
  try {
    await $.store.set(STORE_KEY, enabled)
  } catch (err) {
    $.ui.log(`Saving cczh state failed, kept for this session only: ${err.message}`)
  }
  // Show or hide the translations already appended to answers
  $.ui.invalidate('ui.render')
}

export function registerCommand(on) {
  on('session.start', async ($, e, next) => {
    // An unreadable store leaves the plugin on, the default
    const stored = await $.store.get(STORE_KEY).catch(() => undefined)
    if (typeof stored === 'boolean') settings.enabled = stored
    await $.command.register({
      name: COMMAND,
      description: 'Turn cczh translation on or off',
      argumentHint: 'on|off',
      immediate: true,
    })
    // In the background: startup and the first prompt don't wait for the ping
    if (settings.enabled) {
      check($)
        .then((line) => line && $.ui.log(line))
        .catch((err) => $.ui.log(`cczh: DeepSeek ping failed: ${err.message}`))
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg !== 'on' && arg !== 'off') return { text: `cczh is ${settings.enabled ? 'on' : 'off'}; usage: /cczh on|off` }
    await setEnabled($, arg === 'on')
    if (arg === 'off') return { text: 'cczh is off' }
    return { text: (await check($)) ?? 'cczh is on, but no DeepSeek API key is set' }
  }).catch(($, e, next) => ({ text: `cczh: ${next.error?.message ?? next.error}` }))
}
