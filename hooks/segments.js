// 输入框分段模型：纯函数，不碰 $
//
// segs 是有序分段，所有 text 拼起来等于输入框内容：
//   { kind: 'typed',  text }  手打
//   { kind: 'paste',  text }  短粘贴（多行），内容就在框里
//   { kind: 'folded', text }  长粘贴，框里只有占位符 [Pasted text #n ...]，内容提交时才展开
//
// 长粘贴不触发 prompt.edit（见 anthropics/claude-code#100443），靠 resync 补上

const PLACEHOLDER = /(\[Pasted text #\d+[^\]]*\])/

const join = (segs) => segs.map((s) => s.text).join('')

// 去掉空段，合并相邻同类段
function normalize(segs) {
  const out = []
  for (const s of segs) {
    if (!s.text) continue
    const last = out.at(-1)
    if (last && last.kind === s.kind) last.text += s.text
    else out.push({ kind: s.kind, text: s.text })
  }
  return out
}

// 截取 [from, to) 区间，跨段时按段切开
function cut(segs, from, to) {
  const out = []
  let pos = 0
  for (const s of segs) {
    const a = Math.max(from, pos)
    const b = Math.min(to, pos + s.text.length)
    if (a < b) out.push({ kind: s.kind, text: s.text.slice(a - pos, b - pos) })
    pos += s.text.length
  }
  return out
}

function splice(segs, start, end, inserted) {
  return normalize([...cut(segs, 0, start), ...inserted, ...cut(segs, end, Infinity)])
}

// 文本里的占位符记为 folded，其余记为 typed
function classify(text) {
  return text.split(PLACEHOLDER).map((t, i) => ({ kind: i % 2 ? 'folded' : 'typed', text: t }))
}

/**
 * 把 segs 同步到真实输入框：处理没经过 prompt.edit 的变化（长粘贴、历史回填、其他插件 fill）。
 *
 * Args:
 *   segs: 当前分段。
 *   box: 输入框的真实内容。
 *
 * Returns:
 *   拼起来等于 box 的分段；变化区间用公共前后缀定位。
 */
export function resync(segs, box) {
  const cur = join(segs)
  if (cur === box) return segs
  const max = Math.min(cur.length, box.length)
  let p = 0
  while (p < max && cur[p] === box[p]) p++
  let q = 0
  while (q < max - p && cur[cur.length - 1 - q] === box[box.length - 1 - q]) q++
  return splice(segs, p, cur.length - q, classify(box.slice(p, box.length - q)))
}

/**
 * 把一次 prompt.edit 应用到 segs。
 *
 * 没有 key 且含换行的插入算粘贴，其余都算手打（Shift+Enter 带 key，算手打）。
 *
 * Args:
 *   segs: 当前分段。
 *   e: prompt.edit 的输入（text 为编辑前的输入框，start/end/inputText 为 splice）。
 *
 * Returns:
 *   编辑后的分段。
 */
export function applyEdit(segs, e) {
  const kind = !e.key && e.inputText.includes('\n') ? 'paste' : 'typed'
  return splice(resync(segs, e.text), e.start, e.end, [{ kind, text: e.inputText }])
}

/**
 * 把分段对齐到提交文本（粘贴已展开），folded 展开成 paste。
 *
 * typed/paste 段按顺序原样定位，段之间对不上的部分（展开的长粘贴、提交前没来得及
 * 同步的粘贴）一律算 paste。
 *
 * Args:
 *   segs: 提交前的分段。
 *   text: prompt.submit 的 e.text。
 *
 * Returns:
 *   [{ kind: 'typed' | 'paste', text }]，拼起来等于 text。
 */
export function align(segs, text) {
  // engine 提交时会去掉首尾空白：开头直接去掉；结尾不一定是 segs 的结尾
  // （长粘贴后直接回车，占位符没同步进来），所以逐段先原样匹配，不行再去掉尾部空白
  const box = join(segs)
  const trimmed = cut(segs, box.length - box.trimStart().length, Infinity)

  const parts = []
  let pos = 0
  for (const s of trimmed) {
    if (s.kind === 'folded') continue
    let t = s.text
    let i = text.indexOf(t, pos)
    if (i < 0) i = text.indexOf((t = t.trimEnd()), pos)
    if (i < 0) continue
    parts.push({ kind: 'paste', text: text.slice(pos, i) }, { kind: s.kind, text: t })
    pos = i + t.length
  }
  parts.push({ kind: 'paste', text: text.slice(pos) })
  return normalize(parts)
}

const TAGS = { typed: 'input', paste: 'paste' }

/**
 * 把对齐后的分段拼回文本，每段用对应标签包起来。
 *
 * Args:
 *   parts: align 的结果。
 *   tags: kind → 标签名，默认 typed → input，paste → paste。
 *
 * Returns:
 *   标记后的文本，如 <input>看这个 </input><paste>foo\nbar</paste>。
 */
export function mark(parts, tags = TAGS) {
  return parts.map((p) => `<${tags[p.kind]}>${p.text}</${tags[p.kind]}>`).join('')
}
