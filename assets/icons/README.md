# 文件夹图标资源

这套 SVG 来自 massCode 的图标资源目录，Electron 与 Swift 两端各自持有一份、文件名完全一致：

- Electron：`src/renderer/assets/svg/icons/*.svg`（846 个）
- Swift：`apps/MassCodeNative/Resources/folder-icons/material/*.svg`（846 个，本轮从这里拷贝）

vault 里 `.meta.yaml` 的 `icon` 字段存的就是 `material:<文件名去掉 .svg>`，
所以这里保持同名同形，三个客户端才能显示成同一个图标。

SVG 特征：`viewBox="0 0 24 24"`，颜色写死在元素上（如 `style="fill:#7cb342"`），
不是 `currentColor`，因此深色模式下无需额外处理。

## 许可

这批彩色图标不是 massCode 自己的代码（massCode 仓库是 AGPL-3.0），上游是
**material-icon-theme**（MIT）一类的图标主题；`lucide:` 前缀对应 lucide（ISC），
但 Swift 端 `lucide/` 目录是空的、Electron 端用 npm 包渲染，所以本目录只放 material。

如果要对外分发本插件，建议核对一次原出处并在同目录补上该主题的 LICENSE 文本。
