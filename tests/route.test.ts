/**
 * The browser route's front door.
 *
 * `/dsh-wsl/api` is reachable from any page the user visits — the loopback test
 * passes for the browser because the browser IS the client — so the content type
 * is what separates the plugin's own `fetch` from a cross-site call. A
 * `text/plain` POST is a CORS "simple request": no preflight, no rejection, and
 * before this gate it could list a distribution and register a workspace.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import { apply, isJsonRequest } from '../src/index.ts'

/** Just enough of an `IncomingMessage` for the header check. */
function request(contentType?: string): never {
  return { headers: contentType === undefined ? {} : { 'content-type': contentType } } as never
}

test('only a JSON content type is accepted', () => {
  assert.equal(isJsonRequest(request('application/json')), true)
  // Browsers append the charset, and `fetch` sends it as-is.
  assert.equal(isJsonRequest(request('application/json; charset=utf-8')), true)
  assert.equal(isJsonRequest(request('Application/JSON')), true)
  // Everything below can be sent cross-origin without a preflight.
  assert.equal(isJsonRequest(request('text/plain')), false)
  assert.equal(isJsonRequest(request('text/plain;charset=UTF-8')), false)
  assert.equal(isJsonRequest(request('application/x-www-form-urlencoded')), false)
  // A lookalike must not pass a substring test.
  assert.equal(isJsonRequest(request('application/jsonp')), false)
  assert.equal(isJsonRequest(request()), false)
})

test('the preset registry is waited for, not sampled once', async () => {
  // `agentPresets` is provided by a sibling plugin. Sampling it once at
  // activation meant an early activation skipped the whole variant pass, and
  // every WSL session silently ran the host's `standard` preset instead.
  const pending: { deps: string[]; body: (scope: unknown) => void }[] = []
  const services = new Map<string, unknown>()
  let effects = 0
  const ctx = {
    get: (name: string) => services.get(name),
    inject(deps: string[], body: (scope: unknown) => void) {
      if (deps.every((dep) => services.has(dep))) body(ctx)
      else pending.push({ deps, body })
    },
    effect(body: () => () => void) {
      effects += 1
      body()
    },
  } as unknown as Context

  apply(ctx, { nodePath: 'node', defaultPreset: 'wsl-standard' })
  // Nothing was registered and nothing threw: the plugin is waiting.
  assert.deepEqual(
    pending.map((entry) => entry.deps),
    [['agentPresets'], ['shellEnv'], ['subprocess'], ['sessionController']],
  )
  assert.equal(effects, 2) // the route effect and the channel cleanup, neither of which needs a service

  let listed = 0
  services.set('agentPresets', {
    async list() {
      listed += 1
      return []
    },
    async readDocument() {
      return { content: '' }
    },
    async register() {
      return async () => {}
    },
  })
  const waiting = pending.splice(0).filter((entry) => entry.deps[0] === 'agentPresets')
  for (const entry of waiting) entry.body(ctx)

  // The pass ran once the service appeared — that is the whole fix.
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(listed, 1)
})
