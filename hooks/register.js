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

// 回答译文持久化在 $.store（插件自己的 JSON 文件，不进会话记录和模型上下文），跨重启、热重载和 --resume
// 存成 [[hash, 译文], ...]，最旧的在前；整个 store 上限 4 MiB，所以只留最近 KEEP 条
const STORE_KEY = 'translations'
const KEEP = 100

// 内存缓存：sha256(回答) → 译文；第一次用到时从 $.store 读入，存 Promise 避免并发重复加载
let loading

// $ 只能传给本文件里的函数，所以 IO 放这里
async function deepseek($, system, text) {
  const [url, init] = buildRequest(system, text)
  return parseResponse(await $.http.fetch(url, init))
}

async function load($) {
  loading ??= $.store.get(STORE_KEY).then((v) => new Map(v ?? []))
  return loading
}

// key 用哈希，不存回答原文，省一半空间
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function remember($, answer, chinese) {
  const cache = await load($)
  const key = await sha256(answer)
  // 先删再插，重复的回答挪到最新
  cache.delete(key)
  cache.set(key, chinese)
  while (cache.size > KEEP) cache.delete(cache.keys().next().value)
  await $.store.set(STORE_KEY, [...cache])
}

async function recall($, answer) {
  return (await load($)).get(await sha256(answer))
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
    $.ui.status('Translating answer…')
    try {
      await remember($, e.answer, await deepseek($, TO_CHINESE, template))
    } catch (err) {
      $.ui.log(`Answer translation failed: ${err.message}`)
    } finally {
      $.ui.status(undefined)
      // 让回答块重画，ui.render 会把译文追加上去；store 写失败时内存里也已经有了
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // 译文追加在最后回答的块末尾：只改显示，存储的消息和模型上下文都不变
  // 工具调用前的文字块和 e.answer 对不上，不会追加
  // 不用 turn.complete 返回 { text }（画成一行、换行乱码），也不用 ui.log（每行带前缀、不渲染 markdown）
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const chinese = await recall($, e.props.text)
    if (!chinese) return next(e)
    return next({ ...e, props: { ...e.props, text: `${e.props.text}\n\n---\n\n${chinese}` } })
  })
}
