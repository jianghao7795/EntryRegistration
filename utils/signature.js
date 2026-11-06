const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024

function validateSignature(base64) {
  if (typeof base64 !== 'string' || !base64 || base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('签名导出失败，请重新签名后再提交')
  }
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0)
  if (base64.length / 4 * 3 - padding > MAX_SIGNATURE_BYTES) {
    throw new Error('签名图片过大，请清除后重新签名')
  }
  return base64
}

async function exportSignature(canvas, page) {
  if (!canvas) throw new Error('签名区尚未准备好，请稍后重试')
  const path = await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'png',
      destWidth: canvas.width,
      destHeight: canvas.height,
      success: result => resolve(result.tempFilePath),
      fail: () => reject(new Error('签名导出失败，请重试'))
    }, page)
  })
  const fs = wx.getFileSystemManager()
  try {
    const base64 = await new Promise((resolve, reject) => {
      fs.readFile({
        filePath: path,
        encoding: 'base64',
        success: result => resolve(result.data),
        fail: () => reject(new Error('签名读取失败，请重试'))
      })
    })
    return validateSignature(base64)
  } finally {
    // 仅删除本次导出的临时文件，表单及签名不写入本地存储。
    fs.unlink({ filePath: path, fail() {} })
  }
}

module.exports = { exportSignature, validateSignature }

