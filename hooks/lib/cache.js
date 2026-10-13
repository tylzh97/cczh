// LFU cache of prompt translations: pure functions, never touches $
//
// Keys are templates (pastes already replaced by [PASTE n]), trimmed so surrounding whitespace doesn't split entries
// When full, the entry with the fewest hits is evicted; ties go to the one least recently used
// Recency is a logical clock (tick) bumped on every insert and hit, so no wall clock is needed

/** @typedef {{ value: string | null, hits: number, tick: number }} Entry */
/** @typedef {{ map: Map<string, Entry>, tick: number }} Cache */

const keyOf = (template) => template.trim()

/**
 * Rebuild a cache from what toJSON stored; anything unreadable starts empty.
 *
 * @param {unknown} stored The $.store value, [[key, entry], ...].
 * @returns {Cache}
 */
export function fromJSON(stored) {
  const map = new Map(Array.isArray(stored) ? stored : [])
  let tick = 0
  for (const e of map.values()) tick = Math.max(tick, e.tick)
  return { map, tick }
}

/**
 * @param {Cache} cache
 * @returns {[string, Entry][]} JSON data for $.store.
 */
export function toJSON(cache) {
  return [...cache.map]
}

/**
 * Look up a template, counting a hit when found.
 *
 * @param {Cache} cache
 * @param {string} template
 * @returns {Entry | undefined} The entry; value null means the text was already English.
 */
export function lookup(cache, template) {
  const entry = cache.map.get(keyOf(template))
  if (entry) {
    entry.hits++
    entry.tick = ++cache.tick
  }
  return entry
}

/**
 * Add a translation, evicting the least frequently used entries first when full.
 *
 * Evicting before inserting means a new entry (0 hits) survives at least until the next insert.
 *
 * @param {Cache} cache
 * @param {string} template
 * @param {string | null} value The translation; null when the text was already English.
 * @param {number} limit Maximum number of entries.
 */
export function insert(cache, template, value, limit) {
  const key = keyOf(template)
  const entry = cache.map.get(key)
  if (entry) {
    entry.value = value
    return
  }
  while (cache.map.size >= limit) cache.map.delete(victim(cache.map))
  cache.map.set(key, { value, hits: 0, tick: ++cache.tick })
}

// Fewest hits, then oldest tick; a linear scan is fine at a few hundred entries
function victim(map) {
  let worst
  let worstKey
  for (const [key, e] of map) {
    if (!worst || e.hits < worst.hits || (e.hits === worst.hits && e.tick < worst.tick)) {
      worst = e
      worstKey = key
    }
  }
  return worstKey
}
