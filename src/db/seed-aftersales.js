const { getDb } = require('./database');

function seed() {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM aftersales WHERE id = ?').get('aft_demo_1');
  if (existing) return;

  const orders = db.prepare('SELECT id, userId, status FROM orders ORDER BY id LIMIT 6').all();
  if (orders.length < 3) return;

  const findOrder = (uid, statuses) => {
    for (const o of orders) {
      if (o.userId === uid && statuses.includes(o.status)) return o;
    }
    throw new Error(`未找到 userId=${uid} 且 status 在 [${statuses}] 的订单，请检查 seed 数据`);
  };

  const o1 = findOrder('u_zhangsan', ['paid','shipped','delivered','completed','pending']);
  const o2 = findOrder('u_lisi', ['shipped','paid','pending']);
  const o3 = findOrder('u_wangwu', ['completed','delivered','paid']);

  const data = [
    { id: 'aft_demo_1', orderId: o1.id, userId: 'u_zhangsan', orderStatus: o1.status, items: '[{"productId":"tea_1","productName":"柠檬茶","quantity":2}]', reason: '口味不符', description: '喝起来太酸了，希望退掉', status: 'approved', handleReason: '同意退货退款', handledAt: '2026-08-19 14:00:00' },
    { id: 'aft_demo_2', orderId: o2.id, userId: 'u_lisi', orderStatus: o2.status, items: '[{"productId":"herbs_1","productName":"人参片","quantity":1}]', reason: '物流破损', description: '包装有破损，人参片碎了', status: 'pending', handleReason: '', handledAt: '' },
    { id: 'aft_demo_3', orderId: o3.id, userId: 'u_wangwu', orderStatus: o3.status, items: '[{"productId":"health_1","productName":"灵芝胶囊","quantity":1}]', reason: '质量问题', description: '开封后有异味', status: 'rejected', handleReason: '已超过售后期限', handledAt: '2026-08-22 10:00:00' },
  ];

  const ins = db.prepare(
    'INSERT INTO aftersales (id, orderId, userId, orderStatus, items, reason, description, status, handleReason, handledAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of data) {
    ins.run(a.id, a.orderId, a.userId, a.orderStatus, a.items, a.reason, a.description, a.status, a.handleReason || '', a.handledAt || '');
  }
  console.log(`[Seed] 导入 ${data.length} 条售后记录`);
}

module.exports = { seed };
