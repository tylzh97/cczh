// DeepSeek 请求的构造与解析：纯函数，IO 在入口模块里做（加载器不允许 $ 跨 import 传递）

const API = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-flash'
// 原文已经是目标语言时 DeepSeek 只回这个 token，省得原样复述一遍（见 prompts/*.md）
const UNCHANGED = 'LANGUAGE_UNCHANGED'

/**
 * 构造翻译请求（关闭思考，约 1 秒）。
 *
 * Args:
 *   system: system prompt，来自 prompts/*.md。
 *   text: 要翻译的模板。
 *   key: DeepSeek API key。
 *
 * Returns:
 *   [url, init]，直接交给 $.http.fetch。
 */
export function buildRequest(system, text, key) {
  const init = {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
    }),
  }
  return [API, init]
}

/**
 * 从 $.http.fetch 的响应里取出译文。
 *
 * Args:
 *   r: $.http.fetch 的结果 { ok, status, text }。
 *
 * Returns:
 *   译文；原文已经是目标语言时返回 null。
 *
 * Raises:
 *   Error: HTTP 失败或返回为空。
 */
export function parseResponse(r) {
  if (!r.ok) throw new Error(`DeepSeek HTTP ${r.status}: ${r.text.slice(0, 200)}`)
  const translated = JSON.parse(r.text).choices?.[0]?.message?.content?.trim()
  if (!translated) throw new Error('DeepSeek returned empty content')
  return translated === UNCHANGED ? null : translated
}
