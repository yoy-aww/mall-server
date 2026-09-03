const { getDb } = require('./database');

function seed() {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM addresses WHERE id = ?').get('addr_demo_1');
  if (existing) return;

  const data = [
    { id: 'addr_demo_1', userId: 'u_zhangsan', label: '家里', receiverName: '张三', receiverPhone: '13800001234', province: '北京市', city: '海淀区', address: '中关村大街1号', isDefault: 1 },
    { id: 'addr_demo_2', userId: 'u_zhangsan', label: '公司', receiverName: '张三', receiverPhone: '13800001234', province: '北京市', city: '朝阳区', address: '国贸CBD 5号楼', isDefault: 0 },
    { id: 'addr_demo_3', userId: 'u_lisi', label: '家里', receiverName: '李四', receiverPhone: '13900005678', province: '上海市', city: '浦东新区', address: '张江高科技园区', isDefault: 1 },
    { id: 'addr_demo_4', userId: 'u_wangwu', label: '公司', receiverName: '王五', receiverPhone: '15000009012', province: '深圳市', city: '南山区', address: '科技园南区A栋', isDefault: 1 },
  ];

  const ins = db.prepare(
    'INSERT INTO addresses (id, userId, label, receiverName, receiverPhone, province, city, address, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of data) {
    ins.run(a.id, a.userId, a.label, a.receiverName, a.receiverPhone, a.province, a.city, a.address, a.isDefault);
  }
  console.log(`[Seed] 导入 ${data.length} 条收货地址`);
}

module.exports = { seed };
