const assert = require('node:assert/strict')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII='
const optionBody = {
  data: { visit_periods: ['09:00-12:00', '13:30-17:30'], areas: ['前台接待区', '办公会议区'], nda_text: '测试用保密与安全承诺' }
}

function mockWx() {
  const requests = []
  const drawing = []
  const deletedFiles = []
  const context = {}
  for (const method of ['scale', 'beginPath', 'arc', 'fill', 'moveTo', 'lineTo', 'stroke', 'clearRect']) {
    context[method] = (...args) => drawing.push({ method, args })
  }
  const canvas = { getContext: () => context }
  const fs = {
    readFile: options => options.success({ data: png }),
    unlink: options => deletedFiles.push(options.filePath)
  }
  const wx = {
    requests, drawing, deletedFiles, canvas, fs, envVersion: 'develop',
    getAccountInfoSync: () => ({ miniProgram: { envVersion: wx.envVersion } }),
    getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 375 }),
    getFileSystemManager: () => fs,
    canvasToTempFilePath: options => options.success({ tempFilePath: 'wxfile://test-signature.png' }),
    pageScrollTo() {},
    request(options) {
      requests.push(options)
      if (wx.handleRequest) wx.handleRequest(options)
      else options.success({ statusCode: 200, data: options.method === 'GET' ? optionBody : { id: 101 } })
    },
    createSelectorQuery() {
      return {
        in() { return this }, select() { return this }, fields() { return this },
        exec(callback) { callback([{ node: canvas, width: 300, height: 140 }]) }
      }
    }
  }
  return wx
}

function makePage(wx = mockWx()) {
  global.wx = wx
  let definition
  global.Page = value => { definition = value }
  const pagePath = require.resolve('../pages/index/index')
  delete require.cache[pagePath]
  require(pagePath)
  const page = Object.assign({}, definition, { data: structuredClone(definition.data) })
  page.setData = function (patch) {
    assert.equal(Boolean(this._unloaded), false, '卸载后不应更新页面')
    for (const [path, value] of Object.entries(patch)) {
      const keys = path.split('.')
      let target = this.data
      for (const key of keys.slice(0, -1)) target = target[key] ||= {}
      target[keys.at(-1)] = value
    }
  }
  return page
}

async function readyPage(wx = mockWx()) {
  const page = makePage(wx)
  await page.onLoad()
  page.onReady()
  return page
}

function sign(page) {
  page.beginSignature({ changedTouches: [{ identifier: 1, x: 10, y: 20 }] })
  page.moveSignature({ touches: [{ identifier: 1, x: 100, y: 40 }] })
  page.finishSignature({ changedTouches: [{ identifier: 1 }] })
}

function completeRequired(page) {
  page.onInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '  测试访客  ' } })
  page.onAgreementChange({ detail: { value: ['accepted'] } })
  sign(page)
}

module.exports = { png, optionBody, mockWx, makePage, readyPage, sign, completeRequired }

