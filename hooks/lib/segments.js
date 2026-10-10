// Input box segment model: pure functions, never touches $
//
// segs is an ordered list of segments whose texts concatenate to the input box content:
//   { kind: 'typed',  text }  typed by hand
//   { kind: 'paste',  text }  short (multi-line) paste, content is in the box
//   { kind: 'folded', text }  long paste, the box only holds a [Pasted text #n ...] placeholder, expanded on submit
//
// Long pastes don't fire prompt.edit (see anthropics/claude-code#100443), so resync fills the gap

/** @typedef {{ kind: 'typed' | 'paste' | 'folded', text: string }} Seg */
/** @typedef {{ kind: 'typed' | 'paste', text: string }} Part */

const PLACEHOLDER = /(\[Pasted text #\d+[^\]]*\])/

const join = (segs) => segs.map((s) => s.text).join('')

// Drop empty segments and merge adjacent segments of the same kind
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

// Take the [from, to) range, splitting segments that straddle the boundaries
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

// Placeholders in the text become folded, everything else typed
function classify(text) {
  return text.split(PLACEHOLDER).map((t, i) => ({ kind: i % 2 ? 'folded' : 'typed', text: t }))
}

/**
 * Sync segs to the real input box: handles changes that bypassed prompt.edit (long pastes, history recall, fills by other plugins).
 *
 * @param {Seg[]} segs Current segments.
 * @param {string} box The actual input box content.
 * @returns {Seg[]} Segments that concatenate to box; the changed range is located via common prefix/suffix.
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
 * Apply one prompt.edit to segs.
 *
 * An insertion with no key that contains a newline counts as a paste; everything else counts as typed (Shift+Enter has a key, so it's typed).
 *
 * @param {Seg[]} segs Current segments.
 * @param {import('claude-code').Args<'prompt.edit'>} e The prompt.edit input (text is the input box before the edit, start/end/inputText describe the splice).
 * @returns {Seg[]} The segments after the edit.
 */
export function applyEdit(segs, e) {
  const kind = !e.key && e.inputText.includes('\n') ? 'paste' : 'typed'
  return splice(resync(segs, e.text), e.start, e.end, [{ kind, text: e.inputText }])
}

/**
 * Align segments to the submitted text (pastes expanded), expanding folded into paste.
 *
 * typed/paste segments are located in order verbatim; anything between them that doesn't
 * match (expanded long pastes, pastes not synced before submit) counts as paste.
 *
 * @param {Seg[]} segs Segments before submit.
 * @param {string} text e.text from prompt.submit.
 * @returns {Part[]} Typed and paste parts, concatenating to text.
 */
export function align(segs, text) {
  // The engine trims leading/trailing whitespace on submit: the start is simply trimmed; the end isn't necessarily the end of segs
  // (pressing Enter right after a long paste, before the placeholder synced), so match each segment verbatim first, then retry with trailing whitespace trimmed
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
