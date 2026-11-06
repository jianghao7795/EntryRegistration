const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const files = []
function visit(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.agents', '.codex'].includes(item.name)) continue
    const file = path.join(directory, item.name)
    if (item.isDirectory()) visit(file)
    else files.push(file)
  }
}
visit(root)
for (const file of files) {
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'))
  if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr || 'JavaScript check failed: ' + file)
  }
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
for (const page of app.pages) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(root, page + '.' + extension))) throw new Error('Missing page file: ' + page)
  }
  const markup = fs.readFileSync(path.join(root, page + '.wxml'), 'utf8')
  const source = fs.readFileSync(path.join(root, page + '.js'), 'utf8')
  for (const match of markup.matchAll(/(?:bind|catch):?(?:tap|input|change|touchstart|touchmove|touchend|touchcancel)="([A-Za-z_$][\w$]*)"/g)) {
    if (!source.includes(match[1] + '(')) throw new Error('Missing WXML event handler: ' + match[1])
  }
}
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
if (!project.packOptions.ignore.some(item => item.type === 'folder' && item.value === 'tests')) {
  throw new Error('Tests must be excluded from the mini program package')
}
console.log('JavaScript、JSON、页面文件、事件绑定和打包排除检查通过')

