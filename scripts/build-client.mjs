// 构建客户端：src/client/index.js -> lib/client.js
//
// 产物必须是 DSH 客户端模块加载器的形状：
//   window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
// react / react-dom / primitives 保持 external，由宿主模块表提供（避免双 React）；
// CodeMirror 与 @atomic-editor/editor 打进产物，进入编辑态时才初始化（懒加载）。
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const editorCss = readFileSync('node_modules/@atomic-editor/editor/dist/styles/inline-preview.css', 'utf8')

const result = await build({
  entryPoints: ['src/client/index.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110', 'safari16'],
  minify: true,
  legalComments: 'none',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  define: {
    __ATOMIC_EDITOR_CSS__: JSON.stringify(editorCss),
  },
})

const code = result.outputFiles[0].text
const banner = `// 由 scripts/build-client.mjs 生成，请改 src/client/index.js 后重新构建。\n`
const wrapper = `${banner}window.__ModuleLoader__.load({
  id: 'dsh-knowledge-base',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
${code}
    return module.exports
  },
})
`
mkdirSync('lib', { recursive: true })
writeFileSync('lib/client.js', wrapper)
const kb = (Buffer.byteLength(wrapper) / 1024).toFixed(0)
const gz = (await import('node:zlib')).gzipSync(Buffer.from(wrapper)).length / 1024
console.log(`lib/client.js ${kb} KB（gzip ${gz.toFixed(0)} KB）`)
