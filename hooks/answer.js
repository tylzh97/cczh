// 功能二：主 agent 的最后回答经 DeepSeek 翻译成中文，追加显示在回答块末尾；只改显示，不进模型上下文
import { splitCode, toTemplate, needsChinese } from './lib/template.js'
import { buildRequest, parseResponse } from './lib/deepseek.js'

// 译文持久化在 $.store（插件自己的 JSON 文件，不进会话记录和模型上下文），跨重启、热重载和 --resume
// 存成 [[hash, 译文], ...]，最旧的在前；整个 store 上限 4 MiB，所以只留最近 KEEP 条
const STORE_KEY = 'translations'
const KEEP = 100

// 内存缓存：sha256(回答) → 译文；第一次用到时从 $.store 读入，存 Promise 避免并发重复加载
let loading
// prompts/to-chinese.md，第一次用到时读入；改了 .md 重载插件生效
let system

// $ 只能传给本文件里的函数，所以 IO 放这里（prompt.js 里有一份同样的）
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

export function registerAnswer(on) {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // 只处理主循环的正常回答；subagent、中断、报错、拒答都跳过
    if (e.agentId !== undefined || e.reason !== 'answer' || !e.answer) return r

    // 代码块不发给 DeepSeek，译文里保留 [CODE n]，原代码就在上面
    const { template } = toTemplate(splitCode(e.answer), 'code')
    if (!needsChinese(template)) return r
    $.ui.status('Translating answer…')
    try {
      const chinese = await translate($, template)
      // 已经是中文：不追加、不存
      if (chinese !== null) await remember($, e.answer, chinese)
    } catch (err) {
      $.ui.log(`Answer translation failed: ${err.message}`)
    } finally {
      $.ui.status(undefined)
      // 让回答块重画，ui.render 会把译文追加上去；store 写失败时内存里也已经有了
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // 只给与 e.answer 一致的块追加译文：工具调用前的文字块、subagent 的输出都对不上，原样显示
  // 不用 turn.complete 返回 { text }（画成一行、换行乱码），也不用 ui.log（每行带前缀、不渲染 markdown）
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const chinese = await recall($, e.props.text)
    if (!chinese) return next(e)
    return next({ ...e, props: { ...e.props, text: `${e.props.text}\n\n---\n\n${chinese}` } })
  })
}
