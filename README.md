# dsh-knowledge-base

把 massCode 的 markdown vault（笔记 + 任务）接进 DeepSeek Harness：左侧文件夹树、中间笔记列表、右侧正文，
并且从任意一篇笔记 / 任务一键唤起 DSH 会话问答。

数据不复制、不建索引：插件直接读写 vault 里的 `.md` 文件，与 Electron massCode、Spark Studio 共用同一份。

功能盘点、缺口与后续优化（含落点和验收标准）见 **[docs/ROADMAP.md](docs/ROADMAP.md)**。

## 数据约定

vault 布局（实测自 `~/Library/Mobile Documents/com~apple~CloudDocs/massCode/markdown-vault`）：

```
notes/
  <文件夹>/.meta.yaml       # id / name / icon / orderIndex，文件夹本身就是目录
  <文件夹>/<笔记>.md        # frontmatter 是笔记元数据，正文是 markdown
  .masscode/state.json      # 仅 UI 状态 + id 计数器 + filePath→id 映射
  assets/                   # 图片附件，不是文件夹
```

笔记 frontmatter：`id / name / folderId / description / tags / isDeleted / isFavorites /
createdAt / updatedAt`，任务另加 `type: task / status / priority / due`。

写回策略：

- 更新时调用方必须带 `mtimeMs`，宿主侧写入前重新 stat，对不上就拒绝（防止和另外两个客户端互相覆盖）；
- 只重写值真的变了的 frontmatter 行，未知字段、引号风格、键顺序逐字节保留；
- 新建笔记会同时更新 `state.json` 的 `notes[]` 与 id 计数器（改前改后核对 mtime，被抢先就重来），
  文件用 `wx` 打开，绝不覆盖同名笔记；写文件走「临时文件 + rename」。

## 宿主侧：RPC 通道

`connection.register(webCtx, "/knowledge-base", handler)`，`handler(endpoint, payload) → { ok, value }`。

| endpoint | payload | 说明 |
|---|---|---|
| `config/read` | — | 当前 vault 路径、默认值 |
| `config/set` | `{ vaultRoot }` | 改 vault 路径（存 `$DSH_HOME/knowledge-base.json`） |
| `tree` | — | 文件夹 + 笔记列表（含任务字段） |
| `note` | `{ path }` | 单篇：meta / fields / body / mtimeMs |
| `note/save` | `{ path, body?, fields?, mtimeMs }` | 写回，自动更新 `updatedAt`；mtime 对不上拒绝 |
| `note/create` | `{ folderPath, name, body?, asTask? }` | 新建（同名自动加序号） |
| `note/rename` | `{ path, name }` | 重命名笔记（改文件名 + frontmatter `name` + `state.json` 路径） |
| `note/move` | `{ path, folderPath }` | 移动到另一个文件夹 |
| `note/delete` | `{ path }` | 移到回收站（`isDeleted: 1` + 挪进 `.masscode/trash/`） |
| `note/status` | `{ path, status }` | 任务状态（`todo` / `done`） |
| `note/kind` | `{ path, isTask }` | 笔记 ↔ 任务互转 |
| `note/order` | `{ folderPath, order: string[] }` | 批量写 `orderIndex`，顺序即数组顺序 |
| `folder/create` | `{ parentPath, name? }` | 新建文件夹（写 `.meta.yaml` + 递增 `folderId`，同名加序号） |
| `folder/rename` | `{ path, name }` | 重命名：移动目录 + 改 `state.json` 里的 filePath 前缀，同级重名拒绝 |
| `folder/icon` | `{ path, icon }` | 换图标（emoji / `material:` / `lucide:`），空值清除 |
| `folder/move` | `{ path, parentPath }` | 移动文件夹（拒绝移进自己或子孙） |
| `folder/delete` | `{ path }` | 删除文件夹：笔记先全部移入回收站，再删目录与 `state.json` 条目 |
| `icon/list` | — | 846 个 material 图标清单（扫 `assets/icons/material`） |
| `icon/svgs` | `{ values: string[] }` | 批量取 SVG 文本（≤200 个），进程内缓存 |
| `asset/meta` | `{ names: string[] }` | 笔记图片的存在性与大小（≤60 个） |
| `asset/read` | `{ names: string[] }` | 图片字节，base64（≤12 个，单个 ≤8 MB） |
| `asset/write` | `{ mime, base64 }` | 写入粘贴/拖拽的图片，返回文件名与要插入的 markdown |
| `trash/list` | — | 回收站列表（名字 / 原位置 / 删除时间） |
| `trash/restore` | `{ path }` | 恢复到原文件夹（原文件夹没了回根目录，重名加序号） |
| `trash/purge` | `{ path }` | 从磁盘彻底删除单篇 + 清 `state.json` 条目 |
| `trash/empty` | — | 清空回收站，返回删除数量 |
| `search` | `{ query }` | 标题 + 正文检索，返回命中片段（标题命中权重高） |

## 客户端

`window.__ModuleLoader__.load({ id, factory })`，`require("react")` /
`require("@deepseek-ai/dsh-client-ui-primitives")`，通过 `connection.rpc.call(CHANNEL, endpoint, payload)` 取数据。

挂载点：

- `main` → 知识库整页（三栏）；
- `sidebar.panellist` → 侧栏图标，点开整页。

「问 DSH」调 `ctx.get("uiWorkspace").startSession(workspaceId, { prompt })`：由 DSH 自己开新会话，
把笔记标题、路径、正文和一句待补的提问放进输入框草稿，用户补完即可发送（不自动发，避免误触）。
`uiWorkspace` 不可用时退化成把草稿复制到剪贴板。

## 首次使用与 vault 路径

- 默认目录：`~/Documents/DSBotKnowledge`。第一次打开时自动建好 `notes/`、`notes/assets/`、
  `notes/.masscode/state.json`，并放一篇《开始使用》——用户不需要先配置什么。
- 想换目录：列表工具栏的 **⚙**，可以直接填路径，也可以点「用默认目录」回到默认。
  改完立即生效（重新扫描），不用重启。
- **不做自动探测**：massCode / Spark Studio 记录的旧 vault 属于上一代客户端，最后会废弃，
  所以不猜它们的路径。要复用既有 vault，在设置里指过去即可。
- 配置文件：`$DSH_HOME/knowledge-base.json`（内容是 `{ vaultRoot, source }`）；
  指向空目录时会自动补齐 vault 骨架。

## 编辑器

`lib/client.js` 是**构建产物**，源码在 `src/client/index.js`。产物随仓库提交，clone 下来可以直接
`file:` 装机；改了 `src/` 记得重新 build 并一起提交。`lib/index.js`（宿主 RPC）和 `lib/vault.js`
（vault 读写）是手写源码，不在 `src/` 下。

```sh
npm run build      # esbuild -> lib/client.js（658 KB / gzip 225 KB）
npm test           # vault 层 + 客户端结构
```

- 编辑态用 **CodeMirror 6 + [@atomic-editor/editor](https://github.com/kenforthewin/atomic-editor)** 的 Obsidian 式实时预览：
  光标所在行露出 markdown 源码，其余行就地渲染（标题、加粗、表格、任务框、图片）。
- 装饰层只读，**磁盘上的 markdown 逐字节不变**——这是和 Electron / Swift 共用同一份 vault 的前提。
- `react` / `react-dom` / `primitives` 由 DSH 的模块表提供（external，避免双 React）；
  CodeMirror 与编辑器打进 bundle，但**懒加载**：只有进入编辑态才初始化。
- 主题跟随宿主：浅色/深色靠 `data-theme` 标记，颜色 token 映射到 `--bt-*`。
- 图片：编辑器只认 `img.src` 原值，所以外面挂了个 MutationObserver，把
  `masscode://notes-asset/xxx` 换成我们自己的 blob URL（复用图片管线）。
- 粘贴/拖拽图片：CM6 的 `domEventHandlers` → `asset/write` → 在光标处插入引用。
- 编辑器起不来时自动退回 textarea。

注意：`@codemirror/view` 必须和编辑器走**同一个 ESM 入口**（见 `src/client/editor-lazy.js`）。
早先在主文件里直接 `require('@codemirror/view')`，esbuild 按 CJS 条件解析出另一份拷贝，
于是两份 `@codemirror/state`、`Facet` 身份对不上，报 "Unrecognized extension value"。

## 安装

作为本地包装进 profile（`~/.ds-bot/profiles/ds-bot`）：

```sh
# 先 clone 或准备好插件目录，然后
cd ~/.ds-bot/profiles/ds-bot
pnpm add "file:/path/to/dsh-knowledge"    # 换成你机器上的实际路径
# package.json 的 dsh.profile.bundles 里加上 dsh-knowledge-base
```

依赖：`pnpm install` 需要装 `node_modules`（构建才用到 esbuild；运行时装机只读取 `lib/`）。
`react` / `react-dom` / `@deepseek-ai/dsh-client-ui-primitives` 由宿主模块表提供，不要重复安装。

没有 HMR 的 profile 需要重启 DSH 才会加载新插件；只改 `lib/client.js` 时刷新页面（⌘⇧R）即可。

## 测试

```sh
npm test                    # 两条都跑
node test/vault.test.mjs    # 临时 vault：扫描 / 读写 / mtime 冲突 / 新建 / 文件夹 / 图片 / 粘贴写入
node test/client.test.mjs   # 模块契约 / 插槽注册 / 问 DSH 草稿 / 排序纯函数与任务完成判断 / 图片引用解析
```

## 交互

- 文件夹树：点一行 = 选中 + 展开（和 Swift 客户端一致），箭头单独控制收起/展开；「+」新建文件夹，建在当前选中的文件夹下，没选中就建在根目录。
- 每行悬停出现「⋯」：改名字（回车/「改」提交，Esc 取消）和换图标。图标面板两个页签：
  **图标**（846 个 material SVG，搜索 + 分页懒加载，和 Electron/Swift 显示完全一致）和
  **Emoji**（16 个，直接存 emoji 字符，另两个客户端也认）。
- 图标资源在 `assets/icons/material/`（846 个 SVG，0.9 MB），按需通过 RPC 取、按 value 永久缓存；
  树里同时最多十几个图标，一次批量请求就够。
- 新建笔记：列表上方的输入框回车即建（留在当前文件夹），也可点「+」。**新建只建笔记**；
  要任务就在详情里点「转为任务」（反过来也能转回普通笔记）。
- 笔记行：右键或「⋯」出菜单 —— 重命名 / 移动到… / 上移 / 下移 / 删除（进回收站，二次确认）。
  任务行前面是可点的圆圈，勾完自动沉到已完成区，取消勾回上面。桌面支持拖拽排序，手机用上移/下移。
- 文件夹行：「⋯」出六项 —— 设置图标 / 新建子文件夹 / 新建子笔记 / 重命名 / 移动到… / 删除。
  删除时先把笔记全部移入回收站再删目录，二次确认里写清了这一点。
- 列表顶部：搜索框、只看未完成开关、刷新、⚙（vault 路径）。**没有**「任务 / 今天 / 即将到期 / 已完成」筛选 tab。
- 回收站：树底部一行（带数量）。每条给「恢复 / 彻底删除」，顶部的「清空回收站」是整个回收站级别的操作，
  三个动作都有二次确认；回收站里搜索只按名字过滤，不走全文。
- 手机（≤600px）：单列下钻，先列表后正文，左上角返回；文件夹树隐藏。
- 正文图片：`masscode://notes-asset/<文件名>` 会被解析成 vault `notes/assets/` 下的文件，
  通过 RPC 取回 base64 → Blob → `blob:` URL 交给 `MarkdownText` 的 `pathImages`。
  ≤1.5 MB 的图自动加载，更大的显示「加载 N 张大图（X MB）」按钮，点了才取。
  blob URL 按「16 张 / 24 MB」双向 LRU 淘汰并 revoke。
- **默认就是编辑器**：没有"预览/编辑"开关，打开笔记看到的是渲染后的内容，点进去（光标所在行会露出 markdown 源码）直接改；有改动时才出现「保存 / 撤销」，撤销会重挂编辑器回到文件里的版本。
- 正文颜色用继承来的 `currentColor`，不依赖宿主的具体主题 token，浅色/深色都不会出现"浅底浅字"。
- 编辑态可以**直接粘贴或拖入图片**：读字节 → `asset/write` 写进 `notes/assets/`（文件名 12 字节随机 →
  base64url 去 padding，16 位，和 Swift 的 `randomAssetId` 一致；`wx` 写入不覆盖）→ 在光标处插入
  `![](masscode://notes-asset/<文件名>)`，并立即取回该图让预览显示。原样写入不做压缩。

## 已知缺口

完整的缺口清单、技术落点和验收标准在 **[docs/ROADMAP.md](docs/ROADMAP.md)**（分 P0–P6，含「明确不做」与建议顺序）。
这里只留几条最要紧的：

- **切换笔记时未保存的改动会静默丢失**：`openNote` 不检查 dirty，也没有 `beforeunload`；全靠手动 ⌘S（P0-1）。
- **看不到另两个客户端的改动**：vault 变更没有推送到页面，只能手点刷新；本地有草稿时写回会撞 mtime 冲突，
  而现在冲突只报一行错，没有「覆盖 / 放弃 / 另存副本」三条路（P0-2、P0-3）。
- 列表第二行显示的是所在文件夹，不是正文摘要；搜索有片段但没高亮、打开后也不定位到命中处（P1-1、P1-2）。
- 文件夹树按名字排序，`orderIndex` 读了没用；文件夹不能拖拽移动（P2-2）。
- 任务优先级 / 截止日期只能看不能改；逾期没有提示（P2-3）。
- 手机上树被隐藏，因此不能新建文件夹、换图标、移动文件夹；行操作没有长按菜单（P4）。
- 全库问答（检索多篇再汇总）、选中片段问 DSH、回答沉淀成笔记都还没做（P5）。
- 单张超过 8 MB 的图片不返回（避免撑爆 RPC 通道），会退化成 alt 文本；没有点击放大（灯箱）（P3）。
- wiki link `[[笔记]]` 编辑器支持但回调没接、回收站没有自动清理 —— 真实数据里 0 使用，排在最后。
