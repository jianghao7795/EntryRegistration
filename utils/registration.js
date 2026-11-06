function createForm(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return {
    name: '', phone: '', idNo: '', company: '',
    visitDate: [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-'),
    visitPeriod: '', host: '', area: '', purpose: '', ndaAccepted: false
  }
}

function parseOptions(body) {
  const data = body && body.data
  const validList = values => Array.isArray(values) && values.length > 0 &&
    values.every(value => typeof value === 'string' && Boolean(value.trim()))
  if (!data || !validList(data.visit_periods) || !validList(data.areas) ||
      typeof data.nda_text !== 'string' || !data.nda_text.trim()) {
    throw new Error('Invalid registration options')
  }
  return { visitPeriods: data.visit_periods, areas: data.areas, ndaText: data.nda_text }
}

// 与现有网页保持一致：仅姓名、承诺确认、手写签名为前端必填项。
function validateForm(form, hasInk, drawing) {
  const errors = {}
  const name = form.name.trim()
  if (!name) errors.name = '请填写姓名'
  else if (Array.from(name).length > 100) errors.name = '姓名最多 100 个字符'
  if (!form.ndaAccepted) errors.ndaAccepted = '请阅读并同意保密与安全承诺'
  if (!hasInk || drawing) errors.signature = '请完成手写签名'
  return errors
}

function createPayload(form, signatureBase64) {
  return {
    name: form.name.trim(), phone: form.phone.trim(), id_no: form.idNo.trim(),
    company: form.company.trim(), visit_date: form.visitDate,
    visit_period: form.visitPeriod, host: form.host.trim(), area: form.area,
    purpose: form.purpose.trim(), nda_accepted: form.ndaAccepted,
    signature_base64: signatureBase64
  }
}

function validRegistrationId(body) {
  return Boolean(body && Number.isSafeInteger(body.id) && body.id > 0)
}

function submissionError(error) {
  if (error.network) return '网络异常，登记结果暂未确认，请联系前台核实后再提交'
  if (!error.response) return '提交失败，请稍后重试'
  if (error.response.statusCode >= 500) return '提交失败，请稍后重试'
  const body = error.response.data
  return body && typeof body.message === 'string' && body.message.trim()
    ? body.message : '提交失败，请检查登记信息后重试'
}

module.exports = {
  createForm, parseOptions, validateForm, createPayload, validRegistrationId, submissionError
}

