/**
 * Give a new session in a WSL workspace its WSL preset by default.
 *
 * The host has one global default preset (`agentPresets`' `isDefault`) and no
 * notion of a per-workspace default: `sessionController.create` receives the
 * workspace id, looks up its path, and forwards `request.agentPreset` to
 * `composeAgent` only when the caller supplied one. The workspace client's
 * "new session" action deliberately omits it, so a WSL workspace would start
 * in the Windows `standard` mode even though every tool it needs lives inside
 * the distribution.
 *
 * `sessionController` is a single-slot host service, so the same in-place wrap
 * `terminal.ts` applies to `subprocess` is used here: capture its `create`,
 * install a wrapper as an own property (which cordis' traceable proxy writes
 * through to the real instance, and the gateway's `Reflect.get` therefore
 * finds), and restore it on disposal. The wrapper only fills in a missing
 * `agentPreset` — an explicit pick in the AgentPresetSeat always wins.
 *
 * This is a default, not a mode: the WSL session still has the full preset
 * roster, and switching back to `standard` in the seat works as before.
 * @module dsh-wsl/defaultPreset
 */

import type { Context } from '@deepseek-ai/cordis'
import { parseUnc } from './paths.ts'
import type { WorkspaceRegistryService } from './index.ts'

/** A `session.create` request. Only the fields this module reads are declared. */
export interface SessionCreateRequest {
  workspaceId?: string
  cwd?: string
  agentPreset?: string | null | undefined
  sessionId?: string
  [key: string]: unknown
}

/** The slice of the host `sessionController` service this module wraps. */
interface SessionControllerFace {
  create: (request: SessionCreateRequest) => Promise<unknown>
}

/** WSL variants `materialize()` has published, shared with the wrapper. */
export interface VariantCatalog {
  ids: Set<string>
}

/** One patch per host controller, ref-counted so two mounts unwind cleanly. */
const PATCHED = new WeakMap<object, { original: SessionControllerFace['create']; refs: number }>()

/**
 * The pure decision behind the wrapper.
 *
 * @param request - the wire request `sessionController.create` received.
 * @param targetId - the WSL variant to default to (e.g. `wsl-standard`).
 * @param isWsl - whether a workspace path names a WSL distribution.
 * @param workspacePath - resolve a `workspaceId` to its path.
 * @param available - whether `targetId` is registered, so composition succeeds.
 * @returns the request, with `agentPreset` filled in when it applies.
 */
export function wslDefaultPresetRequest(
  request: SessionCreateRequest,
  targetId: string,
  isWsl: (path: string) => boolean,
  workspacePath: (id: string) => string | undefined,
  available: boolean,
): SessionCreateRequest {
  // An explicit value (the seat, `startCreatorDraft`, a reused session, or a
  // caller deliberately passing null for "use the global default") wins. Only
  // a caller that left the field out entirely gets a WSL default.
  if (request.agentPreset !== undefined) return request
  const path = request.workspaceId !== undefined ? workspacePath(request.workspaceId) : request.cwd
  if (path === undefined || !isWsl(path)) return request
  // A degraded host (no `agentPresets`, or a broken variant) must still be able
  // to open a session. Composing a preset that does not exist would throw.
  if (!available) return request
  return { ...request, agentPreset: targetId }
}

/**
 * Wrap `sessionController.create` so WSL workspaces default to the WSL preset.
 *
 * @param ctx - host context, where the single `sessionController` lives.
 * @param targetId - the WSL variant to default to.
 * @param catalog - variants published by `materialize()`, kept live.
 */
export function applyDefaultPreset(ctx: Context, targetId: string, catalog: VariantCatalog): void {
  ctx.inject(['sessionController'], (scope: Context) => {
    const controller = scope.get('sessionController') as unknown as SessionControllerFace
    const existing = PATCHED.get(controller)
    if (existing !== undefined) {
      existing.refs += 1
      scope.effect(() => () => {
        existing.refs -= 1
        if (existing.refs > 0) return
        controller.create = existing.original
        PATCHED.delete(controller)
      }, 'dsh-wsl: restore session create')
      return
    }

    // `create` is reached through the service proxy, so it is captured and
    // called with the provider as receiver — its implementation reads its own
    // instance state (`this.commands`).
    const inner = controller.create
    const isWsl = (path: string): boolean => parseUnc(path) !== undefined

    // Services are resolved lazily *at request time*, not captured here: the
    // registry and the preset roster may become active after this wrap is
    // installed, and `ctx.get` always reads the live store.
    const workspacePath = (id: string): string | undefined => {
      const registry = scope.get('workspaceRegistry') as unknown as WorkspaceRegistryService | undefined
      const path = registry?.get?.(id)?.path
      // `WorkspaceEntity.path` is a GETTER on the live object; read it here.
      return typeof path === 'string' ? path : undefined
    }

    // `materialize()` publishes the variants asynchronously at boot and fills
    // `catalog` with its results. A session created in that short window simply
    // falls through to the host's global default; composing a preset that does
    // not exist yet would throw, so the catalog is the single source of truth.
    controller.create = (request) =>
      inner.call(controller, wslDefaultPresetRequest(request, targetId, isWsl, workspacePath, catalog.ids.has(targetId)))
    PATCHED.set(controller, { original: inner, refs: 1 })
    scope.effect(() => () => {
      const entry = PATCHED.get(controller)
      if (entry === undefined) return
      entry.refs -= 1
      if (entry.refs > 0) return
      controller.create = entry.original
      PATCHED.delete(controller)
    }, 'dsh-wsl: restore session create')
  })
}
