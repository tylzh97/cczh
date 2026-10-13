import { test, expect } from 'claude-code/testing'
import { buildPing, pingProblem } from '../hooks/lib/deepseek.js'

const res = (status, text) => ({ status, ok: status >= 200 && status < 300, headers: {}, text })

test('ping is a GET of /user/balance with the key', async () => {
  const [url, init] = buildPing('sk-test')
  expect(url).toBe('https://api.deepseek.com/user/balance')
  expect(init.method).toBe('GET')
  expect(init.headers?.Authorization).toBe('Bearer sk-test')
})

test('ping response reasons', async () => {
  expect(pingProblem(res(200, '{"is_available":true,"balance_infos":[]}'))).toBeUndefined()
  expect(pingProblem(res(200, '{"is_available":false}'))).toBe('insufficient balance')
  expect(pingProblem(res(401, 'Authentication Fails'))).toBe('invalid API key')
  expect(pingProblem(res(503, 'busy'))).toBe('HTTP 503: busy')
  expect(pingProblem(res(200, '<html>'))).toBe('unexpected response: <html>')
})
