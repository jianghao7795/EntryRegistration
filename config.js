// 开发版、体验版连接测试环境；正式版连接正式环境。
const API_BASES = {
  develop: 'https://api.haptest.com',
  trial: 'https://api.haptest.com',
  release: 'https://api.hapyun.com'
}

function getApiBase() {
  const account = wx.getAccountInfoSync()
  const version = account.miniProgram.envVersion
  if (!API_BASES[version]) throw new Error('无法识别小程序运行环境')
  return API_BASES[version]
}

module.exports = { getApiBase, REQUEST_TIMEOUT: 15000 }

