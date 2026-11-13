/**
 * Locale dictionary for the client half.
 *
 * No dependency: the shipped `@deepseek-ai/dsh-client-locale` is a host-side
 * service surface, and the client registry hands this bundle no locale
 * service. `navigator.language` decides — the same signal the shell itself
 * localizes from, so zh shells read zh and everything else falls back to en.
 *
 * @module dsh-wsl/client/locale
 */

const ZH = {
  addTitle: '添加 WSL 工作区',
  distribution: '发行版',
  defaultTag: '（默认）',
  pathLabel: '路径',
  go: '前往',
  pathMissing: '该路径不存在',
  pathNotFolder: '这是一个文件，不是文件夹',
  pathDrvfs: '这一层在 Windows 侧无法解析（/mnt 下的路径都是这样），宿主没法把它登记成工作区。把项目放在发行版自己的文件系统里（例如 /home/你/projects），或者用 Windows 盘符直接开一个 Windows 工作区。',
  noDistros: '没有找到 WSL 发行版',
  noDistrosHint: '先在 Windows 里安装一个（wsl --install -d Ubuntu），然后重新打开此对话框。',
  variantsMissing: '{count} 个 WSL 预设变体没能生成，WSL 新会话会退回宿主默认预设（详情见宿主日志）。',
  close: '关闭',
  addFolder: '添加此文件夹',
  added: '已添加 {title}',
  alreadyAdded: '{title} 已存在',
} as const

const EN = {
  addTitle: 'Add WSL workspace',
  distribution: 'Distribution',
  defaultTag: ' (default)',
  pathLabel: 'Path',
  go: 'Go',
  pathMissing: 'That path does not exist',
  pathNotFolder: 'That path is a file, not a folder',
  pathDrvfs:
    'Windows cannot resolve anything below /mnt, so the host cannot register it as a workspace. Keep the project on the distribution filesystem (for example /home/you/projects), or open a Windows workspace at the drive path instead.',
  noDistros: 'No WSL distribution found',
  noDistrosHint: 'Install one on Windows first (wsl --install -d Ubuntu), then reopen this dialog.',
  variantsMissing: '{count} WSL preset variant(s) could not be generated, so new WSL sessions fall back to the host preset (details in the host log).',
  close: 'Close',
  addFolder: 'Add this folder',
  added: 'Added {title}',
  alreadyAdded: '{title} was already added',
} as const

export type Strings = typeof EN

const TABLE: Record<string, Strings> = { zh: ZH, en: EN }

/** Resolve the dictionary once per load; unknown languages fall back to en. */
export function strings(language: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language): Strings {
  const base = (language ?? 'en').toLowerCase()
  return TABLE[base] ?? TABLE[base.split('-')[0] ?? 'en'] ?? EN
}

/** `fill('{title} 已存在', 'x')` → `x 已存在`. Unknown keys stay literal. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)
}
