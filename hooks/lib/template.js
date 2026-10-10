// Translation templates: segments that shouldn't go to DeepSeek (pastes, code blocks) are replaced with [KIND n] placeholders, only the template is sent, and the originals are filled back into the translation
// Pure functions, never touches $

// Delimited by brackets on both ends, so a following digit can't run into the number
const marker = (kind) => new RegExp(`\\[${kind.toUpperCase()} (\\d+)\\]`, 'g')
const ANY_MARKER = /\[(PASTE|CODE) \d+\]/g

/**
 * Split an answer on ``` fences into text and code segments.
 *
 * Args:
 *   text: the model's answer.
 *
 * Returns:
 *   [{ kind: 'text' | 'code', text }], concatenating to text.
 */
export function splitCode(text) {
  return text.split(/(```[\s\S]*?```)/).map((t, i) => ({ kind: i % 2 ? 'code' : 'text', text: t }))
}

/**
 * Replace segments of the given kind with [KIND 1], [KIND 2]… to build the template sent to DeepSeek.
 *
 * Args:
 *   parts: segments, e.g. the result of align or splitCode.
 *   kind: the segment kind to hide, e.g. 'paste' or 'code'; the placeholder name is its uppercase form.
 *
 * Returns:
 *   { template, hidden }, where hidden[i] corresponds to [KIND i+1].
 */
export function toTemplate(parts, kind) {
  const hidden = []
  const name = kind.toUpperCase()
  const template = parts.map((p) => (p.kind === kind ? `[${name} ${hidden.push(p.text)}]` : p.text)).join('')
  return { template, hidden }
}

/**
 * Replace placeholders with the original content.
 *
 * Done in a single regex callback, so original content containing [KIND n] is never replaced twice.
 * If the text segments themselves contain same-named markers (clashing with placeholders), the counts won't match and it throws as well.
 *
 * Args:
 *   translated: the translation returned by DeepSeek.
 *   hidden: the original content from toTemplate.
 *   kind: the same segment kind passed to toTemplate.
 *
 * Returns:
 *   The filled-in text.
 *
 * Raises:
 *   Error: some placeholder doesn't appear exactly once (missing, duplicated or extra).
 */
export function fill(translated, hidden, kind) {
  const seen = translated.match(marker(kind)) ?? []
  // Equal counts plus every one of 1..n present is equivalent to each appearing exactly once
  const missing = hidden.map((_, i) => `[${kind.toUpperCase()} ${i + 1}]`).filter((m) => !seen.includes(m))
  if (seen.length !== hidden.length || missing.length) {
    throw new Error(`placeholder mismatch (expected ${hidden.length}, got ${seen.length}): ${translated}`)
  }
  return translated.replace(marker(kind), (_, n) => hidden[n - 1])
}

// The template's own text, without placeholders
export function stripMarkers(template) {
  return template.replace(ANY_MARKER, '')
}
