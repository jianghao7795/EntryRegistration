const { getApiBase, REQUEST_TIMEOUT } = require('../config')
const visitorsPath = '/v1/haplabentry/public/visitors'

function request(path, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: getApiBase() + path,
      method,
      data,
      timeout: REQUEST_TIMEOUT,
      header: { Accept: 'application/json', 'Content-Type': 'application/json' },
      success(response) {
        if (response.statusCode === 200) {
          resolve(response.data)
        } else {
          const error = new Error('HTTP ' + response.statusCode)
          error.response = response
          reject(error)
        }
      },
      fail() {
        // POST 超时也可能已落库；调用方提示核实结果，不自动重试。
        const error = new Error('Network request failed')
        error.network = true
        reject(error)
      }
    })
  })
}

module.exports = {
  getVisitorOptions: () => request(visitorsPath + '/options', 'GET'),
  createVisitorRegistration: data => request(visitorsPath, 'POST', { data })
}

