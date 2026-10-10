// 用户手打的内容经 DeepSeek 翻译成英文，粘贴内容原样保留；模型回答翻译成中文显示在下方
import { installTracker, takeParts } from './tracker.js'
import {
  TO_ENGLISH,
  TO_CHINESE,
  splitCode,
  toTemplate,
  hasCollision,
  needsEnglish,
  needsChinese,
  fill,
  buildRequest,
  parseResponse,
} from './translate.js'

// $ 只能传给本文件里的函数，所以 IO 放这里
async function deepseek($, system, text) {
  const [url, init] = buildRequest(system, text)
  return parseResponse(await $.http.fetch(url, init))
}

export function register(on) {
  installTracker(on)

  on('prompt.submit', async ($, e, next) => {
    // 只翻译用户在终端输入的 prompt，通知、peer 消息等原样放行
    if (e.origin.kind !== 'composer') return next(e)
    const { template, hidden } = toTemplate(takeParts(e), 'paste', 'PASTE')
    if (!needsEnglish(template)) return next(e)
    if (hasCollision(template, hidden, 'PASTE')) {
      $.ui.log('Typed text contains a [PASTE n] marker, sending original')
      return next(e)
    }

    // 失败就发原文，不吞掉用户的 prompt
    let text = e.text
    try {
      const english = await deepseek($, TO_ENGLISH, template)
      const filled = fill(english, hidden, 'PASTE')
      if (filled === undefined) throw new Error(`placeholder mismatch: ${english}`)
      text = filled
      // 视觉反馈：显示翻译前的原文（粘贴为占位符），方便核对；$.ui.log 不发给模型，只画一行，所以逐行输出
      for (const line of template.split('\n')) $.ui.log(line)
    } catch (err) {
      $.ui.log(`Translation failed, sending original: ${err.message}`)
    }
    return next({ ...e, text })
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // 只处理主循环的正常回答；子 agent、中断、报错、拒答都跳过
    if (e.agentId !== undefined || e.reason !== 'answer' || !e.answer) return r

    // 代码块不发给 DeepSeek，译文里保留 [CODE n]，原文就在上面
    const { template } = toTemplate(splitCode(e.answer), 'code', 'CODE')
    if (!needsChinese(template)) return r
    try {
      const chinese = await deepseek($, TO_CHINESE, template)
      // 不用返回 { text }：实测它被画成一行，换行变成乱码，还会带上其他插件的名字
      // $.ui.log 不发给模型，只画一行，所以逐行输出；空行跳过
      $.ui.log('── 中文翻译 ──')
      for (const line of chinese.split('\n')) if (line.trim()) $.ui.log(line)
    } catch (err) {
      $.ui.log(`Answer translation failed: ${err.message}`)
    }
    return r
  })
}
