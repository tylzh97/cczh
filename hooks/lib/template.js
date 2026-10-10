// 翻译模板：不该发给 DeepSeek 的段（粘贴、代码块）换成 [KIND n] 占位符，只把模板发出去，译文回来再填回去
// 纯函数，不碰 $

// 方括号两头定界：后面紧跟数字也不会粘连
const marker = (kind) => new RegExp(`\\[${kind.toUpperCase()} (\\d+)\\]`, 'g')
const ANY_MARKER = /\[(PASTE|CODE) \d+\]/g

/**
 * 把回答按 ``` 围栏切成文字段和代码段。
 *
 * Args:
 *   text: 模型的回答。
 *
 * Returns:
 *   [{ kind: 'text' | 'code', text }]，拼起来等于 text。
 */
export function splitCode(text) {
  return text.split(/(```[\s\S]*?```)/).map((t, i) => ({ kind: i % 2 ? 'code' : 'text', text: t }))
}

/**
 * 把 kind 段换成 [KIND 1]、[KIND 2]…，拼出发给 DeepSeek 的模板。
 *
 * Args:
 *   parts: 分段，如 align 或 splitCode 的结果。
 *   kind: 要藏起来的段类型，如 'paste'、'code'；占位符名取它的大写。
 *
 * Returns:
 *   { template, hidden }，hidden[i] 对应 [KIND i+1]。
 */
export function toTemplate(parts, kind) {
  const hidden = []
  const name = kind.toUpperCase()
  const template = parts.map((p) => (p.kind === kind ? `[${name} ${hidden.push(p.text)}]` : p.text)).join('')
  return { template, hidden }
}

/**
 * 把占位符替换回原内容。
 *
 * 一次正则回调完成替换，原内容里即使含 [KIND n] 也不会被二次替换。
 * 文字段里自带同名标记（与占位符冲突）时数量对不上，同样会抛错。
 *
 * Args:
 *   translated: DeepSeek 返回的译文。
 *   hidden: toTemplate 给出的原内容。
 *   kind: 与 toTemplate 相同的段类型。
 *
 * Returns:
 *   填好的文本。
 *
 * Raises:
 *   Error: 任一占位符没有恰好出现一次（丢失、重复、多出）。
 */
export function fill(translated, hidden, kind) {
  const seen = translated.match(marker(kind)) ?? []
  // 数量相等且 1..n 都出现过，等价于每个恰好一次
  const missing = hidden.map((_, i) => `[${kind.toUpperCase()} ${i + 1}]`).filter((m) => !seen.includes(m))
  if (seen.length !== hidden.length || missing.length) {
    throw new Error(`placeholder mismatch (expected ${hidden.length}, got ${seen.length}): ${translated}`)
  }
  return translated.replace(marker(kind), (_, n) => hidden[n - 1])
}

// 文字部分全是 ASCII 就不用翻成英文
export function needsEnglish(template) {
  return /[^\x00-\x7F]/.test(template.replace(ANY_MARKER, ''))
}

// 文字部分英文字母多于中文字符才需要翻成中文
export function needsChinese(template) {
  const t = template.replace(ANY_MARKER, '')
  const cjk = (t.match(/[一-鿿]/g) ?? []).length
  const latin = (t.match(/[A-Za-z]/g) ?? []).length
  return latin > cjk
}
