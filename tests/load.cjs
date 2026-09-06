const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

exports.load = function load(entry, mocks = {}, globals = {}, cache = new Map()) {
  const file = path.resolve(__dirname, '..', entry)
  if (cache.has(file)) return cache.get(file)
  const out = {}
  cache.set(file, out)
  const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', '{}')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  vm.runInNewContext(code, { exports: out, console, ...globals, require: (name) => {
    if (name in mocks) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const target = path.resolve(path.dirname(file), name)
    const extension = fs.existsSync(target + '.ts') ? '.ts' : '.tsx'
    return load(target + extension, mocks, globals, cache)
  } }, { filename: file })
  return out
}
