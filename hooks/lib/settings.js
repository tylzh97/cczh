// Settings shared by every feature: plain module state, never touches $
// index.js and command.js fill it in; prompt.js and answer.js only read it

export const settings = {
  // Toggled by /cczh on|off, persisted in $.store
  enabled: true,
  // userConfig.deepseek_api_key from settings.json pluginConfigs; empty means fall back to DEEPSEEK_API_KEY
  apiKey: '',
}

/**
 * Take the plugin's userConfig values, as register(on, options) receives them at load.
 *
 * @param {import('claude-code').PluginOptions} options
 */
export function loadOptions(options) {
  settings.apiKey = String(options?.deepseek_api_key ?? '').trim()
}
