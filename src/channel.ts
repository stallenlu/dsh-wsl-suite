/**
 * The host end of the in-distro agent channel: one spawn per distribution,
 * reused for every filesystem and shell operation in every session targeting
 * it, torn down when the distribution goes idle.
 *
 * Lifetime is the whole design. A channel is expensive to create (a `wsl.exe`
 * spawn, ~110 ms cold) and nearly free to use (~0.2 ms), so the cost is paid
 * once and amortized until quiescence. There is no timer that touches the
 * distribution while nothing is happening — the reference plugin's 3 s and 30 s
 * pollers are what resurrected the distro and stole window focus
 * (dsh-wsl-workspace#130). Here, an idle channel simply closes.
 * @module dsh-wsl/channel
 */

import { execFileSync, spawn, type ChildProcessByStdio } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { CODE, type Reply, type Request } from './proto.ts'

/** Idle time before a channel is closed, in milliseconds. */
export const IDLE_TTL_MS = 10 * 60 * 1000

/**
 * Deadline for the agent's first `ping` after spawn, in milliseconds.
 *
 * Generous on purpose: this covers the distribution's own cold start, which on
 * a freshly booted Windows (WSL's VM gone, memory reclaimed) regularly runs
 * past half a minute. The cost of a longer deadline is only paid when the
 * agent is actually broken, and then the failure path below explains it.
 */
export const BOOT_TIMEOUT_MS = 60_000

/** Deadline applied to a request that carries none of its own, in milliseconds. */
export const DEFAULT_DEADLINE_MS = 15 * 60 * 1000

/** A request as a caller supplies it; the channel adds `id`. */
export type CallRequest = Omit<Request, 'id'>

/** A failed agent call. `code` is an errno name or a {@link CODE} entry. */
export class ChannelError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'ChannelError'
    this.code = code
  }
}

/** The absolute path of the agent inside the distribution. */
function agentPath(distro: string): string {
  const host = fileURLToPath(new URL('../agent/agent.mjs', import.meta.url))
  // The host may hand us a '/mnt/c/...' path already when the package sits
  // inside a mounted drive; otherwise translate the Windows path once.
  if (host.startsWith('/')) return host
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(host)
  if (!m) {
    throw new ChannelError(
      `cannot reach the agent at ${host} from inside ${distro}; the package must live on a drive WSL mounts`,
      'EAGENTPATH',
    )
  }
  return `/mnt/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, '/')}`
}

/** The child shape this module spawns: stdin and stdout piped, stderr discarded. */
type ChannelChild = ChildProcessByStdio<Writable, Readable, null>

/**
 * Explain a failed boot, when the reason is knowable.
 *
 * The overwhelmingly common cause is that the executable this plugin starts the
 * agent with is not on the distribution's *non-login* PATH — a distinction that
 * bites every nvm/fnm/volta user, because those tools install `node` under
 * `~/.local/bin` or `~/.nvm/...` and only a login shell puts it on PATH. The
 * plugin runs `wsl.exe --exec node`, which is a non-login spawn, so the same
 * machine happily reports `node v22` from `bash -lc` and fails here.
 * @param distro - the distribution the boot targeted.
 * @param nodePath - the executable name or path that was tried.
 * @returns a one-line diagnosis, or `undefined` when probing found nothing to say.
 */
function nodeHint(distro: string, nodePath: string): string | undefined {
  // A caller who pinned a path has already made the decision; report only the
  // facts a bare `node` miss can be explained by.
  if (nodePath.includes('/') && nodePath !== 'node') return undefined
  let located: string
  try {
    // `command -v` in a non-login shell answers exactly the question the spawn
    // asked, so an empty result is proof rather than a guess.
    located = execFileSync('wsl.exe', ['-d', distro, '--exec', 'sh', '-c', 'command -v node || true'], {
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
  if (located !== '') {
    return `the agent died even though node is at ${located}; run "wsl.exe -d ${distro} --exec node --version" to check it`
  }
  return (
    `node is not on the PATH of a non-login shell in ${distro} — install it ` +
    `(sudo apt install nodejs) or set the plugin's nodePath to an absolute path ` +
    `(nvm/fnm/volta users: a login shell hides this, the agent does not get one)`
  )
}

/** One live conversation with an in-distro agent. */
export class Channel {
  readonly distro: string
  #child: ChannelChild
  #pending = new Map<
    number,
    {
      resolve: (r: Reply) => void
      reject: (e: Error) => void
      onChunk?: ((stream: 'o' | 'e', text: string) => void) | undefined
    }
  >()
  #nextId = 1
  #closed = false
  #exitError: ChannelError | undefined
  #idleTimer: NodeJS.Timeout | undefined
  #booted: Promise<void>

  private constructor(distro: string, child: ChannelChild) {
    this.distro = distro
    this.#child = child
    this.#booted = this.#read()
  }

  /**
   * Spawn an agent in `distro` and resolve once it answers `ping`.
   * @param distro - the WSL distribution name.
   * @param nodePath - the `node` to run inside the distribution.
   */
  static async open(distro: string, nodePath = 'node'): Promise<Channel> {
    const argv = ['-d', distro, '--exec', nodePath, agentPath(distro)]
    let child: ChannelChild
    try {
      // stderr is *not* piped apart: wsl.exe writes a locale-garbled proxy
      // notice there on every invocation, and decoding it is pure noise. The
      // agent keeps its own diagnostics on stderr too, so it goes to the void.
      child = spawn('wsl.exe', argv, {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      })
    } catch (error) {
      throw new ChannelError(`failed to spawn wsl.exe for ${distro}: ${String(error)}`, 'ESPAWN')
    }

    const channel = new Channel(distro, child)
    try {
      await channel.#boot()
    } catch (error) {
      // stderr is discarded on the live pipe (see above), so a failed boot is
      // otherwise just "closed: exit 127" — the one message a user cannot act
      // on. Probe once, synchronously, to turn it into a real diagnosis.
      const hint = nodeHint(distro, nodePath)
      channel.close()
      if (hint === undefined) throw error
      throw new ChannelError(`${(error as Error).message} (${hint})`, 'ENOAGENT')
    }
    return channel
  }

  /** Wait for the agent to answer, bounded by {@link BOOT_TIMEOUT_MS}. */
  async #boot(): Promise<void> {
    // Let the reader attach before the first write.
    await this.#booted
    const deadline = AbortSignal.timeout(BOOT_TIMEOUT_MS)
    const reply = await this.call({ op: 'ping' }, deadline)
    if (!reply.ok) {
      throw new ChannelError(
        `agent in ${this.distro} rejected its first ping: ${reply.code ?? 'unknown'}`,
        reply.code ?? 'EPING',
      )
    }
  }

  /** Attach the line reader and settle every waiter when the pipe closes. */
  async #read(): Promise<void> {
    const lines = createInterface({ input: this.#child.stdout, crlfDelay: Infinity })
    lines.on('line', (line) => {
      if (!line) return
      let reply: Reply
      try {
        reply = JSON.parse(line) as Reply
      } catch {
        return
      }
      const waiter = this.#pending.get(reply.id)
      if (!waiter) return
      // An `exec` chunk is not the reply: the request stays outstanding so the
      // exit facts arrive on the same waiter, and output is never reordered
      // after them.
      if (reply.ev) {
        waiter.onChunk?.(reply.ev, reply.d ?? '')
        return
      }
      this.#pending.delete(reply.id)
      waiter.resolve(reply)
    })

    const die = (reason: string) => {
      if (this.#closed) return
      this.#closed = true
      this.#exitError = new ChannelError(`agent in ${this.distro} closed: ${reason}`, CODE.channelClosed)
      clearTimeout(this.#idleTimer)
      for (const waiter of this.#pending.values()) {
        waiter.reject(this.#exitError)
      }
      this.#pending.clear()
    }

    this.#child.on('exit', (code, signal) => die(signal ?? `exit ${code ?? 'unknown'}`))
    this.#child.on('error', (error) => die(String(error)))
    this.#child.stdin.on('error', (error) => die(String(error)))
  }

  /** True once the channel can no longer serve requests. */
  get closed(): boolean {
    return this.#closed
  }

  /**
   * Send one request and await its reply.
   * @param request - the operation and its operands.
   * @param signal - cancels the wait; the agent keeps running the operation.
   * @param deadlineMs - overrides {@link DEFAULT_DEADLINE_MS}; `0` arms none.
   * @returns the reply, which may itself be a failure (`ok: false`).
   */
  async call(request: CallRequest, signal?: AbortSignal, deadlineMs?: number): Promise<Reply> {
    return await this.begin(request, signal, deadlineMs).reply
  }

  /**
   * Send a request without awaiting it, exposing its id so the caller can
   * reach the operation later (`kill` needs the target request id).
   * @param request - the operation and its operands.
   * @param signal - cancels the wait; the agent keeps running the operation.
   * @param deadlineMs - overrides {@link DEFAULT_DEADLINE_MS}; `0` arms none.
   * @param onChunk - receives `exec` output as it arrives, before the reply.
   * @returns the request id and the reply promise.
   */
  begin(
    request: CallRequest,
    signal?: AbortSignal,
    deadlineMs = DEFAULT_DEADLINE_MS,
    onChunk?: (stream: 'o' | 'e', text: string) => void,
  ): { id: number; reply: Promise<Reply> } {
    if (this.#closed) {
      throw this.#exitError ?? new ChannelError(`agent in ${this.distro} is closed`, CODE.channelClosed)
    }
    if (signal?.aborted) throw new ChannelError('aborted', CODE.aborted)

    this.#touch()
    const id = this.#nextId++
    const line = JSON.stringify({ ...request, id }) + '\n'

    const reply = new Promise<Reply>((resolve, reject) => {
      /** @type {NodeJS.Timeout | undefined} */
      let timer: NodeJS.Timeout | undefined
      const cleanup = () => {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        this.#pending.delete(id)
        cleanup()
        reject(new ChannelError('aborted', CODE.aborted))
      }

      this.#pending.set(id, {
        resolve: (reply) => {
          cleanup()
          resolve(reply)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        },
        onChunk,
      })

      signal?.addEventListener('abort', onAbort, { once: true })
      if (!signal && deadlineMs > 0) {
        timer = setTimeout(() => {
          this.#pending.delete(id)
          reject(new ChannelError(`no reply for op "${request.op}" within ${deadlineMs}ms`, CODE.timeout))
        }, deadlineMs)
        timer.unref?.()
      }

      this.#child.stdin.write(line)
    })

    return { id, reply }
  }

  /** Send a request and throw unless it succeeded. */
  async ok(request: CallRequest, signal?: AbortSignal): Promise<Reply> {
    const reply = await this.call(request, signal)
    if (!reply.ok) {
      throw new ChannelError(reply.message ?? `op "${request.op}" failed`, reply.code ?? 'EIO')
    }
    return reply
  }

  /** Reset the idle timer; close the channel when it fires with nothing in flight. */
  #touch(): void {
    clearTimeout(this.#idleTimer)
    this.#idleTimer = setTimeout(() => {
      // "Idle" means no request is outstanding, not merely that none started
      // recently: one `begin()` arms this timer once, so a 30-minute `pytest`
      // started by a job handle would otherwise be killed at IDLE_TTL_MS by
      // `close()` — the agent tears down its children when stdin ends.
      if (this.#pending.size > 0) this.#touch()
      else this.close()
    }, IDLE_TTL_MS)
    this.#idleTimer.unref?.()
  }

  /** Close the pipe and wait for the process to exit. Idempotent. */
  close(): void {
    if (this.#closed) return
    clearTimeout(this.#idleTimer)
    try {
      this.#child.stdin.end()
    } catch {
      /* already gone */
    }
    // The agent exits on stdin close; wsl.exe follows. Nothing waits for it —
    // a stray exit cannot fail a caller that has already moved on.
    this.#child.unref()
  }
}

/** Channels keyed by `distro\0nodePath`, so one distro has one agent. */
const channels = new Map<string, Promise<Channel>>()

/**
 * Get (or start) the channel for a distribution.
 * @param distro - the WSL distribution name.
 * @param nodePath - the `node` to run inside the distribution.
 * @returns the live channel, booted and pingable.
 */
export async function channelFor(distro: string, nodePath = 'node'): Promise<Channel> {
  const key = `${distro}\0${nodePath}`
  const existing = channels.get(key)
  if (existing) {
    const channel = await existing.catch(() => undefined)
    if (channel && !channel.closed) return channel
    channels.delete(key)
  }
  const opening = Channel.open(distro, nodePath)
  channels.set(key, opening)
  try {
    return await opening
  } catch (error) {
    channels.delete(key)
    throw error
  }
}

/** Close every channel. Called on plugin unload. */
export async function closeAll(): Promise<void> {
  const pending = [...channels.values()]
  channels.clear()
  for (const promise of pending) {
    const channel = await promise.catch(() => undefined)
    channel?.close()
  }
}
