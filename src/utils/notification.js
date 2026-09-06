/**
 * SSE 连接池 + 通知发送（跨路由共享）
 * orders.js / aftersales.js 等直接调 sendNotification，
 * notifications.js 的 /stream 用 register/unregister 维护连接。
 */

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const clients = new Map(); // userId -> Set<res>

function register(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function unregister(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

function hasClient(userId) {
  return clients.has(userId) && clients.get(userId).size > 0;
}

/**
 * 广播给所有连接（管理员推送等）
 */
function broadcast(event, data) {
  if (!clients.size) return 0;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let count = 0;
  for (const [, set] of clients) {
    for (const res of set) {
      try { res.write(msg); count++; } catch { /* ignore */ }
    }
  }
  return count;
}

/**
 * 发送一条通知给指定用户
 * 直接调用 SSE 推送（不写库）；写库由业务层负责（保持数据一致性）
 */
function pushNotification(userId, notification) {
  if (!clients.has(userId)) return 0;
  const set = clients.get(userId);
  const msg = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  let count = 0;
  for (const res of set) {
    try { res.write(msg); count++; } catch { /* ignore */ }
  }
  return count;
}

module.exports = {
  clients,
  register,
  unregister,
  hasClient,
  broadcast,
  pushNotification,
};
