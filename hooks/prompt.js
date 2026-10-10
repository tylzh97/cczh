// 功能一：用户手打的内容经 DeepSeek 翻译成英文再交给 Claude；粘贴内容原样保留，不发给 DeepSeek
import { installTracker, takeParts } from './lib/tracker.js'
import { toTemplate, needsEnglish, fill } from './lib/template.js'
import { buildRequest, parseResponse } from './lib/deepseek.js'

// prompts/to-english.md，第一次用到时读入；改了 .md 重载插件生效
let system

// $ 只能传给本文件里的函数，所以 IO 放这里（answer.js 里有一份同样的）
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
    // 只翻译用户在终端输入的 prompt；subagent、通知、peer 消息等来源都不是 composer，原样放行
    if (e.origin.kind !== 'composer') return next(e)
    const { template, hidden } = toTemplate(takeParts(e), 'paste')
    if (!needsEnglish(template)) return next(e)

    // 失败就发原文，不吞掉用户的 prompt
    let text = e.text
    try {
      text = fill(await translate($, template), hidden, 'paste')
      // 视觉反馈：显示翻译前的原文（粘贴为占位符），方便核对；$.ui.log 不发给模型，只画一行，所以逐行输出
      for (const line of template.split('\n')) $.ui.log(line)
    } catch (err) {
      $.ui.log(`Translation failed, sending original: ${err.message}`)
    }
    return next({ ...e, text })
  })
}
