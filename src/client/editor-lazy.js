// 编辑器的唯一入口：编辑器本体和 CM6 的 view 必须从**同一份 ESM** 里取。
// 之前主文件里用 require('@codemirror/view')，esbuild 按 CJS 条件解析到另一份拷贝，
// 于是出现两份 @codemirror/state，Facet 身份对不上（"Unrecognized extension value"）。
import { AtomicCodeMirrorEditor } from '@atomic-editor/editor'
import { EditorView } from '@codemirror/view'

export { AtomicCodeMirrorEditor, EditorView }
