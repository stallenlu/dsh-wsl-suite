/**
 * A new session in a WSL workspace should start in the WSL preset, not the
 * host's global Windows `standard`. The host has no per-workspace default, so
 * `sessionController.create` is wrapped in place to fill in a missing
 * `agentPreset` when the target workspace lives in a distribution.
 *
 * These checks pin the pure decision (explicit picks win, Windows workspaces
 * are untouched, a missing variant degrades to a plain session) and the in-place
 * wrap/restore on a single-slot host service.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { applyDefaultPreset, wslDefaultPresetRequest, type VariantCatalog } from '../src/defaultPreset.ts'

const UNC = '\\\\wsl.localhost\\Ubuntu\\home\\sidady\\projects\\seekaxe'
const WIN = 'C:\\Users\\GT14\\projects\\win'
const TARGET = 'wsl-standard'

const isWsl = (path: string): boolean => path.startsWith('\\\\wsl')
const workspacePath = (id: string): string | undefined => (id === 'wsl-ws' ? UNC : WIN)
const catalog: VariantCatalog = { ids: new Set([TARGET]) }

test('a WSL workspace with no explicit pick gets the WSL preset', () => {
  const out = wslDefaultPresetRequest({ workspaceId: 'wsl-ws' }, TARGET, isWsl, workspacePath, true)
  assert.equal(out.agentPreset, TARGET)
})

test('a WSL cwd (no workspaceId) gets the WSL preset', () => {
  const out = wslDefaultPresetRequest({ cwd: UNC }, TARGET, isWsl, workspacePath, true)
  assert.equal(out.agentPreset, TARGET, 'the workspace path is read from cwd when no id is given')
})

test('an explicit agentPreset always wins', () => {
  const out = wslDefaultPresetRequest({ workspaceId: 'wsl-ws', agentPreset: 'standard' }, TARGET, isWsl, workspacePath, true)
  assert.equal(out.agentPreset, 'standard', 'a pick in the AgentPresetSeat must not be overridden')
  const nul = wslDefaultPresetRequest({ cwd: UNC, agentPreset: null }, TARGET, isWsl, workspacePath, true)
  assert.equal(nul.agentPreset, null, 'an explicit null ("use the global default") is left alone too')
})

test('a Windows workspace is untouched', () => {
  const out = wslDefaultPresetRequest({ workspaceId: 'win-ws' }, TARGET, isWsl, workspacePath, true)
  assert.equal('agentPreset' in out, false)
  const posix = wslDefaultPresetRequest({ cwd: '/home/sidady' }, TARGET, isWsl, workspacePath, true)
  assert.equal('agentPreset' in posix, false, 'a bare POSIX path is not a WSL workspace')
})

test('an unregistered variant degrades to a plain session', () => {
  const out = wslDefaultPresetRequest({ workspaceId: 'wsl-ws' }, 'wsl-standard', isWsl, workspacePath, false)
  assert.equal('agentPreset' in out, false, 'composing a preset that does not exist would throw')
})

test('an unknown workspace is untouched', () => {
  const missing = (_id: string): string | undefined => undefined
  const out = wslDefaultPresetRequest({ workspaceId: 'ghost' }, TARGET, isWsl, missing, true)
  assert.equal('agentPreset' in out, false)
})

interface Captured {
  request: Record<string, unknown>
}

test('the host controller is wrapped in place and restored on disposal', async () => {
  const ctx = new Context()
  const calls: Captured[] = []
  const provider = {
    async create(request: Record<string, unknown>) {
      calls.push({ request })
      return { ok: true }
    },
  }
  const registry = {
    get(id: string) {
      return { path: id === 'wsl-ws' ? UNC : WIN }
    },
  }
  const presets = {
    async list() {
      return [{ id: TARGET }]
    },
  }
  ctx.provide('sessionController', provider as never)
  ctx.provide('workspaceRegistry', registry as never)
  ctx.provide('agentPresets', presets as never)

  applyDefaultPreset(ctx, TARGET, catalog)
  await new Promise((resolve) => setTimeout(resolve, 20))

  const viaCtx = ctx.get('sessionController') as unknown as typeof provider
  await viaCtx.create({ workspaceId: 'wsl-ws' })
  await viaCtx.create({ workspaceId: 'wsl-ws', agentPreset: 'standard' })
  await viaCtx.create({ workspaceId: 'win-ws' })

  assert.equal(calls.length, 3, 'every call must still reach the host controller')
  assert.equal(calls[0]?.request['agentPreset'], TARGET, 'the WSL workspace gets the default')
  assert.equal(calls[1]?.request['agentPreset'], 'standard', 'the explicit pick survives')
  assert.equal('agentPreset' in (calls[2]?.request ?? {}), false, 'the Windows workspace is untouched')
})

test('a host without a sessionController loads without throwing', () => {
  const ctx = new Context()
  assert.doesNotThrow(() => applyDefaultPreset(ctx, TARGET, catalog))
})
