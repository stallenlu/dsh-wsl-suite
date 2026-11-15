/**
 * Filesystem checks that need no distribution: the parent-canonicalization
 * fallback is driven by a stub channel, so the failure it must not swallow can
 * be injected exactly.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { ChannelError } from '../src/channel.ts'
import { WslFileSystem } from '../src/fs.ts'

/** The one method `canonicalizeAbsent` uses, failing the way `reply` says. */
function stub(failure: () => Error): never {
  return { ok: () => Promise.reject(failure()) } as never
}

/** `canonicalizeAbsent` is TypeScript-private; this is the same object at runtime. */
type Probe = { canonicalizeAbsent: (channel: never, path: string, signal?: AbortSignal) => Promise<string> }

function probe(): Probe {
  return new WslFileSystem(new Context(), { distro: 'Ubuntu' }) as unknown as Probe
}

test('a missing parent keeps the path as written', async () => {
  const channel = stub(() => new ChannelError('/home/u/new/note.txt: no such file', 'ENOENT'))
  const real = await probe().canonicalizeAbsent(channel, '/home/u/new/note.txt')
  assert.equal(real, '/home/u/new/note.txt')
})

test('a cancelled or dead channel is not mistaken for a missing parent', async () => {
  for (const code of ['EABORTED', 'ECHANNEL']) {
    const channel = stub(() => new ChannelError('gone', code))
    await assert.rejects(
      probe().canonicalizeAbsent(channel, '/home/u/new/note.txt'),
      (error: unknown) => {
        // Swallowing this would hand back a target that no later call can
        // recognize, and would report a cancellation as success.
        assert.equal((error as { code?: string }).code, code === 'EABORTED' ? 'FS_ABORTED' : 'FS_IO_ERROR')
        return true
      },
      code,
    )
  }
})
