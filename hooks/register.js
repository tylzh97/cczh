// 用户手打的内容经 DeepSeek 翻译成英文，粘贴内容原样保留
import { installTracker, takeParts } from './tracker.js'
import { toTemplate, hasCollision, needsTranslation, fill, buildRequest, parseResponse } from './translate.js'

export function register(on) {
  installTracker(on)

  on('prompt.submit', async ($, e, next) => {
    // 只翻译用户在终端输入的 prompt，通知、peer 消息等原样放行
    if (e.origin.kind !== 'composer') return next(e)
    const { template, pastes } = toTemplate(takeParts(e))
    if (!needsTranslation(template)) return next(e)
    if (hasCollision(template, pastes)) {
      $.ui.log('Typed text contains a [PASTE n] marker, sending original')
      return next(e)
    }

    // 失败就发原文，不吞掉用户的 prompt
    let text = e.text
    try {
      const [url, init] = buildRequest(template)
      const english = parseResponse(await $.http.fetch(url, init))
      const filled = fill(english, pastes)
      if (filled === undefined) throw new Error(`placeholder mismatch: ${english}`)
      text = filled
      // 视觉反馈：显示翻译前的原文（粘贴为占位符），方便核对；$.ui.log 不发给模型，只画一行，所以逐行输出
      for (const line of template.split('\n')) $.ui.log(line)
    } catch (err) {
      $.ui.log(`Translation failed, sending original: ${err.message}`)
    }
    return next({ ...e, text })
  })
}
