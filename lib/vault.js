// vault 读写层：直接对齐 massCode 的 markdown vault 布局，不依赖 Electron / Swift 客户端。
//
// 布局（实测）：
//   notes/<文件夹>/<笔记>.md          每篇一个文件，正文是 markdown
//   notes/<文件夹>/.meta.yaml         文件夹元数据：id / name / icon / orderIndex / createdAt
//   notes/.masscode/state.json        仅 UI 状态（展开、id 计数器）与 filePath→id 映射
//   notes/assets/                     图片附件，不是笔记文件夹
//
// 笔记正文的 frontmatter 用 YAML：id / name / folderId / description / tags /
// type: task / status / priority / due / isFavorites / isDeleted / createdAt / updatedAt。
//
// 这里刻意不引 YAML 依赖：只解析标量、行内数组和块数组，未知字段按原样保留在 raw
// 里，写回时逐行替换——这样 Electron 或 Spark Studio 新加的字段不会被我写丢。

import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join, dirname, relative, sep } from 'node:path'
import { randomBytes } from 'node:crypto'

const SKIP_DIRS = new Set(['assets', '.masscode'])
const FOLDER_META = '.meta.yaml'
const FRONTMATTER_FENCE = '---'

/** 解析一个 YAML 标量：去掉引号并还原转义，识别 null / 数字 / 布尔。 */
function parseScalar(text) {
  const raw = text.trim()
  if (raw === '' || raw === 'null' || raw === '~') return null
  if (raw === '[]') return []
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    try {
      // YAML 的双引号转义是 JSON 转义的超集，JSON.parse 足够把这批 \uXXXX 还原。
      return JSON.parse(raw)
    } catch {
      return raw.slice(1, -1)
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1).replaceAll("''", "'")
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((part) => parseScalar(part))
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+$/.test(raw)) return Number(raw)
  return raw
}

/** 把标量写成 YAML；字符串一律双引号，避免中文、冒号、井号被 YAML 误读。 */
function formatScalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.map(formatScalar).join(', ')}]`
  return JSON.stringify(String(value))
}

/**
 * 拆 frontmatter：返回字段、原始行（写回时按行保留顺序与未知字段）、正文。
 * 文件和 Electron 一样以 `---` 开头；没有 frontmatter 时整体都是正文。
 */
export function parseNote(text) {
  if (!text.startsWith(FRONTMATTER_FENCE)) return { fields: {}, lines: [], body: text, hasFrontmatter: false }
  const lines = text.split('\n')
  if (lines[0].trim() !== FRONTMATTER_FENCE) return { fields: {}, lines: [], body: text, hasFrontmatter: false }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FRONTMATTER_FENCE) {
      end = i
      break
    }
  }
  if (end === -1) return { fields: {}, lines: [], body: text, hasFrontmatter: false }

  const rawLines = lines.slice(1, end)
  const fields = {}
  let openArrayKey = null
  for (const line of rawLines) {
    if (/^\s+-\s/.test(line) && openArrayKey !== null) {
      const item = parseScalar(line.replace(/^\s+-\s/, ''))
      if (!Array.isArray(fields[openArrayKey])) fields[openArrayKey] = []
      fields[openArrayKey].push(item)
      continue
    }
    const match = line.match(/^([A-Za-z0-9_.-]+):(.*)$/)
    if (!match) {
      openArrayKey = null
      continue
    }
    const key = match[1]
    const rest = match[2]
    if (rest.trim() === '') {
      openArrayKey = key
      fields[key] = []
    } else {
      openArrayKey = null
      fields[key] = parseScalar(rest)
    }
  }
  const body = lines.slice(end + 1).join('\n').replace(/^\n/, '')
  return { fields, lines: rawLines, body, hasFrontmatter: true }
}

/**
 * 用新字段值重写 frontmatter 行：只有值真的变了才重写那一行，其余逐字节保留
 * （未知字段、引号风格、键顺序都不动），新键追加到末尾。
 */
export function serializeNote({ fields, lines, body }, nextFields) {
  const same = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
      return a.every((item, index) => item === b[index])
    }
    return a === b
  }
  const pending = new Map(Object.entries(nextFields ?? {}))
  const out = []
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_.-]+):(.*)$/)
    if (!match || !pending.has(match[1])) {
      out.push(line)
      continue
    }
    const key = match[1]
    const next = pending.get(key)
    pending.delete(key)
    // undefined = 删掉这个键（比如任务转回普通笔记时清 type/status）
    if (next === undefined) continue
    if (same(fields?.[key], next)) {
      out.push(line)
      continue
    }
    out.push(`${key}: ${formatScalar(next)}`)
  }
  for (const [key, value] of pending) {
    if (value === undefined) continue
    out.push(`${key}: ${formatScalar(value)}`)
  }
  return `${FRONTMATTER_FENCE}\n${out.join('\n')}\n${FRONTMATTER_FENCE}\n${body}`
}

/** 读文件夹元数据；坏了就当没有，用目录名兜底。 */
async function readFolderMeta(dir) {
  try {
    const text = await readFile(join(dir, FOLDER_META), 'utf8')
    const { fields } = parseNote(`${FRONTMATTER_FENCE}\n${text}\n${FRONTMATTER_FENCE}\n`)
    return {
      id: typeof fields.id === 'number' ? fields.id : null,
      name: typeof fields.name === 'string' ? fields.name : null,
      icon: typeof fields.icon === 'string' ? fields.icon : null,
      orderIndex: typeof fields.orderIndex === 'number' ? fields.orderIndex : null,
    }
  } catch {
    return { id: null, name: null, icon: null, orderIndex: null }
  }
}

/**
 * 扫整个 vault。返回扁平数组（客户端自己按 parent 拼树），同时带上 noteCount。
 * 单个文件读失败不抛错，只记进 errors，避免一篇坏文件毁掉整个列表。
 */
export async function scanVault(root) {
  const notesRoot = join(root, 'notes')
  const folders = []
  const notes = []
  const errors = []

  async function walk(relDir) {
    const dir = relDir === '' ? notesRoot : join(notesRoot, relDir)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      errors.push({ path: relDir, message: String(error?.message ?? error) })
      return
    }
    if (relDir !== '') {
      const meta = await readFolderMeta(dir)
      folders.push({
        path: relDir,
        name: meta.name ?? relDir.split(sep).pop(),
        id: meta.id,
        icon: meta.icon,
        orderIndex: meta.orderIndex ?? 0,
        parentPath: relDir.includes(sep) ? dirname(relDir) : '',
        noteCount: 0,
      })
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(relDir === '' ? entry.name : join(relDir, entry.name))
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      const relPath = relDir === '' ? entry.name : join(relDir, entry.name)
      try {
        const file = join(notesRoot, relPath)
        const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
        const parsed = parseNote(text)
        notes.push({
          path: relPath,
          folderPath: relDir,
          mtimeMs: Math.round(info.mtimeMs),
          size: info.size,
          ...noteMeta(parsed.fields, entry.name),
        })
      } catch (error) {
        errors.push({ path: relPath, message: String(error?.message ?? error) })
      }
    }
  }

  await walk('')
  const byFolder = new Map()
  for (const note of notes) byFolder.set(note.folderPath, (byFolder.get(note.folderPath) ?? 0) + 1)
  for (const folder of folders) folder.noteCount = byFolder.get(folder.path) ?? 0
  return { notesRoot, folders, notes, errors, scannedAt: Date.now() }
}

/** 从 frontmatter 提出列表/筛选要用的元数据；缺字段给安全默认值。 */
export function noteMeta(fields, fileName) {
  const isTask = fields.type === 'task'
  return {
    id: typeof fields.id === 'number' ? fields.id : null,
    name: typeof fields.name === 'string' ? fields.name : fileName.replace(/\.md$/i, ''),
    description: typeof fields.description === 'string' ? fields.description : null,
    tags: Array.isArray(fields.tags) ? fields.tags.filter((tag) => typeof tag === 'string') : [],
    folderId: typeof fields.folderId === 'number' ? fields.folderId : null,
    isFavorites: fields.isFavorites === 1,
    isDeleted: fields.isDeleted === 1,
    isTask,
    // 笔记顺序：写在 frontmatter 的 orderIndex（和文件夹字段同名）。
    // massCode 不认这个键，但它会逐字节保留未知字段，所以不影响另两个客户端。
    orderIndex: typeof fields.orderIndex === 'number' ? fields.orderIndex : null,
    taskStatus: isTask ? (typeof fields.status === 'string' ? fields.status : 'todo') : null,
    taskPriority: isTask && typeof fields.priority === 'string' ? fields.priority : null,
    taskDue: isTask && typeof fields.due === 'string' ? fields.due : null,
    createdAt: typeof fields.createdAt === 'number' ? fields.createdAt : null,
    updatedAt: typeof fields.updatedAt === 'number' ? fields.updatedAt : null,
  }
}

/** 读单篇：元数据 + 正文 + mtime（写回时用它做冲突检测）。 */
export async function readNote(root, relPath) {
  const file = join(root, 'notes', relPath)
  const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
  const parsed = parseNote(text)
  return {
    path: relPath,
    mtimeMs: Math.round(info.mtimeMs),
    size: info.size,
    meta: noteMeta(parsed.fields, relPath.split(sep).pop()),
    fields: parsed.fields,
    body: parsed.body,
    parsed,
  }
}

/**
 * 写回（新建或更新）。
 * expectedMtimeMs 是读的时候拿到的 mtime：写之前重新 stat 一次，对不上就拒绝，
 * 避免和 Electron / Spark Studio 同时写同一篇时互相覆盖。
 */
export async function writeNote(root, relPath, { body, fields, expectedMtimeMs }) {
  const file = join(root, 'notes', relPath)
  let current = null
  try {
    current = await stat(file)
  } catch {
    current = null
  }
  const exists = current !== null
  if (exists) {
    if (expectedMtimeMs === undefined || expectedMtimeMs === null) {
      throw new Error('文件已存在：更新时必须带上 expectedMtimeMs，防止覆盖别人的修改')
    }
    if (Math.round(current.mtimeMs) !== Math.round(expectedMtimeMs)) {
      throw new Error(`文件已被外部修改（mtime ${Math.round(current.mtimeMs)} != ${Math.round(expectedMtimeMs)}），请重新加载后再保存`)
    }
  } else if (expectedMtimeMs !== undefined && expectedMtimeMs !== null) {
    throw new Error('文件不存在：不能按更新写入')
  }

  let nextFields = { ...(fields ?? {}) }
  let nextBody = body ?? ''
  if (exists) {
    const text = await readFile(file, 'utf8')
    const parsed = parseNote(text)
    nextFields = { ...parsed.fields, ...nextFields }
    // 只传了部分字段时，正文保持原样。
    if (body === undefined) nextBody = parsed.body
    const serialized = parsed.hasFrontmatter
      ? serializeNote({ ...parsed, body: nextBody }, nextFields)
      : `---\n${Object.entries(nextFields).map(([k, v]) => `${k}: ${formatScalar(v)}`).join('\n')}\n---\n${nextBody}`
    return commit(file, serialized, exists)
  }
  const serialized = `---\n${Object.entries(nextFields).map(([k, v]) => `${k}: ${formatScalar(v)}`).join('\n')}\n---\n${nextBody}`
  return commit(file, serialized, exists)
}

/** state.json 里记录 filePath→id，id 计数器也在里面；新建笔记要一起更新。 */
async function readState(root) {
  const path = join(root, 'notes', '.masscode', 'state.json')
  const text = await readFile(path, 'utf8')
  return { path, data: JSON.parse(text) }
}

/** state.json 可能同时被 Electron / Swift 写：改完再核对一次 mtime，被抢先就重来。 */
async function updateState(root, mutate) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { path, data } = await readState(root)
    const before = (await stat(path)).mtimeMs
    mutate(data)
    const temp = `${path}.dsh-tmp-${process.pid}-${Date.now()}`
    await writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
    const after = (await stat(path)).mtimeMs
    if (Math.round(after) !== Math.round(before)) {
      await unlink(temp).catch(() => {})
      continue
    }
    await rename(temp, path)
    return data
  }
  throw new Error('state.json 正在被其他客户端写入，请稍后重试')
}

/** 同名笔记加序号，和 Swift 客户端的 uniqueNoteName 规则一致。 */
/**
 * 名字（笔记标题 / 文件夹名）的合法字符。
 * `/` 和 `\` 会被当成路径分隔符（所以输入「产品/需求」以前会建出子文件夹），
 * 控制字符会破坏 frontmatter，开头 `.` 会和 .masscode / assets 混在一起——一律拒绝。
 * 前端 src/client/index.js 里有一份同样规则的即时校验，两边要一起改。
 */
export function cleanName(input, { kind = '笔记', stripMd = false } = {}) {
  let name = String(input ?? '').trim()
  if (stripMd) name = name.replace(/\.md$/iu, '').trim()
  if (name === '') throw new Error(`${kind}名不能为空`)
  if (name === '.' || name === '..') throw new Error(`${kind}名不合法`)
  if (name.startsWith('.')) throw new Error(`${kind}名不能以 . 开头（会被当成隐藏文件）`)
  if (/[/\\]/u.test(name)) throw new Error(`${kind}名里不能包含 / 或 \\，层级请用文件夹区分`)
  if (/[\u0000-\u001f\u007f]/u.test(name)) throw new Error(`${kind}名里不能包含控制字符`)
  if (/[. ]$/u.test(name)) throw new Error(`${kind}名不能以空格或 . 结尾`)
  if (Buffer.byteLength(name, 'utf8') > 200) throw new Error(`${kind}名太长（最多 200 字节）`)
  return name
}

async function uniqueNoteName(root, folderPath, base) {
  const dir = folderPath === '' ? join(root, 'notes') : join(root, 'notes', folderPath)
  let existing
  try {
    existing = new Set((await readdir(dir)).map((name) => name.replace(/\.md$/i, '')))
  } catch {
    existing = new Set()
  }
  if (!existing.has(base)) return base
  let index = 1
  while (existing.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

/**
 * 新建笔记，字段顺序和默认值对齐 Swift 的 createNote：
 * id / name / description / tags / isDeleted / isFavorites / createdAt / updatedAt / folderId。
 * 同时把 id 写进 state.json 的 notes[] 与计数器，否则另一个客户端按 filePath 找不到它。
 */
export async function createNote(root, { folderPath = '', name, body = '', asTask = false }) {
  const now = Date.now()
  const wanted = String(name ?? '').trim() === '' ? '未命名笔记' : name
  const base = cleanName(wanted, { kind: '笔记', stripMd: true })
  const unique = await uniqueNoteName(root, folderPath, base)
  const relPath = folderPath === '' ? `${unique}.md` : `${folderPath}/${unique}.md`
  const file = join(root, 'notes', relPath)

  const state = await updateState(root, (data) => {
    data.counters = data.counters ?? { folderId: 0, noteId: 0, tagId: 0 }
  })
  const id = (state.counters.noteId ?? 0) + 1
  const fields = {
    id,
    name: unique,
    description: null,
    tags: [],
    isDeleted: 0,
    isFavorites: 0,
    createdAt: now,
    updatedAt: now,
    folderId: folderPath === '' ? null : await folderIdOf(root, folderPath),
  }
  if (asTask) {
    fields.type = 'task'
    fields.status = 'todo'
  }
  const text = `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${formatScalar(v)}`).join('\n')}\n---\n${body}`

  await mkdir(dirname(file), { recursive: true })
  // wx：同名文件已存在时失败，绝不覆盖别人的笔记。
  await writeFile(file, text, { encoding: 'utf8', flag: 'wx' })

  await updateState(root, (data) => {
    data.counters.noteId = Math.max(data.counters.noteId ?? 0, id)
    data.notes = data.notes ?? []
    data.notes.push({ filePath: relPath.split(sep).join('/'), id })
  })
  const info = await stat(file)
  return { path: relPath, id, mtimeMs: Math.round(info.mtimeMs), size: info.size }
}

/**
 * 新建文件夹，对齐 Swift 的 createFolderReturningId：
 * 目录名即文件夹名，`.meta.yaml` 存 id / name / orderIndex / createdAt / updatedAt，
 * id 取自 state.json 的 folderId 计数器。同级重名时自动加序号，不覆盖已有目录。
 */
export async function createFolder(root, { parentPath = '', name = '' } = {}) {
  const notesRoot = join(root, 'notes')
  const parentDir = parentPath === '' ? notesRoot : join(notesRoot, parentPath)
  const siblings = await readdir(parentDir, { withFileTypes: true }).catch(() => [])
  const names = siblings
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'assets')
    .map((entry) => entry.name)
  const taken = new Set(names)
  const base = name.trim() === '' ? untitledFolderName(names) : cleanName(name, { kind: '文件夹' })
  const unique = uniqueDirName(taken, base)
  const relPath = parentPath === '' ? unique : `${parentPath}/${unique}`
  const dir = join(notesRoot, relPath)

  const state = await readState(root).catch(() => ({ data: { counters: {} } }))
  const id = ((state.data.counters ?? {}).folderId ?? 0) + 1
  const now = Date.now()
  const meta = { id, name: unique, orderIndex: names.length, createdAt: now, updatedAt: now }

  await mkdir(dir, { recursive: true })
  await writeFolderMeta(root, relPath, meta)
  await updateState(root, (data) => {
    data.counters = data.counters ?? { folderId: 0, noteId: 0, tagId: 0 }
    data.counters.folderId = Math.max(data.counters.folderId ?? 0, id)
  })
  return { path: relPath, id, name: unique, orderIndex: meta.orderIndex }
}

/**
 * 重写某个文件夹的 .meta.yaml：保留原有字段，只覆盖 patch 里的键。
 * 字段顺序按 Electron/massCode 的惯例；icon 传空表示删除这个键。
 */
async function writeFolderMeta(root, relPath, patch) {
  const dir = join(root, 'notes', relPath)
  let fields = {}
  try {
    const text = await readFile(join(dir, FOLDER_META), 'utf8')
    fields = parseNote(`${FRONTMATTER_FENCE}\n${text}\n${FRONTMATTER_FENCE}\n`).fields
  } catch {
    fields = {}
  }
  const merged = { ...fields, ...patch }
  if (merged.icon === null || merged.icon === undefined || merged.icon === '') delete merged.icon
  merged.updatedAt = patch.updatedAt ?? Date.now()
  const order = ['id', 'name', 'icon', 'orderIndex', 'createdAt', 'updatedAt']
  const lines = []
  for (const key of order) {
    if (key in merged) lines.push(`${key}: ${formatScalar(merged[key])}`)
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!order.includes(key)) lines.push(`${key}: ${formatScalar(value)}`)
  }
  await writeFile(join(dir, FOLDER_META), `${lines.join('\n')}\n`, 'utf8')
}

/**
 * 重命名文件夹，对齐 Swift 的 renameFolder：
 * 同级重名直接拒绝；移动目录后把 state.json 里所有以旧路径开头的 filePath 改掉，
 * 再在新目录写一份 .meta.yaml（id / icon / orderIndex / createdAt 都保留）。
 * 笔记 frontmatter 里的 folderId 不用动——文件夹 id 没变。
 */
export async function renameFolder(root, { path, name }) {
  const next = cleanName(name, { kind: '文件夹' })
  if (next === '') throw new Error('文件夹名不能为空')
  if (!path) throw new Error('不能重命名根目录')
  const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const target = parentPath === '' ? next : `${parentPath}/${next}`
  if (target === path) return { path, name: next, renamed: false }

  const notesRoot = join(root, 'notes')
  const exists = await stat(join(notesRoot, target)).then(() => true).catch(() => false)
  if (exists) throw new Error('同级已存在同名文件夹')

  const from = join(notesRoot, path)
  const to = join(notesRoot, target)
  await rename(from, to)

  await updateState(root, (data) => {
    const prefix = `${path}/`
    for (const item of data.notes ?? []) {
      if (typeof item.filePath === 'string' && item.filePath.startsWith(prefix)) {
        item.filePath = target + item.filePath.slice(path.length)
      }
    }
  })
  await writeFolderMeta(root, target, { name: next })
  return { path: target, name: next, renamed: true }
}

/** 换图标：直接写 .meta.yaml 的 icon（emoji 或 material:/lucide: 值），空值表示清掉。 */
export async function setFolderIcon(root, { path, icon }) {
  if (!path) throw new Error('不能给根目录设图标')
  const value = String(icon ?? '').trim()
  await writeFolderMeta(root, path, { icon: value === '' ? null : value })
  return { path, icon: value }
}

/**
 * 笔记重命名：改 frontmatter 的 name，并把文件名一起改掉（两者不同步时另两个客户端会懵）。
 * state.json 里的 filePath 映射同步更新，否则按路径找 id 的地方会断。
 */
export async function renameNote(root, { path, name }) {
  const base = cleanName(name, { kind: '笔记', stripMd: true })
  if (base === '') throw new Error('笔记名不能为空')
  const note = await readNote(root, path)
  const folderPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const current = (path.split('/').pop() ?? '').replace(/\.md$/iu, '')
  if (base === current && note.meta.name === base) return { path, name: base, renamed: false }

  const targetPath = folderPath === '' ? `${base}.md` : `${folderPath}/${base}.md`
  if (targetPath !== path) {
    const taken = await stat(join(root, 'notes', targetPath)).then(() => true).catch(() => false)
    if (taken) throw new Error('这个文件夹里已经有同名笔记')
  }
  await writeNote(root, path, { fields: { name: base, updatedAt: Date.now() }, expectedMtimeMs: note.mtimeMs })
  if (targetPath !== path) {
    await rename(join(root, 'notes', path), join(root, 'notes', targetPath))
    await updateState(root, (data) => {
      for (const item of data.notes ?? []) {
        if (item.filePath === path) item.filePath = targetPath
      }
    })
  }
  return { path: targetPath, name: base, renamed: true }
}

/** 删除（进回收站）：和 massCode 一致——文件挪进 notes/.masscode/trash/，同时标 isDeleted: 1。 */
export async function deleteNote(root, { path }) {
  if (!path) throw new Error('path 不能为空')
  const note = await readNote(root, path)
  if (note.meta.isDeleted) return { path, deleted: false, already: true }
  const trashDir = join(root, 'notes', '.masscode', 'trash')
  await mkdir(trashDir, { recursive: true })
  const base = (path.split('/').pop() ?? 'note').replace(/\.md$/iu, '')
  const unique = await uniqueNoteName(root, '.masscode/trash', base)
  const targetPath = `.masscode/trash/${unique}.md`
  await rename(join(root, 'notes', path), join(root, 'notes', targetPath))
  const moved = await stat(join(root, 'notes', targetPath))
  await writeNote(root, targetPath, {
    fields: { isDeleted: 1, updatedAt: Date.now() },
    expectedMtimeMs: Math.round(moved.mtimeMs),
  })
  await updateState(root, (data) => {
    for (const item of data.notes ?? []) {
      if (item.filePath === path) item.filePath = targetPath
    }
  })
  return { path: targetPath, deleted: true }
}

/** 回收站里有什么：把 notes/.masscode/trash 下的笔记列出来，顺手把 folderId 还原成原文件夹名。 */
export async function listTrash(root) {
  const dir = join(root, 'notes', '.masscode', 'trash')
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { entries: [] }
  }
  const scanned = await scanVault(root).catch(() => ({ folders: [] }))
  const byId = new Map()
  for (const folder of scanned.folders ?? []) {
    if (folder.id !== null && folder.id !== undefined) byId.set(folder.id, folder.path)
  }
  const out = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.md$/iu.test(entry.name)) continue
    const path = `.masscode/trash/${entry.name}`
    try {
      const note = await readNote(root, path)
      out.push({
        path,
        name: note.meta.name,
        folderId: note.meta.folderId,
        folderPath: note.meta.folderId !== null && byId.has(note.meta.folderId) ? byId.get(note.meta.folderId) : null,
        deletedAt: note.meta.updatedAt,
        size: note.size,
      })
    } catch {
      // 单篇坏了不影响整个列表
    }
  }
  out.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  return { entries: out }
}

/** 从回收站恢复：按 folderId 找回原文件夹（没了就回根目录），重名自动加序号，清掉 isDeleted。 */
export async function restoreNote(root, { path }) {
  if (!String(path ?? '').startsWith('.masscode/trash/')) throw new Error('只能恢复回收站里的笔记')
  const note = await readNote(root, path)
  const scanned = await scanVault(root).catch(() => ({ folders: [] }))
  const byId = new Map()
  for (const folder of scanned.folders ?? []) {
    if (folder.id !== null && folder.id !== undefined) byId.set(folder.id, folder.path)
  }
  const folderPath = note.meta.folderId !== null && byId.has(note.meta.folderId) ? byId.get(note.meta.folderId) : ''
  const base = note.meta.name || (path.split('/').pop() ?? 'note').replace(/\.md$/iu, '')
  const unique = await uniqueNoteName(root, folderPath, base)
  const targetPath = folderPath === '' ? `${unique}.md` : `${folderPath}/${unique}.md`
  await mkdir(join(root, 'notes', folderPath), { recursive: true })
  await writeNote(root, path, {
    fields: { isDeleted: 0, updatedAt: Date.now(), name: unique, folderId: note.meta.folderId },
    expectedMtimeMs: note.mtimeMs,
  })
  await rename(join(root, 'notes', path), join(root, 'notes', targetPath))
  await updateState(root, (data) => {
    for (const item of data.notes ?? []) {
      if (item.filePath === path) item.filePath = targetPath
    }
  })
  return { path: targetPath, name: unique, folderPath }
}

/** 彻底删除：直接从 trash 里删文件，state.json 里的条目也去掉。 */
export async function purgeNote(root, { path }) {
  if (!String(path ?? '').startsWith('.masscode/trash/')) throw new Error('只能彻底删除回收站里的笔记')
  await rm(join(root, 'notes', path), { force: true })
  await updateState(root, (data) => {
    data.notes = (data.notes ?? []).filter((item) => item.filePath !== path)
  })
  return { path }
}

/** 清空回收站：trash 下的 .md 全删掉，state.json 对应条目一起去掉。 */
export async function emptyTrash(root) {
  const dir = join(root, 'notes', '.masscode', 'trash')
  const names = await readdir(dir).catch(() => [])
  let removed = 0
  for (const name of names) {
    if (!/\.md$/iu.test(name)) continue
    await rm(join(dir, name), { force: true }).catch(() => {})
    removed += 1
  }
  await updateState(root, (data) => {
    data.notes = (data.notes ?? []).filter(
      (item) => typeof item.filePath !== 'string' || !item.filePath.startsWith('.masscode/trash/'),
    )
  })
  return { removed }
}

/** 移动到别的文件夹：文件挪位置 + 改 folderId，重名时自动加序号（和拖拽行为一致）。 */
export async function moveNote(root, { path, folderPath = '' }) {
  const note = await readNote(root, path)
  const fromFolder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const targetFolder = String(folderPath ?? '').replace(/^\/+|\/+$/gu, '')
  if (targetFolder === fromFolder) return { path, moved: false }
  const base = (path.split('/').pop() ?? 'note').replace(/\.md$/iu, '')
  const unique = await uniqueNoteName(root, targetFolder, base)
  const targetPath = targetFolder === '' ? `${unique}.md` : `${targetFolder}/${unique}.md`
  const folderId = targetFolder === '' ? null : await folderIdOf(root, targetFolder)
  await mkdir(join(root, 'notes', targetFolder), { recursive: true })
  await writeNote(root, path, {
    fields: { name: unique, folderId, updatedAt: Date.now() },
    expectedMtimeMs: note.mtimeMs,
  })
  await rename(join(root, 'notes', path), join(root, 'notes', targetPath))
  await updateState(root, (data) => {
    for (const item of data.notes ?? []) {
      if (item.filePath === path) item.filePath = targetPath
    }
  })
  return { path: targetPath, moved: true, renamed: unique !== base }
}

/** 勾选/取消任务：只认 todo / doing / done 三个值（massCode 的 status 就是这三个）。 */
export async function setNoteStatus(root, { path, status }) {
  if (!['todo', 'doing', 'done'].includes(status)) throw new Error(`未知的任务状态：${String(status)}`)
  const note = await readNote(root, path)
  if (!note.meta.isTask) throw new Error('这不是任务笔记')
  await writeNote(root, path, { fields: { status, updatedAt: Date.now() }, expectedMtimeMs: note.mtimeMs })
  return { path, status }
}

/** 笔记 ⇄ 任务：转任务补 type/status，转回笔记把任务字段删掉（serializeNote 支持删键）。 */
export async function setNoteKind(root, { path, isTask }) {
  const note = await readNote(root, path)
  const now = Date.now()
  if (isTask === true) {
    if (note.meta.isTask) return { path, isTask: true, changed: false }
    await writeNote(root, path, {
      fields: { type: 'task', status: note.meta.taskStatus ?? 'todo', updatedAt: now },
      expectedMtimeMs: note.mtimeMs,
    })
    return { path, isTask: true, changed: true }
  }
  if (!note.meta.isTask) return { path, isTask: false, changed: false }
  await writeNote(root, path, {
    fields: { type: undefined, status: undefined, priority: undefined, due: undefined, updatedAt: now },
    expectedMtimeMs: note.mtimeMs,
  })
  return { path, isTask: false, changed: true }
}

/**
 * 调整顺序：order 是同文件夹里的完整有序路径列表，按顺序写 orderIndex = 0,1,2…
 * 只改真的变了的那些；不碰 updatedAt（换顺序不算编辑）。
 */
export async function reorderNotes(root, { folderPath = '', order = [] }) {
  const folder = String(folderPath ?? '').replace(/^\/+|\/+$/gu, '')
  const list = Array.isArray(order) ? order.map((item) => String(item)) : []
  let index = 0
  let written = 0
  for (const path of list) {
    if (folder === '') {
      if (path.includes('/')) continue
    } else if (!path.startsWith(`${folder}/`)) {
      continue
    }
    let note
    try {
      note = await readNote(root, path)
    } catch {
      continue
    }
    const current = typeof note.fields.orderIndex === 'number' ? note.fields.orderIndex : null
    if (current !== index) {
      await writeNote(root, path, { fields: { orderIndex: index }, expectedMtimeMs: note.mtimeMs })
      written += 1
    }
    index += 1
  }
  return { folderPath: folder, count: index, written }
}

/** 移动文件夹：改父级并同步 state.json 里的所有路径前缀；禁止移到自己或子孙下面。 */
export async function moveFolder(root, { path, parentPath = '' }) {
  if (!path) throw new Error('不能移动根目录')
  const target = String(parentPath ?? '').replace(/^\/+|\/+$/gu, '')
  if (target === path || target.startsWith(`${path}/`)) throw new Error('不能移动到它自己或它的子文件夹里')
  const name = path.split('/').pop() ?? ''
  const toPath = target === '' ? name : `${target}/${name}`
  if (toPath === path) return { path, moved: false }
  const exists = await stat(join(root, 'notes', toPath)).then(() => true).catch(() => false)
  if (exists) throw new Error('目标文件夹里已有同名文件夹')
  await mkdir(join(root, 'notes', target), { recursive: true })
  await rename(join(root, 'notes', path), join(root, 'notes', toPath))
  await updateState(root, (data) => {
    const prefix = `${path}/`
    for (const item of data.notes ?? []) {
      if (typeof item.filePath === 'string' && item.filePath.startsWith(prefix)) {
        item.filePath = toPath + item.filePath.slice(path.length)
      }
    }
  })
  return { path: toPath, moved: true }
}

/** 删除文件夹：里面的笔记先全部进回收站（标 isDeleted），再删掉目录。 */
export async function deleteFolder(root, { path }) {
  if (!path) throw new Error('不能删除根目录')
  const files = []
  async function walk(rel) {
    const entries = await readdir(join(root, 'notes', rel), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const childRel = `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== 'assets') await walk(childRel)
        continue
      }
      if (/\.md$/iu.test(entry.name)) files.push(childRel)
    }
  }
  await walk(path)
  let moved = 0
  for (const file of files) {
    try {
      await deleteNote(root, { path: file })
      moved += 1
    } catch {
      // 单篇失败不挡住整个删除，最后目录一样会删掉
    }
  }
  await rm(join(root, 'notes', path), { recursive: true, force: true })
  return { path, moved }
}

/** 「未命名文件夹 N」：和 Swift 的 nextUntitledFolderName 同样从 2 开始数。 */
function untitledFolderName(names) {
  const base = '未命名文件夹'
  let maxIndex = 0
  for (const item of names) {
    const match = item.match(/^未命名文件夹(?:\s+(\d+))?$/)
    if (!match) continue
    if (match[1] === undefined) maxIndex = Math.max(maxIndex, 1)
    else maxIndex = Math.max(maxIndex, Number(match[1]) || 0)
  }
  return `${base} ${maxIndex + 1}`
}

/** 同名时补 " 2"、" 3"…；和笔记的 uniqueNoteName 保持一致的观感。 */
function uniqueDirName(taken, base) {
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

/** frontmatter 里的 folderId 用文件夹 .meta.yaml 的 id，找不到就给 null。 */
async function folderIdOf(root, folderPath) {
  const meta = await readFolderMeta(join(root, 'notes', folderPath))
  return meta.id
}

/**
 * 笔记图片：正文写 masscode://notes-asset/<文件名>，文件在 notes/assets/。
 * 只按文件名取（不收路径），名字走白名单，避免越权读任意文件；超过 8 MB 的图不返回。
 */
const ASSET_NAME = /^[A-Za-z0-9._-]+$/
const ASSET_MAX_BYTES = 8 * 1024 * 1024
const ASSET_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp',
}

export function assetMime(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return ASSET_MIME[ext] ?? 'application/octet-stream'
}

/** 报告每张图的大小，前端据此决定"直接加载"还是"点一下再加载"。 */
export async function assetMeta(root, names) {
  const dir = join(root, 'notes', 'assets')
  const out = {}
  for (const name of names) {
    if (typeof name !== 'string' || !ASSET_NAME.test(name)) continue
    const info = await stat(join(dir, name)).catch(() => null)
    if (info === null || !info.isFile() || info.size > ASSET_MAX_BYTES) continue
    out[name] = { size: info.size, mime: assetMime(name) }
  }
  return out
}

/** MIME → 扩展名；写入只接受这几种图片。 */
const ASSET_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp',
}

/** 和 Swift 的 randomAssetId 一致：12 字节随机 → base64url 去 padding，正好 16 位。 */
export function newAssetName(ext) {
  const raw = randomBytes(12).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${raw}.${ext}`
}

/**
 * 写入一张图片（粘贴/拖拽进来的），返回磁盘名和要插进正文的 markdown。
 * 文件名规则和另两个客户端一致；写文件用 wx，绝不覆盖已有图片。
 */
export async function assetWrite(root, { mime, base64 }) {
  const ext = ASSET_EXT[String(mime ?? '').toLowerCase()]
  if (ext === undefined) throw new Error('不支持的图片类型')
  const buffer = Buffer.from(String(base64 ?? ''), 'base64')
  if (buffer.length === 0) throw new Error('图片内容为空')
  if (buffer.length > ASSET_MAX_BYTES) throw new Error(`图片超过 ${ASSET_MAX_BYTES / 1048576} MB`)
  const dir = join(root, 'notes', 'assets')
  await mkdir(dir, { recursive: true })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = newAssetName(ext)
    try {
      await writeFile(join(dir, name), buffer, { flag: 'wx' })
      return { name, size: buffer.length, markdown: `![](masscode://notes-asset/${name})` }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  throw new Error('生成图片文件名失败，请重试')
}

/** 读图返回 base64：RPC 通道是 JSON，二进制只能这么带。 */
export async function assetRead(root, names) {
  const dir = join(root, 'notes', 'assets')
  const out = {}
  for (const name of names) {
    if (typeof name !== 'string' || !ASSET_NAME.test(name)) continue
    const buffer = await readFile(join(dir, name)).catch(() => null)
    if (buffer === null || buffer.length > ASSET_MAX_BYTES) continue
    out[name] = { mime: assetMime(name), base64: buffer.toString('base64') }
  }
  return out
}

/** 先写临时文件再 rename：中途断电/崩溃不会留下半截笔记。 */
async function commit(file, text, exists) {
  const temp = `${file}.dsh-tmp-${process.pid}-${Date.now()}`
  await mkdir(dirname(file), { recursive: true })
  await writeFile(temp, text, 'utf8')
  await rename(temp, file)
  const info = await stat(file)
  return { path: file, created: !exists, mtimeMs: Math.round(info.mtimeMs), size: info.size }
}
