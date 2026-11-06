const { getVisitorOptions, createVisitorRegistration } = require('../../utils/api')
const {
  createForm, parseOptions, validateForm, createPayload, validRegistrationId, submissionError
} = require('../../utils/registration')
const { exportSignature } = require('../../utils/signature')
const inputFields = ['name', 'phone', 'idNo', 'company', 'host', 'purpose']

Page({
  data: {
    form: createForm(),
    options: { visitPeriods: [], areas: [], ndaText: '' },
    optionsLoading: true,
    optionsReady: false,
    optionsError: false,
    periodIndex: 0,
    areaIndex: 0,
    submitting: false,
    submitError: '',
    errors: {},
    hasInk: false,
    canvasReady: false,
    canvasError: false,
    registrationId: null,
    summary: {}
  },

  onLoad() {
    this._unloaded = false
    this._activeTouchId = null
    this._submitting = false
    this.setData({ form: createForm() })
    return this.loadOptions()
  },

  onReady() {
    this.initSignature()
  },

  onHide() {
    this._activeTouchId = null
  },

  onUnload() {
    this._unloaded = true
    this._canvas = null
    this._context = null
  },

  onResize(event) {
    const width = event && event.size && event.size.windowWidth
    if (!Number.isFinite(width) || width === this._windowWidth) return
    if (this._canvas && !this._submitting && !this.data.registrationId) {
      const hadInk = this.data.hasInk
      this.initSignature()
      if (hadInk) this.setData({ 'errors.signature': '画布尺寸已变化，请重新签名' })
    }
  },

  async loadOptions() {
    if (this._loadingOptions || this._submitting || this.data.registrationId) return
    this._loadingOptions = true
    this.setData({
      optionsLoading: true, optionsError: false, optionsReady: false,
      'form.ndaAccepted': false, submitError: ''
    })
    try {
      const options = parseOptions(await getVisitorOptions())
      if (this._unloaded) return
      this.setData({
        options, optionsReady: true,
        periodIndex: Math.max(0, options.visitPeriods.indexOf(this.data.form.visitPeriod)),
        areaIndex: Math.max(0, options.areas.indexOf(this.data.form.area)),
        'form.visitPeriod': options.visitPeriods.includes(this.data.form.visitPeriod)
          ? this.data.form.visitPeriod : '',
        'form.area': options.areas.includes(this.data.form.area) ? this.data.form.area : ''
      })
    } catch (error) {
      if (!this._unloaded) this.setData({ optionsError: true })
    } finally {
      this._loadingOptions = false
      if (!this._unloaded) this.setData({ optionsLoading: false })
    }
  },

  onInput(event) {
    if (this._submitting) return
    const field = event.currentTarget.dataset.field
    if (!inputFields.includes(field)) return
    this.setData({
      ['form.' + field]: event.detail.value,
      ['errors.' + field]: '',
      submitError: ''
    })
  },

  onDateChange(event) {
    if (this._submitting) return
    this.setData({ 'form.visitDate': event.detail.value, submitError: '' })
  },

  onOptionChange(event) {
    if (this._submitting || !this.data.optionsReady) return
    const field = event.currentTarget.dataset.field
    if (field !== 'visitPeriod' && field !== 'area') return
    const values = field === 'visitPeriod' ? this.data.options.visitPeriods : this.data.options.areas
    const value = values[Number(event.detail.value)]
    if (value !== undefined) this.setData({ ['form.' + field]: value, [field === 'visitPeriod' ? 'periodIndex' : 'areaIndex']: Number(event.detail.value), submitError: '' })
  },

  onAgreementChange(event) {
    if (this._submitting || !this.data.optionsReady) return
    this.setData({
      'form.ndaAccepted': event.detail.value.includes('accepted'),
      'errors.ndaAccepted': '', submitError: ''
    })
  },

  initSignature() {
    if (this._unloaded || this._submitting || this.data.registrationId) return
    const version = (this._canvasVersion || 0) + 1
    this._canvasVersion = version
    this._activeTouchId = null
    this._context = null
    this._canvas = null
    this.setData({ hasInk: false, canvasReady: false, canvasError: false })
    wx.createSelectorQuery().in(this).select('#signatureCanvas')
      .fields({ node: true, size: true }).exec(result => {
        if (this._unloaded || version !== this._canvasVersion) return
        try {
          const surface = result && result[0]
          if (!surface || !surface.node || !surface.width || !surface.height) {
            throw new Error('Canvas unavailable')
          }
          const canvas = surface.node
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          this._windowWidth = info.windowWidth
          const ratio = Math.min(info.pixelRatio || 1, 3, 4096 / surface.width, 4096 / surface.height)
          canvas.width = Math.floor(surface.width * ratio)
          canvas.height = Math.floor(surface.height * ratio)
          const context = canvas.getContext('2d')
          context.scale(ratio, ratio)
          context.lineWidth = 2
          context.lineCap = 'round'
          context.lineJoin = 'round'
          context.strokeStyle = '#17365d'
          context.fillStyle = '#17365d'
          this._canvas = canvas
          this._context = context
          this._canvasSize = { width: surface.width, height: surface.height }
          this.setData({ canvasReady: true })
        } catch (error) {
          this.setData({ canvasError: true })
        }
      })
  },

  beginSignature(event) {
    if (!this._context || this._submitting || this._activeTouchId !== null) return
    const touch = (event.changedTouches || event.touches || [])[0]
    if (!touch || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return
    this._activeTouchId = touch.identifier === undefined ? 0 : touch.identifier
    const context = this._context
    context.beginPath()
    context.arc(touch.x, touch.y, 1, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.moveTo(touch.x, touch.y)
    this.setData({ hasInk: true, 'errors.signature': '', submitError: '' })
  },

  moveSignature(event) {
    if (!this._context || this._submitting || this._activeTouchId === null) return
    const touch = (event.touches || []).find(value =>
      (value.identifier === undefined ? 0 : value.identifier) === this._activeTouchId)
    if (!touch || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return
    this._context.lineTo(touch.x, touch.y)
    this._context.stroke()
    this._context.beginPath()
    this._context.moveTo(touch.x, touch.y)
  },

  finishSignature(event) {
    const ended = (event.changedTouches || []).some(touch =>
      (touch.identifier === undefined ? 0 : touch.identifier) === this._activeTouchId)
    if (ended) this._activeTouchId = null
  },

  clearSignature() {
    if (this._submitting || !this._context) return
    this._activeTouchId = null
    this._context.clearRect(0, 0, this._canvasSize.width, this._canvasSize.height)
    this._context.beginPath()
    this.setData({ hasInk: false, 'errors.signature': '', submitError: '' })
  },

  async submitRegistration() {
    if (this._submitting || !this.data.optionsReady || this.data.registrationId) return
    const errors = validateForm(this.data.form, this.data.hasInk, this._activeTouchId !== null)
    this.setData({ errors, submitError: '' })
    const firstError = Object.keys(errors)[0]
    if (firstError) {
      wx.pageScrollTo({ selector: '#field-' + firstError, duration: 250 })
      return
    }
    // 在首次异步操作前加锁，冻结本次登记内容和签名。
    this._submitting = true
    const form = Object.assign({}, this.data.form)
    this.setData({ submitting: true })
    let stage = 'signature'
    try {
      const signatureBase64 = await exportSignature(this._canvas, this)
      if (this._unloaded) return
      stage = 'request'
      const result = await createVisitorRegistration(createPayload(form, signatureBase64))
      if (this._unloaded) return
      if (!validRegistrationId(result)) {
        this.setData({ submitError: '登记结果暂未确认，请联系前台核实后再提交' })
        return
      }
      this.setData({
        registrationId: result.id,
        summary: {
          name: form.name.trim(), visitDate: form.visitDate,
          visitPeriod: form.visitPeriod, host: form.host.trim()
        }
      })
      this._canvas = null
      this._context = null
      wx.pageScrollTo({ scrollTop: 0, duration: 250 })
    } catch (error) {
      if (!this._unloaded) {
        this.setData({ submitError: stage === 'signature' ? error.message : submissionError(error) })
      }
    } finally {
      this._submitting = false
      if (!this._unloaded) this.setData({ submitting: false })
    }
  }
})

