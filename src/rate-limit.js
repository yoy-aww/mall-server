/**
 * 简易内存限流器（单进程 / 单 PM2 instance 场景足够）
 * 特点：
 *   - 无需第三方依赖
 *   - 按 key 计数，超过阈值锁 windowMs
 *   - 定期清理过期 key，防止内存泄漏
 */
class MemoryRateLimiter {
  /**
   * @param {object} opts
   *   @param {number} opts.max      允许的最大请求数
   *   @param {number} opts.windowMs 窗口时长（毫秒）
   *   @param {number} [opts.name]   标识（仅日志用）
   */
  constructor({ max, windowMs, name = 'limiter' }) {
    this.max = max;
    this.windowMs = windowMs;
    this.name = name;
    this.hits = new Map(); // key -> { count, firstAt }
    // 每 windowMs 清理一次过期项
    this._timer = setInterval(() => this._sweep(), windowMs);
    if (this._timer.unref) this._timer.unref();
  }

  _sweep() {
    const now = Date.now();
    for (const [k, v] of this.hits) {
      if (now - v.firstAt > this.windowMs) this.hits.delete(k);
    }
  }

  /**
   * 记录一次命中。超过上限返回 false。
   * @param {string} key
   * @returns {boolean} 是否允许（true 通过，false 拒绝）
   */
  hit(key) {
    const now = Date.now();
    const cur = this.hits.get(key);
    if (!cur || now - cur.firstAt > this.windowMs) {
      this.hits.set(key, { count: 1, firstAt: now });
      return true;
    }
    cur.count += 1;
    return cur.count <= this.max;
  }

  /**
   * 剩余次数 & 重置时间，供响应头
   */
  status(key) {
    const cur = this.hits.get(key);
    const now = Date.now();
    if (!cur || now - cur.firstAt > this.windowMs) {
      return { remaining: this.max, resetAt: 0 };
    }
    return {
      remaining: Math.max(0, this.max - cur.count),
      resetAt: cur.firstAt + this.windowMs,
    };
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}

/**
 * Express 中间件工厂：限流 + 返回 429 + Retry-After 头
 */
function rateLimit(limiter) {
  return (req, res, next) => {
    const allowed = limiter.hit(req.ip);
    const s = limiter.status(req.ip);
    if (s.resetAt) res.setHeader('X-RateLimit-Reset', Math.ceil(s.resetAt / 1000));
    res.setHeader('X-RateLimit-Remaining', String(s.remaining));
    if (!allowed) {
      const waitSec = Math.max(1, Math.ceil((s.resetAt - Date.now()) / 1000));
      res.setHeader('Retry-After', String(waitSec));
      return res.status(429).json({
        success: false,
        error: `请求过于频繁，请 ${waitSec} 秒后重试`,
      });
    }
    next();
  };
}

// 预置两个限流器，模块级单例
// 登录：每 IP 每 15 分钟最多 10 次
const loginLimiter = new MemoryRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, name: 'login' });
// 注册：每 IP 每 15 分钟最多 5 次
const registerLimiter = new MemoryRateLimiter({ max: 5, windowMs: 15 * 60 * 1000, name: 'register' });

module.exports = {
  MemoryRateLimiter,
  rateLimit,
  loginLimiter,
  registerLimiter,
};
