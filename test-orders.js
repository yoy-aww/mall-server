// 订单链路 E2E 测试
const BASE = 'http://localhost:3998';

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data };
}

function auth(token) { return { Authorization: `Bearer ${token}` }; }

async function login(name, pass) {
  const r = await j('/api/auth/login', { method: 'POST', body: { username: name, password: pass } });
  return r.success ? r.data.token : null;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    if (ok) { pass++; console.log(`✅ ${name}`); }
    else { fail++; console.log(`❌ ${name} ${extra}`); }
  };

  // 登录
  const adminToken = await login('admin', 'Admin@123');
  const uToken = await login('zhangwei', 'Demo@123');
  check('登录 admin/user', !!adminToken && !!uToken);

  // 1. 创建订单
  const create = await j('/api/orders', {
    method: 'POST', headers: auth(uToken),
    body: {
      items: [{ productId: 'activity_1', quantity: 1 }],
      shippingMethod: 'standard',
      shippingAddress: '测试地址', receiverName: '张三', receiverPhone: '13800000000',
    },
  });
  check('创建订单', create.success && create.data?.id && typeof create.data?.total === 'number', JSON.stringify(create));
  const orderId = create.data?.id;
  // 校验 status 为 pending（从详情接口取，创建接口不返 status）
  const createdDetail = await j(`/api/orders/${orderId}`, { headers: auth(uToken) });
  check('新订单初始 status=pending', createdDetail.data?.status === 'pending', JSON.stringify(createdDetail.data));

  // 2. 支付
  const pay = await j(`/api/orders/${orderId}/payment`, {
    method: 'POST', headers: auth(uToken),
  });
  check('支付 pending→paid', pay.success && pay.data?.status === 'paid', JSON.stringify(pay));

  // 3. 再次支付应该失败（状态机校验）
  const pay2 = await j(`/api/orders/${orderId}/payment`, {
    method: 'POST', headers: auth(uToken),
  });
  check('状态机: 已支付不能再支付', !pay2.success && /paid|已是/.test(pay2.error || ''), JSON.stringify(pay2));

  // 4. 用户不能发货（admin only）
  const shipByUser = await j(`/api/orders/${orderId}/ship`, {
    method: 'POST', headers: auth(uToken),
  });
  check('用户不能发货（403）', !shipByUser.success && shipByUser.status === 403);

  // 5. 管理员发货
  const ship = await j(`/api/orders/${orderId}/ship`, {
    method: 'POST', headers: auth(adminToken),
    body: { tracking: 'SF1234567890' },
  });
  check('管理员发货 paid→shipped + tracking',
    ship.success && ship.data?.status === 'shipped' && ship.data?.shipTracking === 'SF1234567890',
    JSON.stringify(ship));

  // 6. 发货后不能取消
  const cancelAfterShip = await j(`/api/orders/${orderId}/cancel`, {
    method: 'POST', headers: auth(uToken), body: { reason: 'test' },
  });
  check('发货后不能取消', !cancelAfterShip.success && /不能/.test(cancelAfterShip.error || ''),
    JSON.stringify(cancelAfterShip));

  // 7. 用户签收
  const deliver = await j(`/api/orders/${orderId}/deliver`, {
    method: 'POST', headers: auth(uToken),
  });
  check('签收 shipped→delivered', deliver.success && deliver.data?.status === 'delivered',
    JSON.stringify(deliver));

  // 8. 用户确认完成
  const confirm = await j(`/api/orders/${orderId}/confirm`, {
    method: 'POST', headers: auth(uToken),
  });
  check('确认完成 delivered→completed', confirm.success && confirm.data?.status === 'completed',
    JSON.stringify(confirm));

  // 9. 查询订单状态
  const detail = await j(`/api/orders/${orderId}`, { headers: auth(uToken) });
  check('订单详情 status=completed + timestamps',
    detail.data?.status === 'completed' && !!detail.data?.paidAt && !!detail.data?.shippedAt && !!detail.data?.completedAt,
    JSON.stringify(detail.data));

  // 10. 测试取消流程（新订单）
  const create2 = await j('/api/orders', {
    method: 'POST', headers: auth(uToken),
    body: {
      items: [{ productId: 'activity_2', quantity: 1 }],
      shippingMethod: 'standard',
      shippingAddress: '测试', receiverName: '张三', receiverPhone: '13800000000',
    },
  });
  const oid2 = create2.data?.id;
  const stockBefore = await j(`/api/products/${'activity_2'}`, { headers: auth(uToken) });
  const cancel = await j(`/api/orders/${oid2}/cancel`, {
    method: 'POST', headers: auth(uToken), body: { reason: '不想买了' },
  });
  check('取消订单 + 库存回滚',
    cancel.success && cancel.data?.status === 'cancelled' && cancel.data?.stockRestored === true,
    JSON.stringify(cancel));
  const stockAfter = await j(`/api/products/${'activity_2'}`, { headers: auth(uToken) });
  check('库存已回滚', stockAfter.data?.stock === stockBefore.data?.stock + 1,
    `before=${stockBefore.data?.stock} after=${stockAfter.data?.stock}`);

  // 11. 自动完成（7天内 shipped 不会触发，用管理员强刷 auto-complete 接口应无副作用）
  const auto = await j('/api/orders/auto-complete', {
    method: 'POST', headers: auth(adminToken), body: { days: 9999 },
  });
  check('自动完成接口可用', auto.success && typeof auto.data?.completed === 'number',
    JSON.stringify(auto));

  // 12. 管理员订单统计
  const stats = await j('/api/orders/admin/stats', { headers: auth(adminToken) });
  check('管理员订单统计',
    stats.success && Array.isArray(stats.data?.countByStatus) && typeof stats.data?.revenueCompleted === 'number',
    JSON.stringify(stats));

  // 13. 状态机：不能从 completed 退回
  const rollback = await j(`/api/orders/${orderId}/status`, {
    method: 'PUT', headers: auth(adminToken), body: { status: 'paid' },
  });
  check('不能从 completed 退回', !rollback.success, JSON.stringify(rollback));

  // 14. 权限：非本人订单不能操作
  const create3 = await j('/api/orders', {
    method: 'POST', headers: auth(adminToken),
    body: {
      items: [{ productId: 'activity_1', quantity: 1 }],
      shippingMethod: 'standard',
      shippingAddress: 'admin 地址', receiverName: 'admin', receiverPhone: '13900000000',
    },
  });
  const oid3 = create3.data?.id;
  const foreignPay = await j(`/api/orders/${oid3}/payment`, {
    method: 'POST', headers: auth(uToken),
  });
  check('非本人订单不能操作（403）', !foreignPay.success && foreignPay.status === 403,
    JSON.stringify(foreignPay));

  console.log(`\n====== ${pass} passed, ${fail} failed ======`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
