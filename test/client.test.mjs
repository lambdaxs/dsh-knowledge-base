// 客户端模块的结构与「问 DSH」路径测试：不渲染 React，只验证 loader 契约、
// 插槽注册参数、以及 startSession 拿到的草稿内容。
import assert from 'node:assert/strict'

let captured = null
globalThis.window = { __ModuleLoader__: { load: (definition) => { captured = definition } } }
globalThis.document = { createElement: () => ({ dataset: {}, remove() {}, append() {} }), head: { append() {} } }

await import('../lib/client.js')
assert.ok(captured, 'ModuleLoader.load 未被调用')
assert.equal(captured.id, 'dsh-knowledge-base')

const component = (name) => { const Stub = () => null; Stub.displayName = name; return Stub }
const primitives = {
  Button: component('Button'), Input: component('Input'), MarkdownText: component('MarkdownText'),
  writeClipboard: async () => {},
  IconSearchOutlineRegular: component('IconSearch'), IconRefreshOutlineRegular: component('IconRefresh'),
  IconPlusOutlineRegular: component('IconPlus'), IconChevronDownOutlineRegular: component('ChevronDown'),
  IconChevronRightOutlineRegular: component('ChevronRight'), IconFolderOpenRegular: component('FolderOpen'),
  IconFolderCloseRegular: component('FolderClose'), IconListPenOutlineRegular: component('ListPen'),
  IconSendOutlineRegular: component('Send'),
}
const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'),
  useState: (v) => [v, () => {}], useEffect: () => {}, useMemo: (fn) => fn(), useRef: (v) => ({ current: v }), useCallback: (fn) => fn,
}
const requireStub = (id) => {
  if (id === 'react') return react
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected require(${id})`)
}

const exports_ = captured.factory(requireStub)
assert.equal(typeof exports_.apply, 'function')
assert.deepEqual(exports_.inject, ['slots', 'connection', 'uiWorkspace'])

// 假的宿主 ctx：只实现用到的三个口子。
const registrations = []
const seatsInjected = []
const services = {
  connection: { rpc: { call: async () => ({ ok: true, value: { notes: [], folders: [] } }) } },
  uiWorkspace: { startSession: (workspaceId, options) => { services.uiWorkspace.calls.push({ workspaceId, options }) }, calls: [] },
}
const ctx = {
  get: (name) => services[name],
  effect: () => () => {},
  slots: {
    inject: (seat, fn) => { seatsInjected.push(seat); fn() },
    register: (definition, renderer) => { registrations.push({ definition, renderer }) },
  },
}
exports_.apply(ctx)
assert.deepEqual(seatsInjected.sort(), ['main', 'sidebar.panellist'])
assert.equal(registrations.length, 2)
const main = registrations.find((item) => item.definition.name === 'main')
const panel = registrations.find((item) => item.definition.name === 'sidebar.panellist')
assert.equal(main.definition.key, 'knowledge-base')
assert.equal(panel.definition.id, 'knowledge-base')

// inject() 给的 props 必须包含 call 与 openChat
const props = main.definition.inject()
assert.equal(typeof props.call, 'function')
assert.equal(typeof props.openChat, 'function')

// 「问 DSH」应该开一个新会话，草稿里带路径与正文
const note = { path: '工作待办/示例.md', meta: { name: '示例笔记', isTask: true, taskStatus: 'todo', taskDue: '2026-08-01' }, body: '正文内容 consul' }
props.openChat(note)
assert.equal(services.uiWorkspace.calls.length, 1)
const draft = services.uiWorkspace.calls[0].options.prompt
assert.ok(draft.includes('示例笔记'), '草稿缺标题')
assert.ok(draft.includes('notes/工作待办/示例.md'), '草稿缺路径')
assert.ok(draft.includes('正文内容 consul'), '草稿缺正文')
assert.ok(draft.trim().endsWith('请基于上面这篇笔记回答：'), '草稿缺提问引导')

// uiWorkspace 不可用时要退化成剪贴板而不是抛错
let copied = null
primitives.writeClipboard = async (text) => { copied = text }
delete services.uiWorkspace
props.openChat(note)
await new Promise((resolve) => setTimeout(resolve, 0))
assert.ok(copied !== null && copied.includes('正文内容 consul'), '兜底没有复制草稿')

// 纯函数：列表排序（未完成在前、已完成沉底；组内按 orderIndex，再按 updatedAt 倒序）
const { sortNotes, isDoneTask, composePrompt, unwrap, extractAssetNames, assetNameOf } = exports_.testables
assert.equal(isDoneTask({ isTask: true, taskStatus: 'done' }), true)
assert.equal(isDoneTask({ isTask: true, taskStatus: 'todo' }), false)
assert.equal(isDoneTask({ isTask: false }), false)
const ordered = sortNotes([
	{ path: 'c.md', name: 'C', isTask: true, taskStatus: 'done', orderIndex: 0, updatedAt: 10 },
	{ path: 'b.md', name: 'B', isTask: false, orderIndex: 2, updatedAt: 30 },
	{ path: 'a.md', name: 'A', isTask: false, orderIndex: 1, updatedAt: 20 },
	{ path: 'n.md', name: 'N', isTask: false, orderIndex: null, updatedAt: 99 },
])
assert.deepEqual(ordered.map((item) => item.path), ['a.md', 'b.md', 'n.md', 'c.md'])
assert.equal(unwrap({ ok: true, value: 42 }), 42)
assert.throws(() => unwrap({ ok: false, error: { message: '坏了' } }), /坏了/)
// 图片引用解析：自定义协议去重、wiki 内嵌兼容、目标里取文件名
const body = '![a](masscode://notes-asset/one.png)\n![](masscode://notes-asset/one.png)\n![](masscode://notes-asset/two.png)\n![[three.png]]\n![](https://example.com/x.png)'
assert.deepEqual(extractAssetNames(body), ['one.png', 'two.png', 'three.png'])
assert.equal(assetNameOf('masscode://notes-asset/one.png'), 'one.png')
assert.equal(assetNameOf('https://host/x.png'), null)
assert.equal(assetNameOf('masscode://notes-asset/a%20b.png'), 'a b.png')
console.log('✓ 客户端模块结构 / 插槽注册 / 问 DSH 草稿 / 列表排序 / 图片引用 全部通过')
