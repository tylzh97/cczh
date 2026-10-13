import { test, expect } from 'claude-code/testing'
import { fromJSON, toJSON, lookup, insert } from '../hooks/lib/cache.js'

const keys = (cache) => [...cache.map.keys()].sort()

test('hits are counted and keys are trimmed', async () => {
  const cache = fromJSON(undefined)
  insert(cache, '  你好 [PASTE 1]\n', 'hello [PASTE 1]', 10)
  expect(lookup(cache, '你好 [PASTE 1]')?.value).toBe('hello [PASTE 1]')
  expect(lookup(cache, ' 你好 [PASTE 1] ')?.hits).toBe(2)
  expect(lookup(cache, '再见')).toBeUndefined()
})

test('already-English results are cached as null', async () => {
  const cache = fromJSON(undefined)
  insert(cache, 'fix it, 谢谢', null, 10)
  const hit = lookup(cache, 'fix it, 谢谢')
  expect(hit).toBeDefined()
  expect(hit?.value).toBeNull()
})

test('evicts the fewest hits first', async () => {
  const cache = fromJSON(undefined)
  insert(cache, 'a', 'A', 3)
  insert(cache, 'b', 'B', 3)
  insert(cache, 'c', 'C', 3)
  lookup(cache, 'a')
  lookup(cache, 'a')
  lookup(cache, 'c')
  insert(cache, 'd', 'D', 3)
  expect(keys(cache)).toEqual(['a', 'c', 'd'])
})

test('ties go to the least recently used', async () => {
  const cache = fromJSON(undefined)
  insert(cache, 'a', 'A', 3)
  insert(cache, 'b', 'B', 3)
  insert(cache, 'c', 'C', 3)
  // All at one hit; b's is the oldest
  lookup(cache, 'b')
  lookup(cache, 'a')
  lookup(cache, 'c')
  insert(cache, 'd', 'D', 3)
  expect(keys(cache)).toEqual(['a', 'c', 'd'])
})

test('a new entry survives until the next insert', async () => {
  const cache = fromJSON(undefined)
  insert(cache, 'a', 'A', 2)
  lookup(cache, 'a')
  insert(cache, 'b', 'B', 2)
  insert(cache, 'c', 'C', 2)
  expect(keys(cache)).toEqual(['a', 'c'])
})

test('re-inserting a key updates it without evicting', async () => {
  const cache = fromJSON(undefined)
  insert(cache, 'a', 'A', 2)
  insert(cache, 'b', 'B', 2)
  lookup(cache, 'a')
  insert(cache, 'a', 'A2', 2)
  expect(keys(cache)).toEqual(['a', 'b'])
  expect(lookup(cache, 'a')).toEqual({ value: 'A2', hits: 2, tick: 4 })
})

test('round-trips through JSON, keeping hits and recency', async () => {
  const cache = fromJSON(undefined)
  insert(cache, 'a', 'A', 2)
  insert(cache, 'b', 'B', 2)
  lookup(cache, 'a')
  const restored = fromJSON(JSON.parse(JSON.stringify(toJSON(cache))))
  expect(restored.tick).toBe(cache.tick)
  insert(restored, 'c', 'C', 2)
  expect(keys(restored)).toEqual(['a', 'c'])
})

test('unreadable stored data starts empty', async () => {
  expect(fromJSON({ not: 'an array' }).map.size).toBe(0)
  expect(fromJSON(null).tick).toBe(0)
})
