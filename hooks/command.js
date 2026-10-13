// Feature 3: /cczh on|off turns both translations on and off
import { settings } from './lib/settings.js'

const COMMAND = 'cczh'
const STORE_KEY = 'enabled'

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
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg !== 'on' && arg !== 'off') return { text: `cczh is ${settings.enabled ? 'on' : 'off'}; usage: /cczh on|off` }
    await setEnabled($, arg === 'on')
    return { text: `cczh is ${arg}` }
  }).catch(($, e, next) => ({ text: `cczh: ${next.error?.message ?? next.error}` }))
}
