// 知识库页面的客户端源码（构建产物是 lib/client.js，由 scripts/build-client.mjs 生成）。
//
// 依赖：react / react-dom / primitives 由 DSH 的模块表提供（external），
// 编辑器（CodeMirror 6 + @atomic-editor/editor）打进这个 bundle。

import * as react from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'



		const h = react.createElement
		const { useState, useEffect, useMemo, useRef, useCallback } = react
		const { Button, Input, MarkdownText, IconSearchOutlineRegular, IconRefreshOutlineRegular, IconPlusOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconFolderOpenRegular, IconFolderCloseRegular, IconListPenOutlineRegular, IconSendOutlineRegular } = primitives

		// 声明的服务名：cordis 会等这些服务就绪再激活；uiWorkspace 用来开新会话。
		const inject = ['slots', 'connection', 'uiWorkspace']
		const CHANNEL = '/knowledge-base'
		const TODAY = () => {
			const now = new Date()
			const pad = (n) => String(n).padStart(2, '0')
			return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
		}

		const STYLE = `
/* 这一层必须是"零溢出"的：它的宽度一旦撑出去，App 的 frame 会被量宽，
   视口宽度可能跨过侧栏自动折叠的 1024 断点，导致左侧栏反复折叠。 */
[data-kb] {
  position: relative;
  display: flex; height: 100%; width: 100%; min-width: 0; min-height: 0; overflow: hidden;
  font: inherit; color: var(--bt-ink, inherit);
  /* 本地 token：靠近 macOS 的观感，宿主给了 --bt-* 就跟着走 */
  --kb-line: var(--bt-line, rgba(0, 0, 0, .10));
  --kb-line-soft: color-mix(in srgb, var(--kb-line) 55%, transparent);
  --kb-card: var(--bt-card, rgba(127, 127, 127, .10));
  --kb-hover: rgba(127, 127, 127, .09);
  --kb-active: color-mix(in srgb, var(--bt-accent, #0a84ff) 14%, transparent);
  --kb-ink-2: var(--bt-ink-2, #6e6e73);
  --kb-ink-3: var(--bt-ink-3, #86868b);
  --kb-accent: var(--bt-accent, #0a84ff);
  --kb-danger: var(--bt-danger, #ff453a);
  --kb-green: var(--bt-green, #30d158);
  --kb-radius: 10px;
  --kb-radius-sm: 7px;
  --kb-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
}
[data-kb] * { box-sizing: border-box; }
[data-kb] button, [data-kb] input { font-family: var(--kb-font); }
[data-kb] .kb-col { display: flex; flex-direction: column; min-height: 0; }
[data-kb] .kb-tree { width: clamp(170px, 18vw, 220px); flex: 0 0 auto; min-width: 0; border-right: 1px solid var(--kb-line-soft); padding: 10px 8px; overflow: auto; }
[data-kb] .kb-list { width: clamp(224px, 26vw, 320px); flex: 0 0 auto; min-width: 0; border-right: 1px solid var(--kb-line-soft); }

/* ---- 行（文件夹 / 列表通用） ---- */
[data-kb] .kb-row { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 28px; padding: 4px 8px; border: 0; border-radius: var(--kb-radius-sm); background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
[data-kb] .kb-row:hover { background: var(--kb-hover); }
[data-kb] .kb-row[data-active="true"] { background: var(--kb-active); }
[data-kb] .kb-row .kb-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
[data-kb] .kb-count { color: var(--kb-ink-3); font-size: 11px; font-variant-numeric: tabular-nums; }
[data-kb] .kb-ficon { font-size: 13px; line-height: 1; flex: none; }
.kb-folder-actions { opacity: 0; transition: opacity .12s ease; }
[data-kb] .kb-row:hover .kb-folder-actions { opacity: 1; }
@media (hover: none) { [data-kb] .kb-folder-actions { opacity: 1; } }

/* ---- 工具栏 ---- */
[data-kb] .kb-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--kb-line-soft); }
[data-kb] .kb-toolbar .kb-grow, [data-kb] .kb-newbar .kb-grow { flex: 1 1 0; min-width: 0; }
/* 宿主 Input 自带宽度，flex 里要压住它，否则会把右边的筛选/按钮挤出去 */
[data-kb] .kb-grow > * { width: 100%; min-width: 0; box-sizing: border-box; }
[data-kb] .kb-newbar { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--kb-line-soft); }
[data-kb] .kb-icon-btn { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; border: 0; background: transparent; color: var(--kb-ink-2); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
[data-kb] .kb-icon-btn:hover { background: var(--kb-hover); color: inherit; }
[data-kb] .kb-icon-btn[data-on="true"] { background: var(--kb-card); color: inherit; }
[data-kb] .kb-icon-btn.kb-icon-none { font-size: 11px; }
[data-kb] .kb-chip { height: 26px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--kb-line); background: transparent; color: var(--kb-ink-2); font-size: 12px; cursor: pointer; white-space: nowrap; }
[data-kb] .kb-chip:hover { background: var(--kb-hover); color: inherit; }
[data-kb] .kb-chip[data-on="true"] { background: var(--kb-active); border-color: transparent; color: var(--kb-accent); font-weight: 600; }
[data-kb] .kb-chip:disabled { opacity: .5; cursor: default; }

/* ---- 列表项 ---- */
[data-kb] .kb-scroll { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
[data-kb] .kb-item-wrap { position: relative; display: flex; align-items: stretch; border-radius: var(--kb-radius); }
[data-kb] .kb-item-wrap:hover { background: var(--kb-hover); }
[data-kb] .kb-item-wrap[data-active="true"] { background: var(--kb-active); }
[data-kb] .kb-item-wrap[data-done="true"] { opacity: .55; }
[data-kb] .kb-item-wrap[data-dragging="true"] { opacity: .4; }
[data-kb] .kb-item { flex: 1; min-width: 0; display: block; padding: 8px 4px 8px 10px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
[data-kb] .kb-item-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; line-height: 20px; }
[data-kb] .kb-item-sub { display: flex; align-items: center; gap: 8px; margin-top: 2px; font-size: 11.5px; color: var(--kb-ink-3); }
[data-kb] .kb-item-wrap[data-done="true"] .kb-name { text-decoration: line-through; text-decoration-color: var(--kb-ink-3); }
[data-kb] .kb-check { width: 17px; height: 17px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: 1.5px solid var(--kb-line); background: transparent; color: #fff; cursor: pointer; transition: background .12s ease, border-color .12s ease; }
[data-kb] .kb-check[aria-checked="true"] { background: var(--kb-accent); border-color: var(--kb-accent); }
[data-kb] .kb-check-mark { font-size: 11px; line-height: 1; }
[data-kb] .kb-more { width: 24px; flex: none; align-self: center; margin-right: 4px; border: 0; border-radius: 6px; background: transparent; color: var(--kb-ink-3); font-size: 15px; line-height: 1; cursor: pointer; opacity: 0; transition: opacity .12s ease; }
[data-kb] .kb-item-wrap:hover .kb-more, [data-kb] .kb-item-wrap[data-active="true"] .kb-more { opacity: 1; }
[data-kb] .kb-more:hover { background: var(--kb-card); color: inherit; }
@media (hover: none) { [data-kb] .kb-more { opacity: 1; } }
[data-kb] .kb-due[data-late="true"] { color: var(--kb-danger); }

/* ---- 详情头 ---- */
[data-kb] .kb-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--kb-line-soft); }
[data-kb] .kb-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
[data-kb] .kb-dirty { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--kb-accent); }
[data-kb] .kb-save { height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--kb-accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
[data-kb] .kb-save:hover { filter: brightness(1.05); }
[data-kb] .kb-save:disabled { opacity: .5; cursor: default; }
[data-kb] .kb-undo { height: 28px; padding: 0 12px; border: 1px solid var(--kb-line); border-radius: 999px; background: transparent; color: var(--kb-ink-2); font-size: 13px; cursor: pointer; }
[data-kb] .kb-undo:hover { background: var(--kb-hover); color: inherit; }
[data-kb] .kb-meta { display: flex; gap: 8px; flex-wrap: wrap; padding: 8px 14px; font-size: 12px; color: var(--kb-ink-3); border-bottom: 1px solid var(--kb-line-soft); }
[data-kb] .kb-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 18px; }
[data-kb] .kb-back { display: none; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; }
[data-kb] .kb-back:hover { background: var(--kb-hover); }

/* ---- 右键 / ⋯ 菜单 ---- */
[data-kb] .kb-menu { position: fixed; z-index: 60; padding: 6px; border-radius: 12px; border: 1px solid var(--kb-line); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #fff) 92%, transparent); -webkit-backdrop-filter: saturate(180%) blur(18px); backdrop-filter: saturate(180%) blur(18px); box-shadow: 0 12px 32px rgba(0, 0, 0, .18), 0 2px 6px rgba(0, 0, 0, .06); }
[data-kb] .kb-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
[data-kb] .kb-menu-item:hover { background: var(--kb-hover); }
[data-kb] .kb-menu-item[data-danger="true"] { color: var(--kb-danger); }
[data-kb] .kb-menu-item:disabled { opacity: .35; cursor: default; background: transparent; }

/* ---- 对话框 / 文件夹选择器 / 图标选择 ---- */
[data-kb] .kb-modal { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .3); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
[data-kb] .kb-modal-card { width: min(520px, calc(100% - 32px)); max-height: calc(100% - 48px); overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 14px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--bt-ink, inherit); box-shadow: 0 24px 64px rgba(0, 0, 0, .3); }
[data-kb] .kb-modal-title { font-size: 15px; font-weight: 600; }
[data-kb] .kb-modal-hint { font-size: 12px; color: var(--kb-ink-2); line-height: 1.55; word-break: break-all; }
[data-kb] .kb-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
[data-kb] .kb-danger-btn { height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--kb-danger); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
[data-kb] .kb-danger-btn:disabled { opacity: .5; }
[data-kb] .kb-picker { max-height: 46vh; overflow: auto; display: flex; flex-direction: column; gap: 1px; padding: 2px; border: 1px solid var(--kb-line-soft); border-radius: 10px; }
[data-kb] .kb-pick { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
[data-kb] .kb-pick:hover { background: var(--kb-hover); }
[data-kb] .kb-pick:disabled { opacity: .35; cursor: default; background: transparent; }
[data-kb] .kb-pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-kb] .kb-pick-root { font-weight: 600; }
[data-kb] .kb-icons { display: flex; flex-wrap: wrap; gap: 3px; }
[data-kb] .kb-iconpick { display: flex; flex-direction: column; gap: 6px; }
[data-kb] .kb-iconpick-tabs { gap: 2px; }
[data-kb] .kb-iconpick .kb-icons { max-height: 168px; overflow: auto; padding-right: 2px; }

/* ---- 提示与空态 ---- */
[data-kb] .kb-tree-foot { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--kb-line-soft); display: flex; }
[data-kb] .kb-trash-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--kb-radius); }
[data-kb] .kb-trash-row:hover { background: var(--kb-hover); }
[data-kb] .kb-trash-main { flex: 1; min-width: 0; }
[data-kb] .kb-trash-name { font-size: 13.5px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-kb] .kb-trash-meta { display: flex; gap: 8px; margin-top: 2px; font-size: 11.5px; color: var(--kb-ink-3); }
[data-kb] .kb-trash-actions { display: flex; gap: 10px; flex: none; }
[data-kb] .kb-link { border: 0; background: transparent; color: var(--kb-accent); font-size: 12.5px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
[data-kb] .kb-link:hover { background: var(--kb-hover); }
[data-kb] .kb-link:disabled { opacity: .4; cursor: default; }
[data-kb] .kb-link-danger { color: var(--kb-danger); }
[data-kb] .kb-notice { padding: 6px 12px 0; font-size: 12px; color: var(--kb-ink-2); }
[data-kb] .kb-empty { padding: 24px; color: var(--kb-ink-2); font-size: 13px; line-height: 1.6; }
[data-kb] .kb-empty-center { margin: auto; text-align: center; max-width: 260px; }
[data-kb] .kb-error { padding: 8px 12px; color: var(--kb-danger); font-size: 12px; }

/* ---- 编辑器 ---- */
[data-kb] .kb-cm { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
/* 正文颜色直接用继承来的 currentColor：宿主换主题、换皮肤都不用管，
   也不会出现"浅色背景上写浅灰字"（编辑器默认配色是给深色底用的）。 */
[data-kb] .kb-cm .atomic-cm-editor {
  --atomic-editor-bg: transparent;
  --atomic-editor-bg-panel: color-mix(in srgb, currentColor 6%, transparent);
  --atomic-editor-bg-surface: color-mix(in srgb, currentColor 10%, transparent);
  --atomic-editor-fg: currentColor;
  --atomic-editor-fg-muted: color-mix(in srgb, currentColor 72%, transparent);
  --atomic-editor-fg-faint: color-mix(in srgb, currentColor 52%, transparent);
  --atomic-editor-border: color-mix(in srgb, currentColor 22%, transparent);
  --atomic-editor-accent: var(--kb-accent);
  --atomic-editor-accent-bright: var(--kb-accent);
  --atomic-editor-link: var(--kb-accent);
  --atomic-editor-code-bg: color-mix(in srgb, currentColor 8%, transparent);
}
[data-kb] .kb-cm .cm-content {
  color: inherit;
  /* 编辑器默认按 70ch 限制阅读宽度，宽屏下两边会空出一大片；这里放开用满容器 */
  --atomic-editor-measure: none;
  max-width: none;
  padding-left: 18px;
  padding-right: 18px;
}
[data-kb] .kb-cm .cm-editor { flex: 1; min-height: 0; }
[data-kb] .kb-editor { flex: 1; min-height: 0; width: 100%; resize: none; border: 0; outline: none; padding: 14px 18px; background: transparent; color: inherit; font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-kb] .kb-tree-node { display: flex; flex-direction: column; }

/* ---- 手机：单列下钻 ---- */
@media (max-width: 600px) {
  [data-kb] .kb-back { display: inline-flex; }
  [data-kb] .kb-tree { display: none; }
  [data-kb] .kb-list { width: 100%; flex: 1 1 auto; border-right: 0; }
  [data-kb] .kb-detail { display: none; }
  [data-kb][data-kb-view="detail"] .kb-list { display: none; }
  [data-kb][data-kb-view="detail"] .kb-detail { display: flex; flex-direction: column; }
  [data-kb] .kb-head { flex-wrap: wrap; }
  [data-kb] .kb-menu { position: fixed; }
}
@media (max-width: 960px) {
  [data-kb] .kb-tree { width: 140px; }
  [data-kb] .kb-list { width: 190px; }
}
`
		/** RPC 结果信封：{ ok:true, value } / { ok:false, error }。 */
		function unwrap(response) {
			if (!response || response.ok !== true) {
				const message = response && response.error && response.error.message ? response.error.message : '知识库 RPC 失败'
				throw new Error(message)
			}
			return response.value
		}

		function formatDate(ms) {
			if (typeof ms !== 'number') return ''
			const d = new Date(ms)
			const pad = (n) => String(n).padStart(2, '0')
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
		}

		/**
		 * 列表顺序：未完成在前、已完成沉底（任务勾完自动下去，取消打勾回到上面），
		 * 组内先按 orderIndex（frontmatter 里的，手动排序写的就是它），没排过的按更新时间倒序。
		 */
		function isDoneTask(note) {
			return note.isTask === true && note.taskStatus === 'done'
		}

		function sortNotes(list) {
			const rank = (note) => (isDoneTask(note) ? 1 : 0)
			return list.slice().sort((a, b) => {
				const byGroup = rank(a) - rank(b)
				if (byGroup !== 0) return byGroup
				const oa = typeof a.orderIndex === 'number' ? a.orderIndex : Number.POSITIVE_INFINITY
				const ob = typeof b.orderIndex === 'number' ? b.orderIndex : Number.POSITIVE_INFINITY
				if (oa !== ob) return oa - ob
				return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
			})
		}

		/** 面板里给的图标是 emoji；material:/lucide: 那类我们渲染不了，退回文件夹图标。 */
		const FOLDER_ICONS = ['📁', '🧪', '💡', '📝', '🎯', '📦', '🔧', '🧠', '📊', '🗂️', '⭐', '🔥', '🚀', '☕️', '🧾', '🧩']
		function isEmojiIcon(value) {
			return typeof value === 'string' && value !== '' && value.indexOf(':') === -1 && /\p{Extended_Pictographic}/u.test(value)
		}

		// material 图标按需批量拉：value -> data URL。选择器一屏几十个只发一次请求，
		// 拉过的永久缓存（图标内容不会变），树里同时最多十几个图标。
		const ICON_URLS = new Map()
		const ICON_WAITERS = new Map()
		let iconQueue = []
		let iconTimer = 0
		let iconListCache = null

		function requestIcons(call) {
			if (iconTimer) return
			iconTimer = setTimeout(async () => {
				const batch = iconQueue.splice(0, 60)
				iconTimer = 0
				if (batch.length === 0) return
				try {
					const map = await call('icon/svgs', { values: batch })
					for (const [key, svg] of Object.entries(map)) {
						ICON_URLS.set(key, `data:image/svg+xml,${encodeURIComponent(svg)}`)
					}
				} catch (error) {
					/* 拉不到就继续显示回退图标，不打断界面 */
				}
				for (const key of batch) {
					const waiters = ICON_WAITERS.get(key) ?? []
					ICON_WAITERS.delete(key)
					for (const notify of waiters) notify()
				}
			}, 16)
		}

		/** 一个 material 图标；还没拉到时先显示普通文件夹图标。 */
		function IconGlyph({ value, size = 14, call }) {
			const [url, setUrl] = useState(() => ICON_URLS.get(value) ?? null)
			useEffect(() => {
				if (ICON_URLS.has(value)) {
					setUrl(ICON_URLS.get(value))
					return undefined
				}
				let alive = true
				const waiters = ICON_WAITERS.get(value) ?? []
				waiters.push(() => { if (alive) setUrl(ICON_URLS.get(value) ?? null) })
				ICON_WAITERS.set(value, waiters)
				if (iconQueue.indexOf(value) === -1) iconQueue.push(value)
				requestIcons(call)
				return () => { alive = false }
			}, [value, call])
			if (url === null) return h(IconFolderCloseRegular, { size })
			return h('img', { src: url, width: size, height: size, alt: '', draggable: false, style: { display: 'block', flex: 'none' } })
		}

		/** 图标选择器：Material（846 个，搜索 + 分页懒加载）和 Emoji 两个页签。 */
		function IconPicker({ value, onPick, call }) {
			const [tab, setTab] = useState('material')
			const [items, setItems] = useState(iconListCache ?? [])
			const [query, setQuery] = useState('')
			const [limit, setLimit] = useState(48)
			const [failed, setFailed] = useState(false)
			useEffect(() => {
				if (tab !== 'material' || items.length > 0 || iconListCache !== null) return
				call('icon/list', {}).then((result) => {
					iconListCache = result.items
					setItems(result.items)
				}).catch(() => setFailed(true))
			}, [tab, items.length, call])
			const filtered = useMemo(() => {
				const query2 = query.trim().toLowerCase()
				return query2 === '' ? items : items.filter((item) => item.name.indexOf(query2) !== -1)
			}, [items, query])
			const visible = filtered.slice(0, limit)
			return h('div', { className: 'kb-iconpick' },
				h('div', { className: 'kb-icons kb-iconpick-tabs' },
					h('button', { className: 'kb-tab', 'data-on': String(tab === 'material'), onClick: () => setTab('material') }, '图标'),
					h('button', { className: 'kb-tab', 'data-on': String(tab === 'emoji'), onClick: () => setTab('emoji') }, 'Emoji'),
					h('button', { className: 'kb-tab', onClick: () => onPick('') }, '清除')),
				tab === 'material'
					? h(react.Fragment, null,
						h('div', { className: 'kb-row', style: { padding: '0 0 4px' } },
							h('div', { className: 'kb-grow' },
								h(Input, {
									value: query, placeholder: items.length === 0 ? '加载中…' : `搜索 ${items.length} 个图标`,
									onChange: (event) => { setQuery(event.target.value ?? ''); setLimit(48) },
								}))),
						h('div', { className: 'kb-icons' },
							visible.map((item) => h('button', {
								key: item.value, className: 'kb-icon-btn', 'data-on': String(value === item.value), title: item.name,
								onClick: () => onPick(item.value),
							}, h(IconGlyph, { value: item.value, size: 18, call }))),
							filtered.length > visible.length
								? h('button', { className: 'kb-icon-btn kb-icon-none', title: '加载更多', onClick: () => setLimit(limit + 96) }, `+${filtered.length - visible.length}`)
								: null),
						items.length === 0
							? h('div', { className: 'kb-empty', style: { padding: '4px 0' } },
								failed ? '图标列表读取失败（宿主插件可能还没重载）' : '正在读取图标…')
							: null)
					: h('div', { className: 'kb-icons' },
						FOLDER_ICONS.map((emoji) => h('button', {
							key: emoji, className: 'kb-icon-btn', 'data-on': String(value === emoji), title: '设为这个图标',
							onClick: () => onPick(emoji),
						}, emoji))))
		}

		// ---- 通用弹层：右键/⋯ 菜单、对话框、文件夹选择器 ----
		// 菜单位置用视口坐标，贴边会自动回缩；点外面或按 Esc 关掉。
		function PopupMenu({ state, items, onClose }) {
			useEffect(() => {
				if (state === null) return undefined
				const away = (event) => {
					const el = event.target
					if (el && el.closest && el.closest('.kb-menu')) return
					onClose()
				}
				const key = (event) => { if (event.key === 'Escape') onClose() }
				document.addEventListener('pointerdown', away, true)
				document.addEventListener('keydown', key, true)
				return () => {
					document.removeEventListener('pointerdown', away, true)
					document.removeEventListener('keydown', key, true)
				}
			}, [state, onClose])
			if (state === null) return null
			const width = 196
			const height = items.length * 34 + 14
			const x = Math.max(8, Math.min(state.x, (globalThis.innerWidth || 1024) - width - 8))
			const y = Math.max(8, Math.min(state.y, (globalThis.innerHeight || 768) - height - 8))
			return h('div', {
				className: 'kb-menu',
				style: { left: `${x}px`, top: `${y}px`, minWidth: `${width}px` },
				onContextMenu: (event) => event.preventDefault(),
			},
				items.map((item) => h('button', {
					key: item.key,
					className: 'kb-menu-item',
					'data-danger': String(item.danger === true),
					disabled: item.disabled === true,
					onClick: () => { onClose(); if (item.run !== null && item.run !== undefined) item.run() },
				},
					item.icon === undefined ? null : item.icon,
					h('span', null, item.label))))
		}

		function Dialog({ open, title, hint, children, actions, onClose }) {
			useEffect(() => {
				if (!open) return undefined
				const key = (event) => { if (event.key === 'Escape') onClose() }
				document.addEventListener('keydown', key, true)
				return () => document.removeEventListener('keydown', key, true)
			}, [open, onClose])
			if (!open) return null
			return h('div', { className: 'kb-modal', onClick: (event) => { if (event.target === event.currentTarget) onClose() } },
				h('div', { className: 'kb-modal-card' },
					title === undefined ? null : h('div', { className: 'kb-modal-title' }, title),
					hint === undefined ? null : h('div', { className: 'kb-modal-hint' }, hint),
					children,
					actions === undefined ? null : h('div', { className: 'kb-modal-actions' }, actions)))
		}

		/** 文件夹选择器：扁平列出所有文件夹（按层级缩进），"根目录"固定在第一条。 */
		function FolderPicker({ folders, exclude, onPick }) {
			const byParent = new Map()
			for (const folder of folders) {
				const parent = folder.path.includes('/') ? folder.path.slice(0, folder.path.lastIndexOf('/')) : ''
				if (!byParent.has(parent)) byParent.set(parent, [])
				byParent.get(parent).push(folder)
			}
			const rows = []
			const walk = (parent, depth) => {
				const list = (byParent.get(parent) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
				for (const folder of list) {
					const blocked = exclude !== undefined && (folder.path === exclude || folder.path.startsWith(`${exclude}/`))
					rows.push(h('button', {
						key: folder.path,
						className: 'kb-pick',
						style: { paddingLeft: `${12 + depth * 14}px` },
						disabled: blocked,
						title: blocked ? '不能移动到它自己或子文件夹' : folder.path,
						onClick: () => onPick(folder.path),
					}, h(IconFolderCloseRegular, { size: 13 }), h('span', null, folder.name)))
					walk(folder.path, depth + 1)
				}
			}
			walk('', 0)
			return h('div', { className: 'kb-picker' },
				h('button', { className: 'kb-pick kb-pick-root', onClick: () => onPick('') }, h(IconListPenOutlineRegular, { size: 13 }), h('span', null, '根目录')),
				rows)
		}

		/** 文件夹树：右键或「⋯」出菜单（图标 / 子文件夹 / 子笔记 / 重命名 / 移动 / 删除）。 */
		function FolderTree({ folders, selected, onSelect, onCreateFolder, onRenameFolder, onSetFolderIcon, onMoveFolder, onDeleteFolder, onCreateNote, trashMode, trashCount, onSelectTrash, call }) {
			const [open, setOpen] = useState(() => new Set())
			const [adding, setAdding] = useState(false)
			const [draft, setDraft] = useState('')
			const [busy, setBusy] = useState(false)
			const [menu, setMenu] = useState(null)
			const [dialog, setDialog] = useState(null)
			const [dialogValue, setDialogValue] = useState('')

			const byParent = useMemo(() => {
				const map = new Map()
				for (const folder of folders) {
					const parent = folder.path.includes('/') ? folder.path.slice(0, folder.path.lastIndexOf('/')) : ''
					if (!map.has(parent)) map.set(parent, [])
					map.get(parent).push(folder)
				}
				return map
			}, [folders])

			const expand = (path) => setOpen((prev) => {
				if (prev.has(path)) return prev
				const next = new Set(prev)
				next.add(path)
				return next
			})
			const toggle = (path) => setOpen((prev) => {
				const next = new Set(prev)
				if (next.has(path)) next.delete(path)
				else next.add(path)
				return next
			})

			const openDialog = (kind, folder, value = '') => {
				setDialog({ kind, path: folder.path, name: folder.name })
				setDialogValue(value)
				setMenu(null)
			}
			const closeDialog = () => {
				setDialog(null)
				setDialogValue('')
			}
			const run = async (task) => {
				if (busy) return
				setBusy(true)
				try {
					await task()
				} finally {
					setBusy(false)
				}
			}

			const submitCreate = async () => {
				const name = draft.trim()
				if (name === '') return
				await run(async () => {
					const created = await onCreateFolder(name, selected ?? '')
					setDraft('')
					setAdding(false)
					if (created) expand(created.path)
				})
			}

			const menuItems = (folder) => [
				{ key: 'icon', label: '设置图标', run: () => openDialog('icon', folder) },
				{ key: 'sub', label: '新建子文件夹', run: () => openDialog('newFolder', folder) },
				{ key: 'note', label: '新建子笔记', run: () => openDialog('newNote', folder) },
				{ key: 'rename', label: '重命名', run: () => openDialog('rename', folder, folder.name) },
				{ key: 'move', label: '移动到…', run: () => openDialog('move', folder) },
				{ key: 'delete', label: '删除', danger: true, run: () => openDialog('delete', folder) },
			]

			const rows = []
			const walk = (parent, depth) => {
				const list = (byParent.get(parent) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
				for (const folder of list) {
					const hasKids = (byParent.get(folder.path) ?? []).length > 0
					const expanded = open.has(folder.path)
					const icon = isEmojiIcon(folder.icon)
						? h('span', { className: 'kb-ficon' }, folder.icon)
						: (typeof folder.icon === 'string' && folder.icon !== ''
							? h(IconGlyph, { value: folder.icon, size: 15, call })
							: (expanded ? h(IconFolderOpenRegular, { size: 15 }) : h(IconFolderCloseRegular, { size: 15 })))
					rows.push(h('div', { key: `f:${folder.path}`, className: 'kb-tree-node' },
						h('div', {
							className: 'kb-row kb-folder-row',
							style: { paddingLeft: depth * 12 + 2 },
							onContextMenu: (event) => { event.preventDefault(); setMenu({ folder, x: event.clientX, y: event.clientY }) },
						},
							h('button', {
								className: 'kb-row', style: { flex: 'none', width: 18, padding: 0 }, title: expanded ? '收起' : '展开',
								onClick: () => toggle(folder.path), disabled: !hasKids,
							}, hasKids ? (expanded ? h(IconChevronDownOutlineRegular, { size: 12 }) : h(IconChevronRightOutlineRegular, { size: 12 })) : null),
							h('button', {
								className: 'kb-row', style: { padding: '3px 4px', flex: 1, minWidth: 0 }, 'data-active': String(selected === folder.path),
								onClick: () => { onSelect(folder.path); if (hasKids) expand(folder.path) }, title: folder.path,
							},
								icon,
								h('span', { className: 'kb-name' }, folder.name),
								h('span', { className: 'kb-count' }, String(folder.noteCount))),
							h('button', {
								className: 'kb-row kb-folder-actions', style: { flex: 'none', width: 22, padding: 0 }, title: '更多操作',
								onClick: (event) => {
									event.stopPropagation()
									const rect = event.currentTarget.getBoundingClientRect()
									setMenu({ folder, x: rect.right - 4, y: rect.bottom + 4 })
								},
							}, '⋯'))))
					if (expanded && hasKids) walk(folder.path, depth + 1)
				}
			}
			walk('', 0)

			let dialogNode = null
			if (dialog !== null) {
				const folder = folders.find((item) => item.path === dialog.path) ?? { path: dialog.path, name: dialog.name, icon: null }
				if (dialog.kind === 'icon') {
					dialogNode = h(Dialog, { open: true, title: `图标 · ${folder.name}`, onClose: closeDialog },
						h(IconPicker, {
							value: folder.icon,
							call,
							onPick: (icon) => { closeDialog(); void onSetFolderIcon(dialog.path, icon) },
						}))
				} else if (dialog.kind === 'move') {
					dialogNode = h(Dialog, {
						open: true, title: '移动到…', hint: '选一个目标文件夹；不能移到自己或子文件夹里。',
						onClose: closeDialog,
						actions: h(Button, { onClick: closeDialog }, '取消'),
					}, h(FolderPicker, {
						folders,
						exclude: dialog.path,
						onPick: (target) => { closeDialog(); void run(() => onMoveFolder(dialog.path, target)) },
					}))
				} else if (dialog.kind === 'delete') {
					dialogNode = h(Dialog, {
						open: true,
						title: `删除「${folder.name}」`,
						hint: '里面的笔记会一起移到回收站（notes/.masscode/trash），在 massCode 里还能恢复；文件夹本身会被删掉。',
						onClose: closeDialog,
						actions: h(react.Fragment, null,
							h(Button, { onClick: closeDialog }, '取消'),
							h('button', {
								className: 'kb-danger-btn', disabled: busy,
								onClick: () => { closeDialog(); void run(() => onDeleteFolder(dialog.path)) },
							}, '删除')),
					})
				} else {
					const title = dialog.kind === 'rename' ? '重命名文件夹' : (dialog.kind === 'newFolder' ? '新建子文件夹' : '新建子笔记')
					const submit = () => {
						const name = dialogValue.trim()
						if (name === '') return
						const kind = dialog.kind
						const path = dialog.path
						closeDialog()
						void run(async () => {
							if (kind === 'rename') await onRenameFolder(path, name)
							else if (kind === 'newFolder') {
								const created = await onCreateFolder(name, path)
								if (created) expand(path)
							} else {
								await onCreateNote(path, name)
							}
						})
					}
					dialogNode = h(Dialog, {
						open: true, title, onClose: closeDialog,
						hint: dialog.kind === 'rename' ? undefined : `位置：${dialog.path === '' ? '根目录' : dialog.path}`,
						actions: h(react.Fragment, null,
							h(Button, { onClick: closeDialog }, '取消'),
							h(Button, { disabled: busy || dialogValue.trim() === '', onClick: submit }, '确定')),
					}, h(Input, {
						value: dialogValue,
						placeholder: '名字',
						onChange: (event) => setDialogValue(event.target.value ?? ''),
						onKeyDown: (event) => { if (event.key === 'Enter') submit() },
					}))
				}
			}

			return h(react.Fragment, null,
				h('div', { className: 'kb-col kb-tree' },
					h('div', { className: 'kb-row', style: { padding: '2px 0' } },
						h('button', {
							className: 'kb-row', style: { flex: 1, minWidth: 0 }, 'data-active': String(!trashMode && selected === null),
							onClick: () => onSelect(null),
						},
							h(IconListPenOutlineRegular, { size: 14 }),
							h('span', { className: 'kb-name' }, '全部笔记')),
						h('button', {
							className: 'kb-row', style: { flex: 'none', width: 24, padding: 0 }, title: '新建文件夹',
							onClick: () => { setAdding((value) => !value); setDraft('') },
						}, h(IconPlusOutlineRegular, { size: 13 }))),
					adding
						? h('div', { className: 'kb-newbar', style: { padding: '4px 6px' } },
							h(Input, {
								value: draft, placeholder: selected === null ? '文件夹名' : `建在「${selected}」下`,
								onChange: (event) => setDraft(event.target.value ?? ''),
								onKeyDown: (event) => {
									if (event.key === 'Enter') void submitCreate()
									if (event.key === 'Escape') setAdding(false)
								},
							}),
							h(Button, { disabled: busy, onClick: () => void submitCreate() }, '建'),
							h(Button, { disabled: busy, onClick: () => setAdding(false) }, '×'))
						: null,
					rows,
					h('div', { className: 'kb-tree-foot' },
						h('button', {
							className: 'kb-row', style: { flex: 1, minWidth: 0 }, 'data-active': String(trashMode === true),
							onClick: () => onSelectTrash(), title: '回收站（.masscode/trash）',
						},
							h('span', { className: 'kb-ficon' }, '🗑'),
							h('span', { className: 'kb-name' }, '回收站'),
							h('span', { className: 'kb-count' }, String(trashCount ?? 0))))),
				h(PopupMenu, {
					state: menu === null ? null : { x: menu.x, y: menu.y },
					items: menu === null ? [] : menuItems(menu.folder),
					onClose: () => setMenu(null),
				}),
				dialogNode)
		}

		/**
		 * 列表里的一行：任务前面是可点的勾选框（勾完 / 取消勾都写回 frontmatter 的 status），
		 * 右侧「⋯」和右键出同一个菜单；整行可拖拽调整顺序。
		 */
		function NoteItem({ note, active, onOpen, onMenu, onToggle, onDragStart, onDrop, dragging }) {
			const late = note.isTask && typeof note.taskDue === 'string' && note.taskDue < TODAY() && note.taskStatus !== 'done'
			const done = isDoneTask(note)
			return h('div', {
				className: 'kb-item-wrap',
				'data-active': String(active),
				'data-done': String(done),
				'data-dragging': String(dragging === true),
				draggable: true,
				onDragStart: (event) => {
					try { event.dataTransfer.effectAllowed = 'move' } catch (error) { /* 老 WebView 没有 dataTransfer */ }
					onDragStart(note)
				},
				onDragOver: (event) => { event.preventDefault() },
				onDrop: (event) => { event.preventDefault(); onDrop(note) },
				onContextMenu: (event) => { event.preventDefault(); onMenu(note, event.clientX, event.clientY) },
			},
				h('button', { className: 'kb-item', onClick: () => onOpen(note) },
					h('div', { className: 'kb-item-title' },
						note.isTask
							? h('span', {
								className: 'kb-check',
								role: 'checkbox',
								'aria-checked': String(done),
								title: done ? '标记为未完成' : '标记为完成',
								onClick: (event) => { event.stopPropagation(); event.preventDefault(); onToggle(note) },
							}, done ? h('span', { className: 'kb-check-mark' }, '✓') : null)
							: null,
						h('span', { className: 'kb-name' }, note.name)),
					h('div', { className: 'kb-item-sub' },
						h('span', null, note.folderPath || '根目录'),
						note.isTask && note.taskDue ? h('span', { className: 'kb-due', 'data-late': String(late) }, note.taskDue) : null,
						note.isTask && note.taskPriority ? h('span', null, note.taskPriority) : null,
						h('span', null, formatDate(note.updatedAt)))),
				h('button', {
					className: 'kb-more',
					title: '更多操作',
					onClick: (event) => {
						event.stopPropagation()
						const rect = event.currentTarget.getBoundingClientRect()
						onMenu(note, rect.right - 4, rect.bottom + 4)
					},
				}, '⋯'))
		}

		// 笔记图片：正文里是 masscode://notes-asset/<文件名>，文件在 vault 的 notes/assets/。
		// RPC 取回 base64 -> Blob -> blob: URL，交给 MarkdownText 的 pathImages；
		// 缓存按数量+字节数双向 LRU 淘汰（手机上 WebView 内存敏感）。
		const ASSET_AUTO_LIMIT = 1.5 * 1024 * 1024
		const ASSET_CACHE_MAX_ITEMS = 16
		const ASSET_CACHE_MAX_BYTES = 24 * 1024 * 1024
		const ASSET_CACHE = new Map()
		let ASSET_CACHE_BYTES = 0

		function extractAssetNames(body) {
			const text = String(body ?? '')
			const names = []
			const seen = new Set()
			const push = (name) => {
				if (typeof name !== 'string' || name === '' || seen.has(name)) return
				seen.add(name)
				names.push(name)
			}
			const custom = /masscode:\/\/notes-asset\/([^)\s"'<>]+)/g
			let match = custom.exec(text)
			while (match !== null) {
				try { push(decodeURIComponent(match[1])) } catch { push(match[1]) }
				match = custom.exec(text)
			}
			// 兼容还没被客户端转换过的 wiki 内嵌写法
			const wiki = /!\[\[([^\]|/]+\.(?:png|jpe?g|gif|webp|avif|svg|bmp))\]\]/gi
			match = wiki.exec(text)
			while (match !== null) {
				push(match[1])
				match = wiki.exec(text)
			}
			return names
		}

		/** 从 markdown 的图片目标里取文件名（兼容被规整过的 URL）。 */
		function assetNameOf(destination) {
			const text = String(destination ?? '')
			const marker = 'notes-asset/'
			const at = text.indexOf(marker)
			if (at === -1) return null
			const rest = text.slice(at + marker.length).split(/[?#]/)[0]
			try { return decodeURIComponent(rest) } catch { return rest }
		}

		function cachedAsset(name) {
			const hit = ASSET_CACHE.get(name)
			return hit === undefined ? undefined : hit.url
		}

		function rememberAsset(name, bytes, url) {
			const existing = ASSET_CACHE.get(name)
			if (existing !== undefined) {
				URL.revokeObjectURL(existing.url)
				ASSET_CACHE.delete(name)
				ASSET_CACHE_BYTES -= existing.bytes
			}
			ASSET_CACHE.set(name, { url, bytes })
			ASSET_CACHE_BYTES += bytes
			while (ASSET_CACHE.size > ASSET_CACHE_MAX_ITEMS || ASSET_CACHE_BYTES > ASSET_CACHE_MAX_BYTES) {
				const oldest = ASSET_CACHE.entries().next().value
				if (oldest === undefined) break
				URL.revokeObjectURL(oldest[1].url)
				ASSET_CACHE.delete(oldest[0])
				ASSET_CACHE_BYTES -= oldest[1].bytes
			}
		}

		/** 组装「问 DSH」的首条草稿：笔记路径 + 正文 + 待补的问题。 */
		function composePrompt(note) {
			const head = [`# 参考文献：${note.meta.name}`, `路径：notes/${note.path}`, note.meta.isTask ? `任务状态：${note.meta.taskStatus ?? 'todo'}${note.meta.taskDue ? ` / 截止 ${note.meta.taskDue}` : ''}` : '', '', '---', '', note.body.trim()].filter((line) => line !== null).join('\n')
			return `${head}\n\n---\n\n请基于上面这篇笔记回答：\n`
		}

		function KnowledgePage({ call, openChat }) {
			const [tree, setTree] = useState(null)
			const [error, setError] = useState(null)
			const [hideDone, setHideDone] = useState(false)
			// 备注菜单 / 对话框（重命名、移动、删除）/ 拖拽中的那一行
			const [noteMenu, setNoteMenu] = useState(null)
			const [noteDialog, setNoteDialog] = useState(null)
			const [dialogValue, setDialogValue] = useState('')
			const [dragNote, setDragNote] = useState(null)
			// 回收站：独立视图（folder === null 那些逻辑不掺进来）
			const [trashMode, setTrashMode] = useState(false)
			const [trash, setTrash] = useState(null)
			const [trashDialog, setTrashDialog] = useState(null)
			const [folder, setFolder] = useState(null)
			const [query, setQuery] = useState('')
			const [hits, setHits] = useState(null)
			const [selected, setSelected] = useState(null)
			const [detail, setDetail] = useState(null)
			// 不再有"预览/编辑"两个模式：编辑器本身就是预览（装饰层），
			// 点进去就能改。dirty 只用来决定要不要显示保存。
			const [editorRevision, setEditorRevision] = useState(0)
			const [draft, setDraft] = useState('')
			const [newName, setNewName] = useState('')
			const [busy, setBusy] = useState(false)
			const [notice, setNotice] = useState(null)
			const [configOpen, setConfigOpen] = useState(false)
			const [configDraft, setConfigDraft] = useState('')
			const [configInfo, setConfigInfo] = useState(null)
			const [configBusy, setConfigBusy] = useState(false)
			const [assetVersion, setAssetVersion] = useState(0)
			const [pendingLarge, setPendingLarge] = useState([])
			const [assetBusy, setAssetBusy] = useState(false)
			const searchSeq = useRef(0)
			const editorRef = useRef(null)

			const reload = useCallback(async () => {
				setBusy(true)
				try {
					const value = await call('tree', {})
					setTree(value)
					setError(null)
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				} finally {
					setBusy(false)
				}
			}, [call])

			// vault 路径设置：读当前配置 -> 编辑 -> 写回并重新扫描
			const openConfig = useCallback(async () => {
				try {
					const info = await call('config/read', {})
					setConfigInfo(info)
					setConfigDraft(info.vaultRoot)
					setConfigOpen(true)
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				}
			}, [call])

			const applyConfig = useCallback(async () => {
				const vaultRoot = configDraft.trim()
				if (vaultRoot === '') return
				setConfigBusy(true)
				try {
					const result = await call('config/set', { vaultRoot })
					setConfigInfo((prev) => ({ ...(prev ?? {}), ...result }))
					setConfigOpen(false)
					setFolder(null)
					setSelected(null)
					setDetail(null)
					setNotice(`已切换 vault：${result.notes} 篇笔记 / ${result.folders} 个文件夹`)
					setError(null)
					await reload()
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				} finally {
					setConfigBusy(false)
				}
			}, [call, configDraft, reload])

			const fetchAssets = useCallback(async (names) => {
				const todo = names.filter((name) => cachedAsset(name) === undefined)
				if (todo.length === 0) {
					setAssetVersion((value) => value + 1)
					return
				}
				setAssetBusy(true)
				try {
					// 每批 4 张：单张最大 2 MB，base64 后一批不超过 ~11 MB，手机上也扛得住
					for (let index = 0; index < todo.length; index += 4) {
						const batch = todo.slice(index, index + 4)
						const map = await call('asset/read', { names: batch })
						for (const [name, payload] of Object.entries(map)) {
							const binary = atob(payload.base64)
							const bytes = new Uint8Array(binary.length)
							for (let cursor = 0; cursor < binary.length; cursor += 1) bytes[cursor] = binary.charCodeAt(cursor)
							rememberAsset(name, bytes.length, URL.createObjectURL(new Blob([bytes], { type: payload.mime })))
						}
						setAssetVersion((value) => value + 1)
					}
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				} finally {
					setAssetBusy(false)
					setAssetVersion((value) => value + 1)
				}
			}, [call])

			// 打开笔记后：小图自动取，大图挂一个"点击加载"，避免手机上一开笔记就拉 2 MB。
			const loadAssetsFor = useCallback(async (body) => {
				setPendingLarge([])
				const names = extractAssetNames(body)
				if (names.length === 0) {
					setAssetVersion((value) => value + 1)
					return
				}
				try {
					const meta = await call('asset/meta', { names })
					const small = []
					const large = []
					for (const name of names) {
						if (cachedAsset(name) !== undefined) continue
						const info = meta[name]
						if (info === undefined) continue
						if (info.size <= ASSET_AUTO_LIMIT) small.push(name)
						else large.push({ name, size: info.size })
					}
					setPendingLarge(large)
					if (small.length > 0) await fetchAssets(small)
					else setAssetVersion((value) => value + 1)
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				}
			}, [call, fetchAssets])

			const resolveAsset = useCallback((name) => cachedAsset(name), [assetVersion])

			const pathImages = useMemo(() => ({
				resolve: (destination) => {
					const name = assetNameOf(destination)
					if (name === null) return undefined
					return cachedAsset(name)
				},
			}), [assetVersion])

			// 粘贴 / 拖拽进来的图片：读字节 -> base64 -> 宿主写进 notes/assets/ ->
			// 在光标处插入 ![](masscode://notes-asset/<name>)，文件名规则和 Swift 端一致。
			const uploadImage = useCallback(async (file) => {
				const buffer = await file.arrayBuffer()
				const bytes = new Uint8Array(buffer)
				let binary = ''
				const chunk = 0x8000
				for (let index = 0; index < bytes.length; index += chunk) {
					binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
				}
				return call('asset/write', { mime: file.type || 'image/png', base64: btoa(binary) })
			}, [call])

			const insertImageFiles = useCallback(async (files) => {
				if (files.length === 0) return
				setAssetBusy(true)
				setNotice(files.length === 1 ? '插入图片…' : `插入 ${files.length} 张图片…`)
				try {
					const node = editorRef.current
					let text = node === null ? draft : node.value
					let caret = node === null ? text.length : (node.selectionStart ?? text.length)
					for (const file of files) {
						const result = await uploadImage(file)
						const snippet = `${result.markdown}\n`
						text = text.slice(0, caret) + snippet + text.slice(caret)
						caret += snippet.length
						fetchAssets([result.name])
					}
					setDraft(text)
					setNotice(`已插入 ${files.length} 张图片`)
					setError(null)
					requestAnimationFrame(() => {
						const editor = editorRef.current
						if (editor === null) return
						editor.focus()
						editor.selectionStart = caret
						editor.selectionEnd = caret
					})
				} catch (reason) {
					setNotice(null)
					setError(String(reason && reason.message ? reason.message : reason))
				} finally {
					setAssetBusy(false)
				}
			}, [call, draft, fetchAssets, uploadImage])

			const handlePaste = useCallback((event) => {
				const data = event.clipboardData
				if (!data) return
				const files = []
				for (const item of data.items) {
					if (item.kind !== 'file' || !String(item.type).startsWith('image/')) continue
					const file = item.getAsFile()
					if (file !== null) files.push(file)
				}
				// 没有图片就放行，普通文本粘贴照旧
				if (files.length === 0) return
				event.preventDefault()
				insertImageFiles(files)
			}, [insertImageFiles])

			const handleDrop = useCallback((event) => {
				const files = Array.from((event.dataTransfer && event.dataTransfer.files) || [])
					.filter((file) => String(file.type).startsWith('image/'))
				if (files.length === 0) return
				event.preventDefault()
				insertImageFiles(files)
			}, [insertImageFiles])

			useEffect(() => { reload() }, [reload])

			const openNote = useCallback(async (notePath) => {
				setSelected(notePath)
				setNotice(null)
				try {
					const value = await call('note', { path: notePath })
					setDetail(value)
					setDraft(value.body)
					setError(null)
					loadAssetsFor(value.body)
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
					setDetail(null)
				}
			}, [call, loadAssetsFor])

			const save = useCallback(async () => {
				if (detail === null) return
				setBusy(true)
				try {
					const value = await call('note/save', { path: detail.path, body: draft, mtimeMs: detail.mtimeMs })
					setDetail(value)
					setDraft(value.body)
					setNotice('已保存')
					await reload()
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				} finally {
					setBusy(false)
				}
			}, [call, detail, draft, reload])

			const dirty = detail !== null && draft !== detail.body

			// ⌘S / Ctrl+S 保存：焦点在编辑器里也走这一条，顺手拦掉浏览器自己的保存页面。
			useEffect(() => {
				const onKey = (event) => {
					if (!(event.metaKey || event.ctrlKey) || String(event.key).toLowerCase() !== 's') return
					if (detail === null) return
					event.preventDefault()
					if (dirty && !busy) void save()
				}
				document.addEventListener('keydown', onKey, true)
				return () => document.removeEventListener('keydown', onKey, true)
			}, [detail, dirty, busy, save])

			// 新建文件夹：写完 .meta.yaml 后重新扫描，并把选中切到新文件夹。
			const createFolder = useCallback(async (name, parentPath) => {
				setBusy(true)
				try {
					const created = await call('folder/create', { name, parentPath })
					await reload()
					setFolder(created.path)
					setQuery('')
					setNotice(`已新建「${created.name}」`)
					setError(null)
					return created
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
					return null
				} finally {
					setBusy(false)
				}
			}, [call, reload])

			// 重命名会移动目录，笔记的相对路径跟着变：把选中态清掉，别留一个指向旧路径的详情。
			const renameFolderByPath = useCallback(async (path, name) => {
				setBusy(true)
				try {
					const result = await call('folder/rename', { path, name })
					await reload()
					setFolder(result.path)
					setSelected(null)
					setDetail(null)
					setNotice(`已重命名为「${result.name}」`)
					setError(null)
					return result
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
					return null
				} finally {
					setBusy(false)
				}
			}, [call, reload])

			const setFolderIconByPath = useCallback(async (path, icon) => {
				try {
					await call('folder/icon', { path, icon })
					setNotice(icon === '' ? '已清除图标' : '已更新图标')
					setError(null)
					await reload()
					return true
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
					return false
				}
			}, [call, reload])

			// ---- 笔记 / 文件夹操作：统一走一个"忙碌 + 报错 + 重新扫描"的壳 ----
			const noteOp = useCallback(async (runner, after) => {
				setBusy(true)
				try {
					const result = await runner()
					await reload()
					if (after !== undefined) await after(result)
					setError(null)
					return result
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
					return null
				} finally {
					setBusy(false)
				}
			}, [reload])

			const refreshDetail = useCallback(async (path) => {
				try {
					const value = await call('note', { path })
					setDetail(value)
					setDraft(value.body)
					setEditorRevision((value2) => value2 + 1)
				} catch {
					setDetail(null)
				}
			}, [call])

			// ---- 回收站：列表 / 恢复 / 彻底删除 / 清空 ----
			const loadTrash = useCallback(async () => {
				try {
					const value = await call('trash/list')
					setTrash(Array.isArray(value.entries) ? value.entries : [])
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				}
			}, [call])

			useEffect(() => { void loadTrash() }, [loadTrash])

			const enterTrash = useCallback(() => {
				setTrashMode(true)
				setFolder(null)
				setSelected(null)
				setDetail(null)
				setQuery('')
				void loadTrash()
			}, [loadTrash])

			const restoreTrash = useCallback(async (path) => noteOp(
				() => call('trash/restore', { path }),
				async (result) => {
					setNotice(`已恢复到「${result.folderPath === '' ? '根目录' : result.folderPath}」`)
					await loadTrash()
				},
			), [call, loadTrash, noteOp])

			const purgeTrash = useCallback(async (path) => noteOp(
				() => call('trash/purge', { path }),
				async () => {
					setNotice('已彻底删除')
					await loadTrash()
				},
			), [call, loadTrash, noteOp])

			const emptyTrashAll = useCallback(async () => noteOp(
				() => call('trash/empty'),
				async (result) => {
					setNotice(`已清空回收站（${result.removed} 篇）`)
					await loadTrash()
				},
			), [call, loadTrash, noteOp])

			const renameNoteByPath = useCallback(async (path, name) => noteOp(
				() => call('note/rename', { path, name }),
				async (result) => {
					setNotice(`已重命名为「${result.name}」`)
					if (selected === path) await openNote(result.path)
				},
			), [call, noteOp, openNote, selected])

			const moveNoteByPath = useCallback(async (path, folderPath) => noteOp(
				() => call('note/move', { path, folderPath }),
				async (result) => {
					setNotice(result.moved ? `已移动到「${folderPath === '' ? '根目录' : folderPath}」` : '位置没变')
					if (selected === path) await openNote(result.path)
				},
			), [call, noteOp, openNote, selected])

			const deleteNoteByPath = useCallback(async (path) => noteOp(
				() => call('note/delete', { path }),
				async () => {
					setNotice('已移到回收站（notes/.masscode/trash）')
					await loadTrash()
					if (selected === path) {
						setDetail(null)
						setSelected(null)
					}
				},
			), [call, loadTrash, noteOp, selected])

			const setNoteStatusByPath = useCallback(async (path, status) => noteOp(
				() => call('note/status', { path, status }),
				async () => {
					if (selected === path) await refreshDetail(path)
					setNotice(status === 'done' ? '已完成，已排到下面' : '已回到未完成')
				},
			), [call, noteOp, refreshDetail, selected])

			const setNoteKindByPath = useCallback(async (path, isTask) => noteOp(
				() => call('note/kind', { path, isTask }),
				async (result) => {
					if (selected === path) await refreshDetail(path)
					if (result && result.changed) setNotice(isTask ? '已转为任务' : '已转为普通笔记')
				},
			), [call, noteOp, refreshDetail, selected])

			const reorderByPath = useCallback(async (folderPath, order) => noteOp(
				() => call('note/order', { folderPath, order }),
			), [call, noteOp])

			const moveFolderByPath = useCallback(async (path, parentPath) => noteOp(
				() => call('folder/move', { path, parentPath }),
				async (result) => {
					setFolder(result.path)
					setSelected(null)
					setDetail(null)
					setNotice(result.moved ? '已移动文件夹' : '位置没变')
				},
			), [call, noteOp])

			const deleteFolderByPath = useCallback(async (path) => noteOp(
				() => call('folder/delete', { path }),
				async (result) => {
					if (folder === path || (folder !== null && folder.startsWith(`${path}/`))) setFolder(null)
					setSelected(null)
					setDetail(null)
					setNotice(`已删除文件夹，${result.moved} 篇笔记进了回收站`)
				},
			), [call, folder, noteOp])

			// 新建只建笔记；要任务就在详情里「转为任务」。
			const create = useCallback(async () => {
				const name = newName.trim()
				if (name === '') return
				setBusy(true)
				try {
					const created = await call('note/create', { folderPath: folder ?? '', name })
					setNewName('')
					await reload()
					await openNote(created.path)
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
				} finally {
					setBusy(false)
				}
			}, [call, folder, newName, openNote, reload])

			/** 文件夹菜单里的「新建子笔记」：建在指定文件夹里。 */
			const createIn = useCallback(async (folderPath, name) => {
				setBusy(true)
				try {
					const created = await call('note/create', { folderPath, name })
					await reload()
					await openNote(created.path)
					setNotice(`已新建「${created.path.split('/').pop().replace(/\.md$/u, '')}」`)
					setError(null)
					return created
				} catch (reason) {
					setError(String(reason && reason.message ? reason.message : reason))
					return null
				} finally {
					setBusy(false)
				}
			}, [call, openNote, reload])

			useEffect(() => {
				if (trashMode) {
					setHits(null)
					return undefined
				}
				const text = query.trim()
				if (text === '') {
					setHits(null)
					return undefined
				}
				const seq = ++searchSeq.current
				const timer = setTimeout(async () => {
					try {
						const value = await call('search', { query: text })
						if (searchSeq.current === seq) setHits(value.hits)
					} catch (reason) {
						if (searchSeq.current === seq) setError(String(reason && reason.message ? reason.message : reason))
					}
				}, 220)
				return () => clearTimeout(timer)
			}, [call, query, trashMode])

			const notes = tree === null ? [] : (hits ?? tree.notes)
			// 不再有"任务 / 今天 / 即将到期 / 已完成"筛选：未完成在前、已完成沉底，只留一个"只看未完成"。
			const visible = useMemo(() => {
				const inScope = notes.filter((note) => hits !== null || folder === null || note.folderPath === folder)
				const shaped = hideDone && hits === null ? inScope.filter((note) => !isDoneTask(note)) : inScope
				return sortNotes(shaped).slice(0, 400)
			}, [notes, hits, folder, hideDone])

			// 同一文件夹、同一组（未完成 / 已完成）里的有序列表，拖拽和"上移/下移"都基于它
			const groupOf = useCallback((note) => {
				const sameFolder = notes.filter((item) => item.folderPath === note.folderPath)
				return sortNotes(sameFolder).filter((item) => isDoneTask(item) === isDoneTask(note))
			}, [notes])

			const applyOrder = useCallback(async (group) => {
				if (group.length === 0) return
				await reorderByPath(group[0].folderPath, group.map((item) => item.path))
			}, [reorderByPath])

			const dropOn = useCallback(async (target) => {
				if (dragNote === null) return
				const group = groupOf(target)
				const from = group.findIndex((item) => item.path === dragNote.path)
				const to = group.findIndex((item) => item.path === target.path)
				setDragNote(null)
				if (from < 0 || to < 0 || from === to) return
				const next = group.slice()
				const [moved] = next.splice(from, 1)
				next.splice(to, 0, moved)
				await applyOrder(next)
			}, [applyOrder, dragNote, groupOf])

			const nudge = useCallback(async (note, delta) => {
				const group = groupOf(note)
				const at = group.findIndex((item) => item.path === note.path)
				const to = at + delta
				if (at < 0 || to < 0 || to >= group.length) return
				const next = group.slice()
				const [moved] = next.splice(at, 1)
				next.splice(to, 0, moved)
				await applyOrder(next)
			}, [applyOrder, groupOf])

			// 笔记菜单（右键 / ⋯）：重命名、移动到…、上移/下移、删除
			const noteMenuItems = useCallback((note) => {
				const group = groupOf(note)
				const at = group.findIndex((item) => item.path === note.path)
				return [
					{ key: 'rename', label: '重命名', run: () => { setNoteDialog({ kind: 'rename', path: note.path }); setDialogValue(note.name) } },
					{ key: 'move', label: '移动到…', run: () => setNoteDialog({ kind: 'move', path: note.path }) },
					// 搜索结果是跨文件夹的，这时候排序没有意义，直接禁用
					{ key: 'up', label: '上移', disabled: hits !== null || at <= 0, run: () => void nudge(note, -1) },
					{ key: 'down', label: '下移', disabled: hits !== null || at < 0 || at >= group.length - 1, run: () => void nudge(note, 1) },
					{ key: 'delete', label: '删除', danger: true, run: () => setNoteDialog({ kind: 'delete', path: note.path, name: note.name }) },
				]
			}, [groupOf, hits, nudge])

			const closeNoteDialog = () => {
				setNoteDialog(null)
				setDialogValue('')
			}

			// 笔记的三个对话框：重命名 / 移动 / 删除（删除有二次确认）
			const noteDialogNode = () => {
				if (noteDialog === null) return null
				const folders = tree === null ? [] : tree.folders
				if (noteDialog.kind === 'move') {
					return h(Dialog, {
						open: true, title: '移动到…', hint: '选一个目标文件夹。', onClose: closeNoteDialog,
						actions: h(Button, { onClick: closeNoteDialog }, '取消'),
					}, h(FolderPicker, {
						folders,
						onPick: (target) => { closeNoteDialog(); void moveNoteByPath(noteDialog.path, target) },
					}))
				}
				if (noteDialog.kind === 'delete') {
					return h(Dialog, {
						open: true,
						title: `删除「${noteDialog.name ?? ''}」`,
						hint: '会移到回收站（notes/.masscode/trash），在 massCode 里还能恢复。',
						onClose: closeNoteDialog,
						actions: h(react.Fragment, null,
							h(Button, { onClick: closeNoteDialog }, '取消'),
							h('button', {
								className: 'kb-danger-btn', disabled: busy,
								onClick: () => { closeNoteDialog(); void deleteNoteByPath(noteDialog.path) },
							}, '删除')),
					})
				}
				const submit = () => {
					const name = dialogValue.trim()
					if (name === '') return
					const path = noteDialog.path
					closeNoteDialog()
					void renameNoteByPath(path, name)
				}
				return h(Dialog, {
					open: true, title: '重命名笔记', onClose: closeNoteDialog,
					actions: h(react.Fragment, null,
						h(Button, { onClick: closeNoteDialog }, '取消'),
						h(Button, { disabled: dialogValue.trim() === '', onClick: submit }, '确定')),
				}, h(Input, {
					value: dialogValue,
					placeholder: '笔记名',
					onChange: (event) => setDialogValue(event.target.value ?? ''),
					onKeyDown: (event) => { if (event.key === 'Enter') submit() },
				}))
			}

			// 回收站列表：名字 + 原位置 + 删除时间，右侧两个动作
			const trashList = () => {
				if (trash === null) return h('div', { className: 'kb-empty' }, '读取回收站…')
				const keyword = query.trim().toLowerCase()
				const rows = keyword === '' ? trash : trash.filter((item) => item.name.toLowerCase().indexOf(keyword) >= 0)
				if (rows.length === 0) {
					return h('div', { className: 'kb-empty kb-empty-center' }, keyword === '' ? '回收站是空的。' : '回收站里没有匹配的笔记。')
				}
				return rows.map((item) => h('div', { key: item.path, className: 'kb-trash-row' },
					h('div', { className: 'kb-trash-main' },
						h('div', { className: 'kb-trash-name' }, item.name),
						h('div', { className: 'kb-trash-meta' },
							h('span', null, item.folderPath === null || item.folderPath === '' ? '根目录' : item.folderPath),
							h('span', null, formatDate(item.deletedAt)))),
					h('div', { className: 'kb-trash-actions' },
						h('button', { className: 'kb-link', disabled: busy, onClick: () => void restoreTrash(item.path) }, '恢复'),
						h('button', {
							className: 'kb-link kb-link-danger', disabled: busy,
							onClick: () => setTrashDialog({ kind: 'purge', path: item.path, name: item.name }),
						}, '彻底删除'))))
			}

			const trashDialogNode = () => {
				if (trashDialog === null) return null
				const close = () => setTrashDialog(null)
				if (trashDialog.kind === 'empty') {
					return h(Dialog, {
						open: true,
						title: '清空回收站',
						hint: `会彻底删除回收站里的 ${trash === null ? 0 : trash.length} 篇笔记，删了找不回来。`,
						onClose: close,
						actions: h(react.Fragment, null,
							h(Button, { onClick: close }, '取消'),
							h('button', { className: 'kb-danger-btn', disabled: busy, onClick: () => { close(); void emptyTrashAll() } }, '清空')),
					})
				}
				return h(Dialog, {
					open: true,
					title: `彻底删除「${trashDialog.name ?? ''}」`,
					hint: '会直接从磁盘删掉这篇笔记，找不回来。',
					onClose: close,
					actions: h(react.Fragment, null,
						h(Button, { onClick: close }, '取消'),
						h('button', { className: 'kb-danger-btn', disabled: busy, onClick: () => { const path = trashDialog.path; close(); void purgeTrash(path) } }, '删除')),
				})
			}

			return h('div', { 'data-kb': '1', 'data-kb-view': detail === null ? 'list' : 'detail' },
				configOpen
					? h('div', { className: 'kb-modal' },
						h('div', { className: 'kb-modal-card' },
							h('div', { className: 'kb-modal-title' }, 'Vault 路径'),
							h('div', { className: 'kb-modal-hint' }, '指向 massCode 的 markdown vault 根目录（包含 notes/ 的那一层）。留空无效；改完立即生效。'),
							h(Input, {
								value: configDraft,
								placeholder: configInfo?.defaultVaultRoot ?? '/Users/…/markdown-vault',
								onChange: (event) => setConfigDraft(event.target.value ?? ''),
								onKeyDown: (event) => { if (event.key === 'Enter') applyConfig() },
							}),
							h('div', { className: 'kb-modal-hint' },
								'默认：', configInfo?.defaultVaultRoot ?? '（未知）',
								configInfo?.configPath ? `  ·  配置文件：${configInfo.configPath}` : ''),
							h('div', { className: 'kb-modal-actions' },
								configInfo?.defaultVaultRoot
									? h(Button, { onClick: () => setConfigDraft(configInfo.defaultVaultRoot) }, '用默认目录')
									: null,
								h(Button, { onClick: () => setConfigOpen(false) }, '取消'),
								h(Button, { onClick: applyConfig, disabled: configBusy || configDraft.trim() === '' }, '保存并重新扫描'))))
					: null,
				h(FolderTree, {
					folders: tree === null ? [] : tree.folders,
					selected: folder,
					trashMode,
					trashCount: trash === null ? 0 : trash.length,
					onSelectTrash: enterTrash,
					onSelect: (value) => { setTrashMode(false); setFolder(value); setQuery('') },
					onCreateFolder: createFolder,
					onRenameFolder: renameFolderByPath,
					onSetFolderIcon: setFolderIconByPath,
					onMoveFolder: moveFolderByPath,
					onDeleteFolder: deleteFolderByPath,
					onCreateNote: createIn,
					call,
				}),
				h('div', { className: 'kb-col kb-list' },
					h('div', { className: 'kb-toolbar' },
						h('div', { className: 'kb-grow' },
							h(Input, {
								value: query,
								placeholder: trashMode ? '搜索回收站…' : '搜索标题或正文…',
								onChange: (event) => setQuery(event.target.value ?? ''),
							})),
						trashMode
							? h('button', {
								className: 'kb-danger-btn', disabled: busy || trash === null || trash.length === 0,
								onClick: () => setTrashDialog({ kind: 'empty' }),
							}, '清空回收站')
							: h(react.Fragment, null,
								h('button', {
									className: 'kb-chip', 'data-on': String(hideDone), title: '只看未完成任务',
									onClick: () => setHideDone((value) => !value),
								}, '未完成'),
								h('button', { className: 'kb-icon-btn', onClick: reload, title: '刷新' }, h(IconRefreshOutlineRegular, { size: 14 })),
								h('button', { className: 'kb-icon-btn', onClick: openConfig, title: '设置 vault 路径' }, '⚙'))),
					notice !== null ? h('div', { className: 'kb-notice' }, notice) : null,
					trashMode
						? null
						: h('div', { className: 'kb-newbar' },
							h('div', { className: 'kb-grow' }, h(Input, {
								value: newName,
								placeholder: folder === null ? '新笔记（根目录，回车创建）' : `新笔记（${folder}，回车创建）`,
								onChange: (event) => setNewName(event.target.value ?? ''),
								onKeyDown: (event) => { if (event.key === 'Enter') void create() },
							})),
							h(Button, { disabled: busy || newName.trim() === '', onClick: () => void create() }, h(IconPlusOutlineRegular, { size: 14 }))),
					error !== null ? h('div', { className: 'kb-error' }, error) : null,
					trashMode
						? h('div', { className: 'kb-scroll' }, trashList())
						: h('div', { className: 'kb-scroll', onDragEnd: () => setDragNote(null) },
							visible.length === 0
								? h('div', { className: 'kb-empty' },
									tree === null
										? '加载中…'
										: (tree.notes.length === 0
											? '这个 vault 还是空的：在上面输入名字建一篇笔记，或点 ⚙ 换一个 vault 目录。'
											: '没有匹配的笔记'))
								: visible.map((note) => h(NoteItem, {
									key: note.path,
									note,
									active: selected === note.path,
									dragging: dragNote !== null && dragNote.path === note.path,
									onOpen: (item) => void openNote(item.path),
									onMenu: (item, x, y) => setNoteMenu({ note: item, x, y }),
									onToggle: (item) => void setNoteStatusByPath(item.path, isDoneTask(item) ? 'todo' : 'done'),
									onDragStart: (item) => setDragNote(item),
									onDrop: (item) => void dropOn(item),
								})))),
				h(PopupMenu, {
					state: noteMenu === null ? null : { x: noteMenu.x, y: noteMenu.y },
					items: noteMenu === null ? [] : noteMenuItems(noteMenu.note),
					onClose: () => setNoteMenu(null),
				}),
				noteDialogNode(),
				trashDialogNode(),
				h('div', { className: 'kb-col kb-detail' },
					detail === null
						? h('div', { className: 'kb-empty kb-empty-center' }, trashMode
							? '回收站：左边每一条都能「恢复」（回原文件夹）或「彻底删除」。'
							: '选一篇笔记打开；任务可以直接点前面的圆圈打勾。')
						: h(react.Fragment, null,
							h('div', { className: 'kb-head' },
								h('button', { className: 'kb-back', 'aria-label': '返回列表', onClick: () => { setDetail(null); setSelected(null) } }, '‹'),
								h('div', { className: 'kb-title', title: detail.meta.name },
									detail.meta.name,
									dirty ? h('span', { className: 'kb-dirty', title: '有未保存的改动' }) : null),
								h('button', {
									className: 'kb-chip', 'data-on': String(detail.meta.isTask), disabled: busy,
									title: detail.meta.isTask ? '转回普通笔记' : '转成任务（可以打勾）',
									onClick: () => void setNoteKindByPath(detail.path, !detail.meta.isTask),
								}, detail.meta.isTask ? '任务' : '转为任务'),
								h(Button, { onClick: () => openChat(detail), title: '用这篇笔记开一个新会话' }, h(IconSendOutlineRegular, { size: 14 }), '问 DSH'),
								dirty ? h('button', { className: 'kb-save', onClick: () => void save(), disabled: busy, title: '保存（⌘S / Ctrl+S）' }, '保存') : null,
								dirty
									? h('button', {
										className: 'kb-undo',
										title: '撤销这次的改动（回到上次保存的内容）',
										onClick: () => {
											setDraft(detail.body)
											setEditorRevision((value) => value + 1)
											setNotice('已撤销改动')
										},
									}, '撤销')
									: null),
							h('div', { className: 'kb-meta' },
								h('span', null, detail.path),
								detail.meta.isTask ? h('span', null, `状态 ${detail.meta.taskStatus ?? 'todo'}`) : null,
								detail.meta.taskDue ? h('span', null, `截止 ${detail.meta.taskDue}`) : null,
								detail.meta.taskPriority ? h('span', null, `优先级 ${detail.meta.taskPriority}`) : null,
								pendingLarge.length > 0
									? h(Button, {
										disabled: assetBusy,
										onClick: () => {
											const names = pendingLarge.map((item) => item.name)
											setPendingLarge([])
											fetchAssets(names)
										},
									}, `加载 ${pendingLarge.length} 张大图（${(pendingLarge.reduce((sum, item) => sum + item.size, 0) / 1048576).toFixed(1)} MB）`)
									: null,
								notice !== null ? h('span', null, notice) : null),
							h(MarkdownEditor, {
								value: draft,
								documentId: `${detail.path}#${editorRevision}`,
								onChange: (next) => setDraft(next),
								call,
								ensureAssets: fetchAssets,
								resolveAsset,
							}))))
		}

		// ---- 编辑器：CodeMirror 6 + @atomic-editor/editor 的 Obsidian 式实时预览 ----
		// 装饰层是只读的，磁盘上的 markdown 逐字节不变（这是三方共用 vault 的前提）。
		let editorLib = null
		function loadEditorLib() {
			if (editorLib === null) {
				// 懒加载：只在真正进入编辑态时初始化，Node 里跑测试也不会碰 CM6。
				// 走 ./editor-lazy.js 是为了让编辑器与 CM6 共用同一份 ESM 实例。
				editorLib = require('./editor-lazy.js')
			}
			return editorLib
		}

		const EDITOR_CSS_ID = 'dsh-kb-editor'

		function ensureEditorStyles() {
			if (document.querySelector(`style[data-plugin-css="${EDITOR_CSS_ID}"]`) !== null) return
			const style = document.createElement('style')
			style.dataset.plugin = 'dsh-knowledge-base'
			style.dataset.pluginCss = EDITOR_CSS_ID
			style.textContent = __ATOMIC_EDITOR_CSS__
			document.head.appendChild(style)
		}

		/** 把编辑器里的 masscode://notes-asset/xxx 换成本地 blob URL（它只会原样写 img.src）。 */
		function rewriteEditorImages(root, resolveAsset, ensureAssets) {
			const images = root.querySelectorAll('img[src^="masscode://"]')
			for (const img of images) {
				const name = assetNameOf(img.getAttribute('src'))
				if (name === null) continue
				const url = resolveAsset(name)
				if (url === undefined) {
					ensureAssets([name])
					continue
				}
				if (img.src !== url) img.src = url
			}
		}

		function MarkdownEditor({ value, documentId, onChange, call, ensureAssets, resolveAsset }) {
			const hostRef = useRef(null)
			const [broken, setBroken] = useState(false)
			const lib = useMemo(() => {
				try {
					const loaded = loadEditorLib()
					ensureEditorStyles()
					return loaded
				} catch (error) {
					console.warn('knowledge-base: 编辑器加载失败，回退 textarea', error)
					return null
				}
			}, [])

			const uploadImages = useCallback(async (files) => {
				const marks = []
				for (const file of files) {
					const buffer = await file.arrayBuffer()
					const bytes = new Uint8Array(buffer)
					let binary = ''
					const chunk = 0x8000
					for (let index = 0; index < bytes.length; index += chunk) {
						binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
					}
					const result = await call('asset/write', { mime: file.type || 'image/png', base64: btoa(binary) })
					marks.push(result.markdown)
					ensureAssets([result.name])
				}
				return marks
			}, [call, ensureAssets])

			// 粘贴 / 拖拽图片：用 CM6 的 domEventHandlers 在光标处插入引用
			const extensions = useMemo(() => {
				if (lib === null) return []
				const { EditorView } = lib
				const pick = (list) => Array.from(list || []).filter((file) => String(file.type).startsWith('image/'))
				const insert = (event, view) => {
					const files = pick(event.clipboardData ? event.clipboardData.files : null)
						.concat(pick(event.dataTransfer ? event.dataTransfer.files : null))
					if (files.length === 0) return false
					event.preventDefault()
					// CM6 的处理器要同步返回布尔，上传走后台
					uploadImages(files).then((marks) => {
						if (marks.length > 0) view.dispatch(view.state.replaceSelection(`${marks.join('\n')}\n`))
					}).catch((error) => console.warn('knowledge-base: 插入图片失败', error))
					return true
				}
				return [EditorView.domEventHandlers({
					paste: (event, view) => insert(event, view),
					drop: (event, view) => insert(event, view),
				})]
			}, [lib, uploadImages])

			// 图片：编辑器原样写 img.src，这里把它换成本地 blob URL
			useEffect(() => {
				const root = hostRef.current
				if (root === null || lib === null) return undefined
				const fix = () => rewriteEditorImages(root, resolveAsset, ensureAssets)
				fix()
				const observer = new MutationObserver(fix)
				observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
				return () => observer.disconnect()
			}, [lib, resolveAsset, ensureAssets])

			if (lib === null) {
				// 兜底：编辑器起不来就退回原来的 textarea，至少还能改
				return h('textarea', {
					className: 'kb-editor',
					value,
					onChange: (event) => onChange(event.target.value),
				})
			}

			const Editor = lib.AtomicCodeMirrorEditor
			// 编辑器默认是深色配色；跟随宿主的浅色/深色标记
			const dark = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-ds-dark-theme')
			return h('div', { ref: hostRef, className: 'kb-cm', 'data-theme': dark ? 'dark' : 'light' },
				h(Editor, {
					markdownSource: value,
					documentId,
					onMarkdownChange: (next) => onChange(next),
					extensions,
				}))
		}

		/** 侧栏面板图标。 */
		function KnowledgeIcon({ size = 18 } = {}) {
			return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z' }),
				h('path', { d: 'M19 18v3H6.5A2.5 2.5 0 0 1 4 18.5' }),
				h('path', { d: 'M8 8h7M8 11.5h5' }))
		}

		function apply(ctx) {
			const connection = ctx.get('connection')
			if (connection === undefined || connection.rpc === undefined) {
				console.warn('knowledge-base: connection 服务不可用，知识库页面未挂载')
				return
			}
			const call = (endpoint, payload) => connection.rpc.call(CHANNEL, endpoint, payload ?? {}).then(unwrap)

			// 开新会话并把草稿填好；uiWorkspace 不存在时退化成把内容复制到剪贴板。
			const openChat = (note) => {
				const prompt = composePrompt(note)
				try {
					const uiWorkspace = ctx.get('uiWorkspace')
					if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
						uiWorkspace.startSession(undefined, { prompt })
						return
					}
				} catch {
					/* 落到下面的兜底 */
				}
				primitives.writeClipboard(prompt)
					.then(() => console.warn('knowledge-base: uiWorkspace 不可用，已把笔记内容复制到剪贴板'))
					.catch(() => {})
			}

			ctx.effect(() => {
				const tag = document.createElement('style')
				tag.dataset.plugin = 'dsh-knowledge-base'
				tag.textContent = STYLE
				document.head.append(tag)
				return () => tag.remove()
			}, 'knowledge-base: style')

			ctx.slots.inject('main', () => ctx.slots.register({
				name: 'main',
				key: 'knowledge-base',
				inject: () => ({ call, openChat }),
			}, KnowledgePage))

			ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
				name: 'sidebar.panellist',
				id: 'knowledge-base',
				order: 30,
				label: () => '知识库',
			}, KnowledgeIcon))
		}



		// 纯函数给测试用（DSH 的 loader 只读 apply / inject）。


export const testables = { sortNotes, isDoneTask, composePrompt, unwrap, extractAssetNames, assetNameOf }
export { apply, inject }
