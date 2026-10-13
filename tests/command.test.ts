import { test, expect, mock } from 'claude-code/testing'

const balance = (available) => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ is_available: available }) })

/** The world beneath the plugin: store, env, a held clock and DeepSeek answering the ping with `reply` */
function world(on, env, reply) {
  mock.store(on)
  mock.env(on, env)
  const clock = mock.clock(on)
  const pings = []
  // Noun hooks answer as { value }
  on('http.fetch', async ($, e) => {
    pings.push(e.url)
    return { value: await reply() }
  })
  return { clock, pings }
}

// The test kit can't answer fs.read with text, so a translation attempt shows up as a read of the prompt file and stops there
// Checked on the answer path: without prompt.edit events the whole prompt counts as pasted and is never translated
test('/cczh on|off gates answer translation', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  world(on, {}, () => balance(true))
  const reads = []
  on('fs.read', ($, e) => {
    reads.push(e.path)
    throw new Error('no fs in tests')
  })
  on('turn.complete', () => ({ text: '' }))
  const answer = () => $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'The tests pass now.', text: '' })

  expect((await $.command.run({ command: 'cczh', args: 'off' })).text).toBe('cczh is off')
  await answer()
  expect(reads).toEqual([])

  expect((await $.command.run({ command: 'cczh', args: 'on' })).text).toBe('cczh enabled')
  await answer()
  expect(reads.length).toBe(1)
  expect(reads[0]).toEndWith('prompts/to-chinese.md')

  expect((await $.command.run({ command: 'cczh' })).text).toContain('usage: /cczh on|off')
})

test('/cczh on pings every time, never cached', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  const { pings } = world(on, {}, () => balance(true))
  await $.command.run({ command: 'cczh', args: 'on' })
  await $.command.run({ command: 'cczh', args: 'on' })
  expect(pings).toEqual(['https://api.deepseek.com/user/balance', 'https://api.deepseek.com/user/balance'])
})

test('/cczh off and the usage line never ping', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  const { pings } = world(on, {}, () => balance(true))
  await $.command.run({ command: 'cczh', args: 'off' })
  await $.command.run({ command: 'cczh' })
  expect(pings).toEqual([])
})

test('/cczh on reports why DeepSeek is unusable', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  world(on, {}, () => ({ status: 401, ok: false, headers: {}, text: 'Authentication Fails' }))
  expect((await $.command.run({ command: 'cczh', args: 'on' })).text).toBe('cczh is on, but DeepSeek is unreachable: invalid API key')
})

test('/cczh on reports an empty balance', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  world(on, {}, () => balance(false))
  expect((await $.command.run({ command: 'cczh', args: 'on' })).text).toBe('cczh is on, but DeepSeek is unreachable: insufficient balance')
})

test('/cczh on without a key skips the ping', async ($, on) => {
  const { pings } = world(on, {}, () => balance(true))
  expect((await $.command.run({ command: 'cczh', args: 'on' })).text).toBe('cczh is on, but no DeepSeek API key is set')
  expect(pings).toEqual([])
})

test('the key from DEEPSEEK_API_KEY is pinged too', async ($, on) => {
  const { pings } = world(on, { DEEPSEEK_API_KEY: 'sk-env' }, () => balance(true))
  expect((await $.command.run({ command: 'cczh', args: 'on' })).text).toBe('cczh enabled')
  expect(pings.length).toBe(1)
})

test('a ping with no answer times out after 5s', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  const { clock } = world(on, {}, () => new Promise(() => {}))
  const run = $.command.run({ command: 'cczh', args: 'on' })
  await clock.advance(5000)
  expect((await run).text).toBe('cczh is on, but DeepSeek is unreachable: timed out after 5s')
})
