// 七牛外链正常可用（小程序端已验证），safeImage 直接透传，不改写。
function safeImage(u) {
  return u || ''
}

module.exports = { safeImage };
