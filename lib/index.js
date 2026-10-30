/**
 * dsh-knowledge-base — 把 massCode 的 markdown vault（笔记 + 任务）接进 DSH。
 *
 * 宿主侧只做两件事：读写 vault、把结果通过一条 RPC 通道交给浏览器端。
 * vault 布局与 Electron massCode / Spark Studio 完全一致，所以这里不引入它们的代码，
 * 只按文件约定读写（见 lib/vault.js）。
 *
 * 通道：/knowledge-base，endpoint 见 handler 的 switch。
 */

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  assetMeta, assetRead, assetWrite, createFolder, createNote, deleteFolder, deleteNote, emptyTrash, listTrash,
  moveFolder, moveNote, purgeNote, readNote, renameFolder, renameNote, reorderNotes, restoreNote, scanVault,
  setFolderIcon, setNoteKind, setNoteStatus, writeNote,
} from './vault.js'

export const name = 'knowledge-base'
export const CHANNEL = '/knowledge-base'

/**
 * 默认 vault：放在用户文档目录下，首次使用时自动把结构建好（notes/、assets/、state.json）。
 * 不再猜 massCode / Spark Studio 的既有目录——那些属于旧客户端，最后会废弃；
 * 想用既有 vault 的话，在设置里改路径即可。
 */
export function defaultVaultRoot() {
  return join(homedir(), 'Documents', 'DSBotKnowledge')
}

/** 建一个能被三个客户端都认的 vault 骨架；已存在的部分不动。 */
export async function ensureVault(root) {
  const notes = join(root, 'notes')
  const assets = join(notes, 'assets')
  const stateDir = join(notes, '.masscode')
  const statePath = join(stateDir, 'state.json')
  const hadNotes = await stat(notes).then((info) => info.isDirectory()).catch(() => false)
  await mkdir(assets, { recursive: true })
  await mkdir(stateDir, { recursive: true })
  const hadState = await stat(statePath).then(() => true).catch(() => false)
  if (!hadState) {
    await writeFile(statePath, JSON.stringify({ version: 1, counters: { folderId: 0, noteId: 0, tagId: 0 }, folderUi: {}, notes: [], tags: [] }, null, 2), 'utf8')
  }
  return { created: !hadNotes }
}

function dataDir() {
  return process.env.DSH_HOME || join(homedir(), '.ds-bot')
}

function configPath() {
  return join(dataDir(), 'knowledge-base.json')
}

async function readConfig() {
  const stored = await readStoredConfig()
  const configured = typeof stored.vaultRoot === 'string' && stored.vaultRoot.trim() !== ''
  if (configured) return { vaultRoot: stored.vaultRoot, configured: true, source: stored.source ?? 'manual' }

  // 首次使用：用默认目录，建好骨架，写进配置（之后用户可以在设置里改）
  const vaultRoot = defaultVaultRoot()
  const { created } = await ensureVault(vaultRoot)
  if (created) await seedWelcomeNote(vaultRoot)
  await writeConfig({ vaultRoot, source: 'default' })
  return { vaultRoot, configured: false, source: 'default' }
}

/** 新建的默认 vault 放一篇《开始使用》，避免用户打开是一片空白。 */
async function seedWelcomeNote(root) {
  try {
    await createNote(root, {
      name: '开始使用',
      body: [
        '# 开始使用',
        '',
        '这里是 DS Bot 知识库的默认目录，笔记就是普通的 markdown 文件。',
        '',
        '- 左边可以建文件夹、建笔记；写的时候格式即时渲染',
        '- 粘贴或拖入图片会存到 `notes/assets/` 并自动插入引用',
        '- 右上角「问 DSH」可以基于当前这篇笔记开一个新会话',
        '- 想换目录：左侧列表工具栏的 ⚙',
        '',
      ].join('\n'),
    })
  } catch {
    /* 放不进去也不影响使用 */
  }
}

/** 只读磁盘上的配置，不做首次初始化——避免 writeConfig -> readConfig -> writeConfig 递归。 */
async function readStoredConfig() {
  try {
    return JSON.parse(await readFile(configPath(), 'utf8'))
  } catch {
    return {}
  }
}

async function writeConfig(patch) {
  const stored = await readStoredConfig()
  const next = { ...stored, ...patch }
  delete next.configured
  await mkdir(dataDir(), { recursive: true })
  const path = configPath()
  const temp = `${path}.tmp-${process.pid}`
  await writeFile(temp, JSON.stringify(next, null, 2), 'utf8')
  await rename(temp, path)
  return { vaultRoot: next.vaultRoot, configured: true, source: next.source ?? 'manual' }
}

// 返回信封和 DSH 自带插件保持一致：{ ok: true, value } / { ok: false, error }。
// 客户端插件的 unwrap 都按 response.value 取值。
/** 图标资源随插件一起分发：assets/icons/material/<name>.svg，846 个，与另两个客户端同名。 */
const ICON_DIR = new URL('../assets/icons/material/', import.meta.url)
const ICON_NAME = /^[A-Za-z0-9._-]+$/
let iconListCache = null
const iconSvgCache = new Map()

/** `material:name` 或裸 name 取 name；`lucide:` 没有资源，返回 null 让前端回退。 */
function iconName(value) {
  const raw = String(value ?? '').trim()
  if (raw === '') return null
  const at = raw.indexOf(':')
  if (at === -1) return ICON_NAME.test(raw) ? raw : null
  if (raw.slice(0, at) !== 'material') return null
  const name = raw.slice(at + 1).trim()
  return ICON_NAME.test(name) ? name : null
}

/** 图标清单只扫一次目录；846 条 JSON 大约 30 KB。 */
async function listIcons() {
  if (iconListCache !== null) return iconListCache
  const entries = await readdir(ICON_DIR).catch(() => [])
  iconListCache = entries
    .filter((name) => name.toLowerCase().endsWith('.svg'))
    .map((name) => name.slice(0, -4))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, value: `material:${name}` }))
  return iconListCache
}

/** 单个 SVG 文本，进程内缓存：图标内容不会变，重复请求直接命中。 */
async function readIcon(value) {
  const name = iconName(value)
  if (name === null) return null
  const cached = iconSvgCache.get(name)
  if (cached !== undefined) return cached
  const text = await readFile(new URL(`${name}.svg`, ICON_DIR), 'utf8').catch(() => null)
  if (text !== null) iconSvgCache.set(name, text)
  return text
}

const ok = (value) => ({ ok: true, value })
const fail = (code, message) => ({ ok: false, error: { code, message, details: { issues: [] } } })

function asString(value) {
  return typeof value === 'string' ? value : ''
}

/** 纯文本检索：标题命中优先，然后正文命中；返回命中的片段做预览。 */
async function searchNotes(root, query) {
  const scan = await scanVault(root)
  const needle = query.toLowerCase()
  const hits = []
  for (const note of scan.notes) {
    let score = 0
    let snippet = ''
    if (note.name.toLowerCase().includes(needle)) score += 10
    try {
      const one = await readNote(root, note.path)
      const index = one.body.toLowerCase().indexOf(needle)
      if (index >= 0) {
        score += 1
        snippet = one.body.slice(Math.max(0, index - 40), index + 120).replace(/\s+/g, ' ')
      }
    } catch {
      continue
    }
    if (score > 0) hits.push({ ...note, score, snippet })
  }
  hits.sort((a, b) => b.score - a.score || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return hits
}

/**
 * RPC 处理：endpoint + payload -> { ok, data } | { ok: false, error }。
 * 所有错误都在这里翻成结果对象，未捕获异常会让整条通道报错，前端只能看到 500。
 */
export function createKnowledgeHandler() {
  const state = { vaultRoot: null }

  async function root() {
    if (state.vaultRoot === null) state.vaultRoot = (await readConfig()).vaultRoot
    return state.vaultRoot
  }

  return async function handle(endpoint, payload) {
    const input = payload && typeof payload === 'object' ? payload : {}
    try {
      switch (endpoint) {
        case 'config/read': {
          const config = await readConfig()
          return ok({ ...config, defaultVaultRoot: defaultVaultRoot(), configPath: configPath() })
        }
        case 'config/set': {
          const vaultRoot = asString(input.vaultRoot).trim()
          if (vaultRoot === '') return fail('invalid', 'vaultRoot 不能为空')
          const config = await writeConfig({ vaultRoot, source: 'manual' })
          await ensureVault(config.vaultRoot)
          state.vaultRoot = config.vaultRoot
          const scan = await scanVault(config.vaultRoot)
          return ok({ ...config, notes: scan.notes.length, folders: scan.folders.length })
        }
        case 'tree': {
          const scan = await scanVault(await root())
          return ok({ vaultRoot: scan.notesRoot, folders: scan.folders, notes: scan.notes, errors: scan.errors, scannedAt: scan.scannedAt })
        }
        case 'note': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          const note = await readNote(await root(), path)
          return ok({ path: note.path, mtimeMs: note.mtimeMs, meta: note.meta, fields: note.fields, body: note.body })
        }
        case 'note/save': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          const fields = input.fields && typeof input.fields === 'object' ? { ...input.fields } : {}
          fields.updatedAt = typeof fields.updatedAt === 'number' ? fields.updatedAt : Date.now()
          const cleaned = {}
          for (const [key, value] of Object.entries(fields)) if (value !== undefined) cleaned[key] = value
          const body = typeof input.body === 'string' ? input.body : undefined
          const saved = await writeNote(await root(), path, {
            body,
            fields: cleaned,
            expectedMtimeMs: typeof input.mtimeMs === 'number' ? input.mtimeMs : undefined,
          })
          const note = await readNote(await root(), path)
          return ok({ path: note.path, mtimeMs: note.mtimeMs, meta: note.meta, body: note.body })
        }
        case 'asset/meta': {
          const names = Array.isArray(input.names) ? input.names.slice(0, 60) : []
          return ok(await assetMeta(await root(), names))
        }
        case 'asset/read': {
          const names = Array.isArray(input.names) ? input.names.slice(0, 12) : []
          return ok(await assetRead(await root(), names))
        }
        case 'asset/write': {
          return ok(await assetWrite(await root(), { mime: asString(input.mime), base64: asString(input.base64) }))
        }
        case 'icon/list': {
          return ok({ items: await listIcons() })
        }
        case 'icon/svgs': {
          // 批量取：选择器一屏几十个图标只发一次请求。
          const values = Array.isArray(input.values) ? input.values.slice(0, 200) : []
          const out = {}
          for (const value of values) {
            const svg = await readIcon(value)
            if (svg !== null) out[value] = svg
          }
          return ok(out)
        }
        case 'folder/create': {
          const created = await createFolder(await root(), {
            parentPath: asString(input.parentPath),
            name: asString(input.name),
          })
          return ok(created)
        }
        case 'folder/rename': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await renameFolder(await root(), { path, name: asString(input.name) }))
        }
        case 'folder/icon': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await setFolderIcon(await root(), { path, icon: asString(input.icon) }))
        }
        case 'note/create': {
          const created = await createNote(await root(), {
            folderPath: asString(input.folderPath),
            name: asString(input.name).trim() === '' ? '未命名笔记' : input.name.trim(),
            body: asString(input.body),
            asTask: input.asTask === true,
          })
          return ok(created)
        }
        case 'folder/move': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await moveFolder(await root(), { path, parentPath: asString(input.parentPath) }))
        }
        case 'folder/delete': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await deleteFolder(await root(), { path }))
        }
        case 'trash/list': {
          return ok(await listTrash(await root()))
        }
        case 'trash/restore': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await restoreNote(await root(), { path }))
        }
        case 'trash/purge': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await purgeNote(await root(), { path }))
        }
        case 'trash/empty': {
          return ok(await emptyTrash(await root()))
        }
        case 'note/rename': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await renameNote(await root(), { path, name: asString(input.name) }))
        }
        case 'note/delete': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await deleteNote(await root(), { path }))
        }
        case 'note/move': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await moveNote(await root(), { path, folderPath: asString(input.folderPath) }))
        }
        case 'note/status': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await setNoteStatus(await root(), { path, status: asString(input.status) }))
        }
        case 'note/kind': {
          const path = asString(input.path)
          if (path === '') return fail('invalid', 'path 不能为空')
          return ok(await setNoteKind(await root(), { path, isTask: input.isTask === true }))
        }
        case 'note/order': {
          return ok(await reorderNotes(await root(), {
            folderPath: asString(input.folderPath),
            order: Array.isArray(input.order) ? input.order : [],
          }))
        }
        case 'search': {
          const query = asString(input.query).trim()
          if (query === '') return ok({ query, hits: [] })
          return ok({ query, hits: await searchNotes(await root(), query) })
        }
        default:
          return fail('unknown-endpoint', `未知 endpoint: ${endpoint}`)
      }
    } catch (error) {
      return fail('failed', String(error?.message ?? error))
    }
  }
}

export function apply(ctx) {
  const handler = createKnowledgeHandler()
  // 插件激活失败不应该拖垮整棵插件树：只让这条通道缺席，页面会显示 RPC 错误。
  ctx.inject(['connection', 'webServer'], (webCtx) => {
    const connection = webCtx.connection
    webCtx.effect(() => {
      // 新版 Connection 用 register(owner, channel, handler)；老版用 rpc.handle。
      if (typeof connection.register === 'function') {
        return connection.register(webCtx, CHANNEL, handler)
      }
      return connection.rpc.handle(CHANNEL, handler)
    }, 'knowledge-base: port RPC')
  })
}
