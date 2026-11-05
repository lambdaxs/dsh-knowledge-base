// 在临时目录里造一个迷你 vault，验证扫描 / 读 / 写回 / 新建。
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { scanVault, readNote, writeNote, createNote, createFolder, renameFolder, setFolderIcon, assetMeta, assetRead, assetWrite, parseNote, serializeNote, renameNote, deleteNote, moveNote, setNoteStatus, setNoteKind, reorderNotes, moveFolder, deleteFolder,
  listTrash, restoreNote, purgeNote, emptyTrash } from '../lib/vault.js'

const root = await mkdtemp(join(tmpdir(), 'vault-test-'))
await mkdir(join(root, 'notes', '工作待办'), { recursive: true })
await mkdir(join(root, 'notes', '.masscode'), { recursive: true })
await writeFile(join(root, 'notes', '工作待办', '.meta.yaml'), 'id: 2\nname: 工作待办\nicon: material:todo\norderIndex: 0\n')
await writeFile(join(root, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 2, noteId: 7, tagId: 0 }, folderUi: {}, notes: [], tags: [] }))
await writeFile(join(root, 'notes', '工作待办', '已有任务.md'), '---\nid: 7\nname: "已有任务"\nfolderId: 2\ntype: task\nstatus: todo\npriority: high\ndue: 2026-07-28\ntags: []\nisDeleted: 0\nisFavorites: 0\ncreatedAt: 1\nupdatedAt: 1\n---\n\n正文第一行\n\nhttps://example.com\n')

const scan = await scanVault(root)
assert.equal(scan.notes.length, 1)
assert.equal(scan.folders.length, 1)
assert.equal(scan.folders[0].id, 2)
assert.equal(scan.notes[0].isTask, true)
assert.equal(scan.notes[0].taskPriority, 'high')

const one = await readNote(root, '工作待办/已有任务.md')
assert.equal(one.meta.name, '已有任务')
assert.ok(one.body.startsWith('正文第一行'))

// 写回正文：字段保持、mtime 校验
const saved = await writeNote(root, '工作待办/已有任务.md', { body: '改过的正文\n', expectedMtimeMs: one.mtimeMs })
const again = await readNote(root, '工作待办/已有任务.md')
assert.equal(again.body.trim(), '改过的正文')
assert.equal(again.meta.taskStatus, 'todo')
assert.equal(again.meta.taskDue, '2026-07-28')
assert.equal(saved.created, false)

// mtime 冲突：用旧 mtime 再写应当失败
await assert.rejects(() => writeNote(root, '工作待办/已有任务.md', { body: 'x', expectedMtimeMs: one.mtimeMs }), /已被外部修改/)

// 新建任务
const created = await createNote(root, { folderPath: '工作待办', name: '新任务', body: '内容', asTask: true })
assert.equal(created.id, 8)
const fresh = await readNote(root, created.path)
assert.equal(fresh.meta.isTask, true)
assert.equal(fresh.meta.folderId, 2)
assert.equal(fresh.meta.taskStatus, 'todo')
const state = JSON.parse(await readFile(join(root, 'notes', '.masscode', 'state.json'), 'utf8'))
assert.equal(state.counters.noteId, 8)
assert.equal(state.notes.length, 1)

// 同名不覆盖
const second = await createNote(root, { folderPath: '工作待办', name: '新任务', body: '' })
assert.ok(second.path.includes('新任务 1.md'))

// frontmatter 往返：未知字段不能丢
const parsed = parseNote('---\nid: 3\ncustom: keep-me\nname: "名字"\n---\nbody\n')
const text = serializeNote(parsed, { ...parsed.fields, status: 'done' })
assert.ok(text.includes('custom: keep-me'))
assert.ok(text.includes('status: "done"'))
console.log('✓ 全部通过  临时 vault:', root)

// 新建文件夹：默认名、重名加序号、meta 里的 id 与计数器
{
  const root2 = await mkdtemp(join(tmpdir(), 'vault-folder-'))
  await mkdir(join(root2, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(root2, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 4, noteId: 0, tagId: 0 }, folderUi: {}, notes: [], tags: [] }))
  const a = await createFolder(root2, { name: '项目' })
  assert.equal(a.path, '项目')
  assert.equal(a.id, 5)
  const b = await createFolder(root2, { name: '项目' })
  assert.equal(b.path, '项目 2')
  const c = await createFolder(root2, {})
  assert.equal(c.name, '未命名文件夹 1')
  const meta = await readFile(join(root2, 'notes', '项目', '.meta.yaml'), 'utf8')
  assert.ok(meta.includes('id: 5') && meta.includes('name: "项目"'))
  const state = JSON.parse(await readFile(join(root2, 'notes', '.masscode', 'state.json'), 'utf8'))
  assert.equal(state.counters.folderId, 7)
  const scan2 = await scanVault(root2)
  assert.equal(scan2.folders.length, 3)
  assert.equal(scan2.folders.find((f) => f.name === '项目').id, 5)
  console.log('✓ 文件夹创建通过')
}

// 重命名：移动目录、更新 state.json 的 filePath、保留 id/icon
{
  const root3 = await mkdtemp(join(tmpdir(), 'vault-rename-'))
  await mkdir(join(root3, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(root3, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 0, noteId: 1, tagId: 0 }, folderUi: {}, notes: [{ id: 1, filePath: '旧名/笔记.md' }], tags: [] }))
  const folder = await createFolder(root3, { name: '旧名' })
  await writeFile(join(root3, 'notes', '旧名', '笔记.md'), '---\nid: 1\nname: "笔记"\nfolderId: 1\n---\n正文\n')
  const renamed = await renameFolder(root3, { path: folder.path, name: '新名' })
  assert.equal(renamed.path, '新名')
  assert.equal(renamed.renamed, true)
  const state = JSON.parse(await readFile(join(root3, 'notes', '.masscode', 'state.json'), 'utf8'))
  assert.equal(state.notes[0].filePath, '新名/笔记.md')
  const meta = await readFile(join(root3, 'notes', '新名', '.meta.yaml'), 'utf8')
  assert.ok(meta.includes('name: "新名"'))
  assert.ok(meta.includes(`id: ${folder.id}`), '重命名不能丢 id')
  // 同级重名要被拒绝
  await createFolder(root3, { name: '另一个' })
  await assert.rejects(() => renameFolder(root3, { path: '新名', name: '另一个' }), /同级已存在同名文件夹/)
  // 空名字拒绝
  await assert.rejects(() => renameFolder(root3, { path: '新名', name: '  ' }), /不能为空/)
  // 图标：写入 emoji、再清空
  await setFolderIcon(root3, { path: '新名', icon: '🧪' })
  assert.ok((await readFile(join(root3, 'notes', '新名', '.meta.yaml'), 'utf8')).includes('icon: "🧪"'))
  await setFolderIcon(root3, { path: '新名', icon: '' })
  assert.ok(!(await readFile(join(root3, 'notes', '新名', '.meta.yaml'), 'utf8')).includes('icon:'))
  const scan3 = await scanVault(root3)
  assert.equal(scan3.folders.find((f) => f.path === '新名').name, '新名')
  console.log('✓ 重命名 / 图标通过')
}

// 笔记图片：只按文件名取、白名单挡路径穿越、超大文件不返回
{
  const root4 = await mkdtemp(join(tmpdir(), 'vault-asset-'))
  await mkdir(join(root4, 'notes', 'assets'), { recursive: true })
  await mkdir(join(root4, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(root4, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 0, noteId: 0, tagId: 0 }, folderUi: {}, notes: [], tags: [] }))
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  await writeFile(join(root4, 'notes', 'assets', 'shot.png'), png)
  const meta = await assetMeta(root4, ['shot.png', 'missing.png', '../../etc/passwd'])
  assert.deepEqual(Object.keys(meta), ['shot.png'])
  assert.equal(meta['shot.png'].size, png.length)
  assert.equal(meta['shot.png'].mime, 'image/png')
  const read = await assetRead(root4, ['shot.png', '../notes/assets/shot.png'])
  assert.deepEqual(Object.keys(read), ['shot.png'])
  assert.equal(Buffer.from(read['shot.png'].base64, 'base64').length, png.length)
  console.log('✓ 图片读取通过')
}

// 粘贴图片写入：文件名规则和 Swift 一致（16 位 base64url）、不覆盖、拒绝非图片
{
  const root5 = await mkdtemp(join(tmpdir(), 'vault-assetwrite-'))
  await mkdir(join(root5, 'notes', '.masscode'), { recursive: true })
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6])
  const out = await assetWrite(root5, { mime: 'image/png', base64: png.toString('base64') })
  assert.match(out.name, /^[A-Za-z0-9_-]{16}\.png$/)
  assert.equal(out.markdown, `![](masscode://notes-asset/${out.name})`)
  assert.equal(out.size, png.length)
  const again = await assetWrite(root5, { mime: 'image/png', base64: png.toString('base64') })
  assert.notEqual(again.name, out.name, '同名不能覆盖')
  await assert.rejects(() => assetWrite(root5, { mime: 'text/plain', base64: 'aGk=' }), /不支持的图片类型/)
  await assert.rejects(() => assetWrite(root5, { mime: 'image/png', base64: '' }), /图片内容为空/)
  const big = Buffer.alloc(9 * 1024 * 1024, 1)
  await assert.rejects(() => assetWrite(root5, { mime: 'image/png', base64: big.toString('base64') }), /超过 8 MB/)
  console.log('✓ 粘贴图片写入通过')
}

// 笔记重命名 / 移动 / 删除（进回收站）/ 任务勾选 / 笔记↔任务 / 排序
{
  const r = await mkdtemp(join(tmpdir(), 'vault-ops-'))
  await mkdir(join(r, 'notes', '甲'), { recursive: true })
  await mkdir(join(r, 'notes', '乙'), { recursive: true })
  await mkdir(join(r, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(r, 'notes', '甲', '.meta.yaml'), 'id: 11\nname: 甲\n')
  await writeFile(join(r, 'notes', '乙', '.meta.yaml'), 'id: 12\nname: 乙\n')
  await writeFile(join(r, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 12, noteId: 30, tagId: 0 }, notes: [], tags: [] }))

  const a = await createNote(r, { folderPath: '甲', name: '笔记一', body: '正文 A' })
  const b = await createNote(r, { folderPath: '甲', name: '笔记二', body: '正文 B' })
  assert.equal(a.path, '甲/笔记一.md')

  // 重命名：文件名 + frontmatter name + state.json 映射
  const renamed = await renameNote(r, { path: a.path, name: '改过的名字' })
  assert.equal(renamed.path, '甲/改过的名字.md')
  assert.equal(renamed.renamed, true)
  const afterRename = await readNote(r, renamed.path)
  assert.equal(afterRename.meta.name, '改过的名字')
  assert.equal(afterRename.body.trim(), '正文 A')
  let st = JSON.parse(await readFile(join(r, 'notes', '.masscode', 'state.json'), 'utf8'))
  assert.ok(st.notes.some((n) => n.filePath === '甲/改过的名字.md'), 'state.json 的路径要跟着改')
  // 同名冲突
  await writeFile(join(r, 'notes', '甲', '占位.md'), '---\nname: "占位"\n---\n')
  await assert.rejects(() => renameNote(r, { path: b.path, name: '占位' }), /已经有同名笔记/)

  // 移动：路径 + folderId
  const moved = await moveNote(r, { path: b.path, folderPath: '乙' })
  assert.equal(moved.path, '乙/笔记二.md')
  const afterMove = await readNote(r, moved.path)
  assert.equal(afterMove.meta.folderId, 12)
  // 移到根
  const toRoot = await moveNote(r, { path: moved.path, folderPath: '' })
  assert.equal(toRoot.path, '笔记二.md')
  assert.equal((await readNote(r, '笔记二.md')).meta.folderId, null)

  // 任务：传笔记转成任务 → 勾选完成 → 再转回笔记（任务字段要消失）
  await setNoteKind(r, { path: renamed.path, isTask: true })
  const asTask = await readNote(r, renamed.path)
  assert.equal(asTask.meta.isTask, true)
  assert.equal(asTask.meta.taskStatus, 'todo')
  await setNoteStatus(r, { path: renamed.path, status: 'done' })
  assert.equal((await readNote(r, renamed.path)).meta.taskStatus, 'done')
  await assert.rejects(() => setNoteStatus(r, { path: '笔记二.md', status: 'done' }), /不是任务笔记/)
  await assert.rejects(() => setNoteStatus(r, { path: renamed.path, status: 'whatever' }), /未知的任务状态/)

  await setNoteKind(r, { path: renamed.path, isTask: false })
  const backToNote = await readNote(r, renamed.path)
  assert.equal(backToNote.meta.isTask, false)
  const raw = await readFile(join(r, 'notes', renamed.path), 'utf8')
  assert.ok(!/^type:/m.test(raw), 'type 键应当被删掉')
  assert.ok(!/^status:/m.test(raw), 'status 键应当被删掉')

  // 排序：写 orderIndex，且不碰 updatedAt
  const root2 = await createNote(r, { name: '根笔记二', body: 'R' })
  const order = ['笔记二.md', root2.path]
  const out = await reorderNotes(r, { folderPath: '', order })
  assert.equal(out.count, 2)
  const first = await readNote(r, order[0])
  const second = await readNote(r, order[1])
  assert.equal(first.fields.orderIndex, 0)
  assert.equal(second.fields.orderIndex, 1)
  console.log('✓ 重命名 / 移动 / 任务状态 / 笔记↔任务 / 排序 通过')
}

// 删除：进回收站（.masscode/trash）并标 isDeleted，state.json 指向 trash
{
  const r2 = await mkdtemp(join(tmpdir(), 'vault-del-'))
  await mkdir(join(r2, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(r2, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 0, noteId: 5, tagId: 0 }, notes: [], tags: [] }))
  const made = await createNote(r2, { name: '要删的', body: 'x' })
  const out = await deleteNote(r2, { path: made.path })
  assert.equal(out.deleted, true)
  assert.equal(out.path, '.masscode/trash/要删的.md')
  const scan2 = await scanVault(r2)
  assert.equal(scan2.notes.length, 0, '删除后不再出现在列表里')
  const st2 = JSON.parse(await readFile(join(r2, 'notes', '.masscode', 'state.json'), 'utf8'))
  assert.equal(st2.notes.find((n) => n.id === made.id).filePath, '.masscode/trash/要删的.md')
  const trashed = await readNote(r2, '.masscode/trash/要删的.md')
  assert.equal(trashed.meta.isDeleted, true)
  console.log('✓ 删除进回收站通过')
}

// 文件夹移动 / 删除
{
  const r3 = await mkdtemp(join(tmpdir(), 'vault-folders-'))
  await mkdir(join(r3, 'notes', '甲', '子'), { recursive: true })
  await mkdir(join(r3, 'notes', '乙'), { recursive: true })
  await mkdir(join(r3, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(r3, 'notes', '甲', '.meta.yaml'), 'id: 1\nname: 甲\n')
  await writeFile(join(r3, 'notes', '甲', '子', '.meta.yaml'), 'id: 2\nname: 子\n')
  await writeFile(join(r3, 'notes', '乙', '.meta.yaml'), 'id: 3\nname: 乙\n')
  await writeFile(join(r3, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 3, noteId: 10, tagId: 0 }, notes: [], tags: [] }))
  await createNote(r3, { folderPath: '甲', name: '甲笔记', body: 'a' })
  await createNote(r3, { folderPath: '甲/子', name: '子笔记', body: 'b' })

  const moved = await moveFolder(r3, { path: '甲', parentPath: '乙' })
  assert.equal(moved.path, '乙/甲')
  const scanned = await scanVault(r3)
  const paths = scanned.notes.map((n) => `${n.folderPath}/${n.name}`).sort()
  assert.deepEqual(paths, ['乙/甲/子/子笔记', '乙/甲/甲笔记'])
  const st3 = JSON.parse(await readFile(join(r3, 'notes', '.masscode', 'state.json'), 'utf8'))
  assert.ok(st3.notes.every((n) => !n.filePath.startsWith('甲/')), 'state.json 里的前缀要一起改')
  await assert.rejects(() => moveFolder(r3, { path: '乙/甲', parentPath: '乙/甲/子' }), /不能移动到它自己/)

  const del = await deleteFolder(r3, { path: '乙/甲' })
  assert.equal(del.moved, 2)
  const after = await scanVault(r3)
  assert.equal(after.notes.length, 0)
  assert.ok(!after.folders.some((f) => f.path.startsWith('乙/甲')), '目录要被删掉')
  console.log('✓ 文件夹移动 / 删除通过')
}

// 回收站：列出 / 恢复 / 彻底删除 / 清空
{
  const r4 = await mkdtemp(join(tmpdir(), 'vault-trash-'))
  await mkdir(join(r4, 'notes', '项目'), { recursive: true })
  await mkdir(join(r4, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(r4, 'notes', '项目', '.meta.yaml'), 'id: 7\nname: 项目\n')
  await writeFile(join(r4, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 7, noteId: 40, tagId: 0 }, notes: [], tags: [] }))
  const one = await createNote(r4, { folderPath: '项目', name: '甲', body: 'A' })
  const two = await createNote(r4, { folderPath: '项目', name: '乙', body: 'B' })
  const three = await createNote(r4, { folderPath: '项目', name: '丙', body: 'C' })
  await deleteNote(r4, { path: one.path })
  await deleteNote(r4, { path: two.path })
  await deleteNote(r4, { path: three.path })

  const listed = await listTrash(r4)
  assert.equal(listed.entries.length, 3)
  const first = listed.entries.find((item) => item.name === '甲')
  assert.equal(first.folderPath, '项目', '原文件夹要还原出来')

  const restored = await restoreNote(r4, { path: first.path })
  assert.equal(restored.path, '项目/甲.md')
  assert.equal(restored.folderPath, '项目')
  const back = await readNote(r4, '项目/甲.md')
  assert.equal(back.meta.isDeleted, false)
  assert.equal((await listTrash(r4)).entries.length, 2)

  const secondPath = listed.entries.find((item) => item.name === '乙').path
  const purged = await purgeNote(r4, { path: secondPath })
  assert.equal(purged.path, secondPath)
  assert.equal((await listTrash(r4)).entries.length, 1)

  const emptied = await emptyTrash(r4)
  assert.equal(emptied.removed, 1)
  assert.equal((await listTrash(r4)).entries.length, 0)
  const state4 = JSON.parse(await readFile(join(r4, 'notes', '.masscode', 'state.json'), 'utf8'))
  assert.ok(!state4.notes.some((n) => String(n.filePath).startsWith('.masscode/trash/')), 'state.json 里的回收站条目要清掉')
  console.log('✓ 回收站 列出 / 恢复 / 彻底删除 / 清空 通过')
}

// 名字里的 / 不能当路径用：创建/重命名都必须明确拒绝，而不是悄悄建子文件夹或吞字符。
{
  const r5 = await mkdtemp(join(tmpdir(), 'vault-name-'))
  await mkdir(join(r5, 'notes', '.masscode'), { recursive: true })
  await writeFile(join(r5, 'notes', '.masscode', 'state.json'), JSON.stringify({ version: 1, counters: { folderId: 0, noteId: 0, tagId: 0 }, folderUi: {}, notes: [], tags: [] }))

  await assert.rejects(createNote(r5, { name: '产品/需求' }), /不能包含/)
  await assert.rejects(createNote(r5, { name: '产品\\需求' }), /不能包含/)
  await assert.rejects(createNote(r5, { name: '.隐藏的' }), /不能以 \. 开头/)
  await assert.rejects(createNote(r5, { name: '带\u0001控制符' }), /控制字符/)
  await assert.rejects(createNote(r5, { name: 'x'.repeat(201) }), /太长/)
  await assert.rejects(createFolder(r5, { name: 'A/B' }), /不能包含/)
  await assert.rejects(createFolder(r5, { name: 'A\\B' }), /不能包含/)

  // 合法的照常建，扩展名照旧去掉，空名字仍有默认值
  const okNote = await createNote(r5, { name: '正常标题.md' })
  assert.equal(okNote.path, '正常标题.md')
  const untitled = await createNote(r5, { name: '   ' })
  assert.equal(untitled.path, '未命名笔记.md')
  const okFolder = await createFolder(r5, { name: '产品输出' })
  assert.equal(okFolder.path, '产品输出')

  // 重命名也必须拒绝，不能像以前那样静默删掉斜杠
  await assert.rejects(renameNote(r5, { path: '正常标题.md', name: '改/名' }), /不能包含/)
  assert.equal((await readNote(r5, '正常标题.md')).meta.name, '正常标题')
  await assert.rejects(renameFolder(r5, { path: '产品输出', name: 'B/C' }), /不能包含/)
  const renamed = await renameNote(r5, { path: '正常标题.md', name: '改好的名字' })
  assert.equal(renamed.path, '改好的名字.md')
  console.log('✓ 名字里的 / 一律拒绝（创建/重命名/文件夹）通过')
}
