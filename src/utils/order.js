/**
 * 订单链路工具
 * 统一封装：状态机、库存回滚、时间戳、通知
 * 各路由（用户支付/取消/确认、管理员发货/改状态）都调这里，避免状态逻辑散落。
 */
const { getDb } = require('../db/database');

// 合法状态
const ORDER_FLOW = ['pending', 'paid', 'shipped', 'delivered', 'completed'];
const ALL_STATUS = [...ORDER_FLOW, 'cancelled'];

// 状态变更时允许的目标（from -> allowed to[]）
const TRANSITIONS = {
  pending:   ['paid', 'cancelled'],
  paid:      ['shipped', 'cancelled'],
  shipped:   ['delivered'],           // 发货后不能取消（已出库）
  delivered: ['completed'],
  completed: [],                      // 终态
  cancelled: [],                      // 终态
};

function canTransition(from, to) {
  if (from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 状态 → 通知文案
 */
function notificationForStatus(status, orderId) {
  const map = {
    paid:      { type: 'order', title: '支付成功',   content: `订单 ${orderId} 已付款，正在为您准备` },
    shipped:   { type: 'order', title: '已发货',     content: `订单 ${orderId} 已发货，请注意查收` },
    delivered: { type: 'order', title: '已签收',     content: `订单 ${orderId} 已签收` },
    completed: { type: 'order', title: '订单完成',   content: `订单 ${orderId} 已完成，感谢惠顾` },
    cancelled: { type: 'order', title: '订单已取消', content: `订单 ${orderId} 已取消` },
  };
  return map[status] || null;
}

/**
 * 核心动作：应用状态变更
 * 在事务内做：状态校验 → 时间戳 → 库存回滚 → 更新 orders → 通知入库
 *
 * @param {object} opts
 *   @param {string} orderId
 *   @param {string} toStatus
 *   @param {string} operatorId  操作者 id（记录用，不做鉴权）
 *   @param {boolean} operatorIsAdmin
 *   @param {string} reason  取消原因（可选）
 *   @param {string} tracking  运单号（可选，shipped 时可带）
 *   @param {function} pushNotification  可选的 SSE 推送函数
 * @returns {{ ok: boolean, error?: string, data?: object }}
 */
function applyStatusChange({
  orderId, toStatus, operatorId = '', operatorIsAdmin = false,
  reason = '', tracking = '', pushNotification,
}) {
  const db = getDb();

  if (!ALL_STATUS.includes(toStatus)) {
    return { ok: false, error: `无效状态: ${toStatus}` };
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, error: '订单不存在' };
  if (order.userId !== operatorId && !operatorIsAdmin) {
    return { ok: false, error: '无权限', status: 403 };
  }

  if (!canTransition(order.status, toStatus)) {
    return { ok: false, error: `不能从 ${order.status} 变更为 ${toStatus}` };
  }
  if (order.status === toStatus) {
    return { ok: false, error: `订单已是 ${toStatus} 状态` };
  }

  const now = nowStamp();

  // 计算时间戳更新
  let paidAt = order.paidAt;
  let shippedAt = order.shippedAt;
  let completedAt = order.completedAt || '';
  let cancelledAt = order.cancelledAt || '';
  let cancelledReason = order.cancelledReason || '';
  let shipTracking = order.shipTracking || '';

  if (toStatus === 'paid' && !paidAt) paidAt = now;
  if (toStatus === 'shipped' && !shippedAt) shippedAt = now;
  if (toStatus === 'delivered') {
    // 签收：给 shipped→delivered 也打个 delivered 时间（如果以后要用可加列）
  }
  if (toStatus === 'completed' && !completedAt) completedAt = now;
  if (toStatus === 'cancelled') {
    cancelledAt = now;
    if (reason) cancelledReason = reason;
  }
  if (tracking) shipTracking = tracking;

  // 库存回滚（cancelled / shipped→paid 特殊场景暂不涉及）
  let stockRestored = false;
  if (toStatus === 'cancelled') {
    const items = safeParse(order.items, []);
    for (const item of items) {
      if (item.productId && item.quantity) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
          .run(item.quantity, item.productId);
      }
    }
    stockRestored = true;
  }

  db.prepare(`
    UPDATE orders SET
      status = ?, paidAt = ?, shippedAt = ?, completedAt = ?,
      cancelledAt = ?, cancelledReason = ?, shipTracking = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    toStatus, paidAt, shippedAt, completedAt,
    cancelledAt, cancelledReason, shipTracking,
    now, orderId
  );

  // 通知：写库 + 可选的 SSE 推送
  let notificationId = null;
  const n = notificationForStatus(toStatus, orderId);
  if (n) {
    notificationId = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(
      'INSERT INTO notifications (id, userId, type, title, content, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).run(notificationId, order.userId, n.type, n.title, n.content, orderId, now);

    if (typeof pushNotification === 'function') {
      try {
        pushNotification(order.userId, {
          id: notificationId,
          type: n.type,
          title: n.title,
          content: n.content,
          relatedId: orderId,
          createdAt: now,
        });
      } catch (e) {
        console.warn('[order] SSE push failed:', e.message);
      }
    }
  }

  return {
    ok: true,
    data: {
      id: orderId,
      status: toStatus,
      paidAt, shippedAt, completedAt,
      cancelledAt, cancelledReason, shipTracking,
      stockRestored,
      notificationId,
    },
  };
}

function safeParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

/**
 * 自动完成订单：delivered 且 shippedAt 距今超过 N 天 → completed
 * 幂等，可在启动时/定时调用。
 */
function autoCompleteDelivered({ days = 7 } = {}) {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');
  const rows = db.prepare(
    "SELECT * FROM orders WHERE status = 'delivered' AND shippedAt < ?"
  ).all(cutoff);
  const results = [];
  for (const r of rows) {
    // 复用状态机
    const res = applyStatusChange({
      orderId: r.id, toStatus: 'completed',
      operatorId: r.userId, operatorIsAdmin: true,
    });
    if (res.ok) results.push(r.id);
  }
  if (results.length) {
    console.log(`[order] 自动完成 ${results.length} 个 delivered 订单`);
  }
  return results;
}

module.exports = {
  ORDER_FLOW, ALL_STATUS, TRANSITIONS,
  canTransition,
  applyStatusChange,
  autoCompleteDelivered,
  nowStamp,
  notificationForStatus,
};
