const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createForm, parseOptions, validateForm, createPayload, validRegistrationId
} = require('../utils/registration')
const { exportSignature, validateSignature } = require('../utils/signature')
const { getVisitorOptions, createVisitorRegistration } = require('../utils/api')
const { png, optionBody, mockWx, makePage, readyPage, sign, completeRequired } = require('./helpers')

test('日期保留本地年月日；仅姓名、承诺和签名前端必填', () => {
  const form = createForm(new Date(2026, 9, 14, 0, 0))
  assert.equal(form.visitDate, '2026-10-14')
  assert.deepEqual(Object.keys(validateForm(form, false, false)), ['name', 'ndaAccepted', 'signature'])
  Object.assign(form, { name: '测试访客', ndaAccepted: true })
  assert.deepEqual(validateForm(form, true, false), {})
  assert.ok(validateForm(form, true, true).signature)
  form.name = ' '.repeat(3)
  assert.ok(validateForm(form, true, false).name)
  form.name = '字'.repeat(101)
  assert.ok(validateForm(form, true, false).name)
})

test('选项必须包含有效时段、区域和承诺；不替换服务端的原始值', () => {
  assert.equal(parseOptions(optionBody).visitPeriods[0], '09:00-12:00')
  for (const data of [
    null, {}, { ...optionBody.data, visit_periods: [] },
    { ...optionBody.data, areas: [''] }, { ...optionBody.data, nda_text: ' ' },
    { ...optionBody.data, areas: [123] }
  ]) assert.throws(() => parseOptions({ data }))
  assert.equal(parseOptions({ data: { ...optionBody.data, areas: [' 区域 A '] } }).areas[0], ' 区域 A ')
})

test('请求字段使用 snake_case；文本去首尾空格；签名不含 data URL 前缀', () => {
  const form = Object.assign(createForm(), {
    name: ' 测试访客 ', phone: ' 00123 ', idNo: ' E001 ', company: ' 测试单位 ',
    visitPeriod: '09:00-12:00', host: ' 测试接待人 ', area: '前台接待区',
    purpose: ' 测试访问 ', ndaAccepted: true
  })
  assert.deepEqual(createPayload(form, png), {
    name: '测试访客', phone: '00123', id_no: 'E001', company: '测试单位',
    visit_date: form.visitDate, visit_period: '09:00-12:00', host: '测试接待人',
    area: '前台接待区', purpose: '测试访问', nda_accepted: true, signature_base64: png
  })
  for (const body of [null, {}, { id: '101' }, { id: 0 }, { id: -1 }, { id: 1.5 }]) {
    assert.equal(validRegistrationId(body), false)
  }
  assert.equal(validRegistrationId({ id: 101 }), true)
})

test('签名大小按解码字节数判断；2 MiB 可用，超出即拒绝', () => {
  assert.equal(validateSignature(png), png)
  const boundary = Buffer.alloc(2 * 1024 * 1024).toString('base64')
  assert.equal(validateSignature(boundary), boundary)
  assert.throws(() => validateSignature(Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')), /过大/)
  for (const value of ['', null, 'data:image/png;base64,' + png, png + '\n']) {
    assert.throws(() => validateSignature(value))
  }
})

test('公开接口免登录；按小程序版本切换环境；POST 使用 data 包装', async () => {
  const wx = global.wx = mockWx()
  await getVisitorOptions()
  assert.equal(wx.requests[0].url, 'https://api.haptest.com/v1/haplabentry/public/visitors/options')
  assert.equal(wx.requests[0].method, 'GET')
  assert.equal(wx.requests[0].timeout, 15000)
  assert.equal(wx.requests[0].header['Content-Type'], 'application/json')
  wx.envVersion = 'trial'
  await createVisitorRegistration({ name: '测试访客' })
  assert.equal(wx.requests[1].url, 'https://api.haptest.com/v1/haplabentry/public/visitors')
  assert.deepEqual(wx.requests[1].data, { data: { name: '测试访客' } })
  wx.envVersion = 'release'
  await getVisitorOptions()
  assert.equal(wx.requests[2].url, 'https://api.hapyun.com/v1/haplabentry/public/visitors/options')
  wx.envVersion = 'unknown'
  await assert.rejects(getVisitorOptions(), /环境/)
  assert.equal(wx.requests.length, 3)
})

test('选项失败后禁止提交；手动重载成功，保留姓名并重新确认承诺', async () => {
  const wx = mockWx()
  wx.handleRequest = options => options.success({ statusCode: 503, data: {} })
  const page = await readyPage(wx)
  page.onInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '测试访客' } })
  assert.equal(page.data.optionsError, true)
  assert.equal(page.data.optionsReady, false)
  await page.submitRegistration()
  assert.equal(wx.requests.length, 1)
  wx.handleRequest = options => options.success({ statusCode: 200, data: optionBody })
  await page.loadOptions()
  assert.equal(page.data.optionsReady, true)
  assert.equal(page.data.optionsError, false)
  assert.equal(page.data.form.name, '测试访客')
  assert.equal(page.data.form.ndaAccepted, false)
  assert.equal(wx.requests.length, 2)
})

test('HTTP 200 但选项结构不正确时不启用表单提交', async () => {
  const wx = mockWx()
  wx.handleRequest = options => options.success({ statusCode: 200, data: { data: {} } })
  const page = await readyPage(wx)
  assert.equal(page.data.optionsError, true)
  assert.equal(page.data.optionsReady, false)
  await page.submitRegistration()
  assert.equal(wx.requests.length, 1)
})

test('原生选择器保存字符串原值和当前索引；未知字段不能改动表单', async () => {
  const page = await readyPage()
  page.onOptionChange({ currentTarget: { dataset: { field: 'visitPeriod' } }, detail: { value: '1' } })
  page.onOptionChange({ currentTarget: { dataset: { field: 'area' } }, detail: { value: '1' } })
  assert.equal(page.data.form.visitPeriod, '13:30-17:30')
  assert.equal(page.data.periodIndex, 1)
  assert.equal(page.data.form.area, '办公会议区')
  assert.equal(page.data.areaIndex, 1)
  page.onInput({ currentTarget: { dataset: { field: 'ndaAccepted' } }, detail: { value: true } })
  assert.equal(page.data.form.ndaAccepted, false)
  await page.loadOptions()
  assert.equal(page.data.periodIndex, 1)
  assert.equal(page.data.areaIndex, 1)
})

test('签名画布适配像素比；空白签名和未结束笔画不能提交', async () => {
  const wx = mockWx()
  const page = await readyPage(wx)
  assert.equal(page.data.canvasReady, true)
  assert.equal(wx.canvas.width, 900)
  assert.equal(wx.canvas.height, 420)
  page.setData({ 'form.name': '测试访客', 'form.ndaAccepted': true })
  await page.submitRegistration()
  assert.ok(page.data.errors.signature)
  page.beginSignature({ changedTouches: [{ identifier: 1, x: 10, y: 10 }] })
  page.finishSignature({ changedTouches: [{ identifier: 2 }] })
  await page.submitRegistration()
  assert.ok(page.data.errors.signature)
  page.finishSignature({ changedTouches: [{ identifier: 1 }] })
  await page.submitRegistration()
  assert.equal(page.data.registrationId, 101)
  assert.equal(wx.requests.filter(value => value.method === 'POST').length, 1)
})

test('清除签名和画布尺寸变化都会要求重新签名', async () => {
  const wx = mockWx()
  const page = await readyPage(wx)
  completeRequired(page)
  page.clearSignature()
  assert.equal(page.data.hasInk, false)
  assert.ok(wx.drawing.some(value => value.method === 'clearRect'))
  await page.submitRegistration()
  assert.ok(page.data.errors.signature)
  assert.equal(wx.requests.length, 1)
  sign(page)
  page.onResize({ size: { windowWidth: 375, windowHeight: 400 } })
  assert.equal(page.data.hasInk, true, '键盘改变可用高度时保留签名')
  page.onResize({ size: { windowWidth: 500, windowHeight: 400 } })
  assert.equal(page.data.hasInk, false)
  assert.match(page.data.errors.signature, /重新签名/)
})

test('快速连点只提交一次；导出期间冻结所有输入；成功后不能重复提交', async () => {
  const wx = mockWx()
  let finishExport
  wx.canvasToTempFilePath = options => { finishExport = options.success }
  const page = await readyPage(wx)
  completeRequired(page)
  const first = page.submitRegistration()
  const second = page.submitRegistration()
  assert.equal(page.data.submitting, true)
  page.onInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '其他姓名' } })
  page.onAgreementChange({ detail: { value: [] } })
  page.clearSignature()
  assert.equal(page.data.form.name, '  测试访客  ')
  assert.equal(page.data.form.ndaAccepted, true)
  assert.equal(page.data.hasInk, true)
  finishExport({ tempFilePath: 'wxfile://test-signature.png' })
  await Promise.all([first, second])
  assert.equal(page.data.registrationId, 101)
  assert.equal(page.data.summary.name, '测试访客')
  const posts = wx.requests.filter(value => value.method === 'POST')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].data.data.signature_base64, png)
  assert.equal(posts[0].data.data.name, '测试访客')
  assert.deepEqual(wx.deletedFiles, ['wxfile://test-signature.png'])
  assert.equal(page.data.submitting, false)
  await page.submitRegistration()
  assert.equal(wx.requests.filter(value => value.method === 'POST').length, 1)
})

test('服务端 400 展示 message，保留输入及签名，允许访客修正后手动提交', async () => {
  const wx = mockWx()
  const page = await readyPage(wx)
  completeRequired(page)
  wx.handleRequest = options => options.success({ statusCode: 400, data: { message: '到访时段或访问区域无效' } })
  await page.submitRegistration()
  assert.equal(page.data.submitError, '到访时段或访问区域无效')
  assert.equal(page.data.form.name, '  测试访客  ')
  assert.equal(page.data.hasInk, true)
  assert.equal(page.data.form.ndaAccepted, true)
  assert.equal(page.data.registrationId, null)
  wx.handleRequest = options => options.success({ statusCode: 200, data: { id: 102 } })
  await page.submitRegistration()
  assert.equal(page.data.registrationId, 102)
  assert.equal(wx.requests.filter(value => value.method === 'POST').length, 2)
})

test('POST 断网提示前台核实，保留表单，不自动重试', async () => {
  const wx = mockWx()
  const page = await readyPage(wx)
  completeRequired(page)
  wx.handleRequest = options => options.fail({ errMsg: 'request:fail timeout' })
  await page.submitRegistration()
  await new Promise(resolve => setImmediate(resolve))
  assert.match(page.data.submitError, /结果暂未确认.*前台核实/)
  assert.equal(page.data.registrationId, null)
  assert.equal(page.data.hasInk, true)
  assert.equal(page.data.submitting, false)
  assert.equal(wx.requests.filter(value => value.method === 'POST').length, 1)
})

test('异常成功响应不显示登记成功，不自动重试', async () => {
  for (const body of [null, {}, { id: '101' }, { id: -1 }]) {
    const wx = mockWx()
    const page = await readyPage(wx)
    completeRequired(page)
    wx.handleRequest = options => options.success({ statusCode: 200, data: body })
    await page.submitRegistration()
    assert.equal(page.data.registrationId, null)
    assert.match(page.data.submitError, /前台核实/)
    assert.equal(wx.requests.filter(value => value.method === 'POST').length, 1)
  }
})

test('HTTP 500 展示提交失败，保留内容', async () => {
  const wx = mockWx()
  const page = await readyPage(wx)
  completeRequired(page)
  wx.handleRequest = options => options.success({ statusCode: 500, data: { message: 'internal' } })
  await page.submitRegistration()
  assert.equal(page.data.submitError, '提交失败，请稍后重试')
  assert.equal(page.data.hasInk, true)
  assert.equal(page.data.form.ndaAccepted, true)
})

test('签名导出失败不调用登记接口，解除提交锁并保留签名', async () => {
  const wx = mockWx()
  wx.canvasToTempFilePath = options => options.fail()
  const page = await readyPage(wx)
  completeRequired(page)
  await page.submitRegistration()
  assert.match(page.data.submitError, /签名导出失败/)
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.hasInk, true)
  assert.equal(wx.requests.length, 1)
})

test('签名读取失败也会清理本次临时文件', async () => {
  const wx = global.wx = mockWx()
  wx.fs.readFile = options => options.fail()
  await assert.rejects(exportSignature(wx.canvas, {}), /读取失败/)
  assert.deepEqual(wx.deletedFiles, ['wxfile://test-signature.png'])
})

test('导出签名期间离开页面，不再发起登记请求', async () => {
  const wx = mockWx()
  let finishExport
  wx.canvasToTempFilePath = options => { finishExport = options.success }
  const page = await readyPage(wx)
  completeRequired(page)
  const pending = page.submitRegistration()
  page.onUnload()
  finishExport({ tempFilePath: 'wxfile://test-signature.png' })
  await pending
  assert.equal(wx.requests.filter(value => value.method === 'POST').length, 0)
})

test('页面卸载后忽略迟到的选项响应', async () => {
  const wx = mockWx()
  let finishRequest
  wx.handleRequest = options => { finishRequest = options.success }
  const page = makePage(wx)
  const pending = page.onLoad()
  page.onUnload()
  finishRequest({ statusCode: 200, data: optionBody })
  await pending
  assert.equal(page.data.optionsReady, false)
})

test('画布初始化失败可手动重载', async () => {
  const wx = mockWx()
  const original = wx.createSelectorQuery
  wx.createSelectorQuery = () => ({
    in() { return this }, select() { return this }, fields() { return this },
    exec(callback) { callback([null]) }
  })
  const page = await readyPage(wx)
  assert.equal(page.data.canvasReady, false)
  assert.equal(page.data.canvasError, true)
  wx.createSelectorQuery = original
  page.initSignature()
  assert.equal(page.data.canvasReady, true)
  assert.equal(page.data.canvasError, false)
})

