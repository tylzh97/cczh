import { test, expect, mock } from 'claude-code/testing'

// The test kit can't answer fs.read with text, so a translation attempt shows up as a read of the prompt file and stops there
// Checked on the answer path: without prompt.edit events the whole prompt counts as pasted and is never translated
test('/cczh on|off gates answer translation', { options: { deepseek_api_key: 'sk-test' } }, async ($, on) => {
  mock.store(on)
  mock.env(on, {})
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

  expect((await $.command.run({ command: 'cczh', args: 'on' })).text).toBe('cczh is on')
  await answer()
  expect(reads.length).toBe(1)
  expect(reads[0]).toEndWith('prompts/to-chinese.md')

  expect((await $.command.run({ command: 'cczh' })).text).toContain('usage: /cczh on|off')
})
