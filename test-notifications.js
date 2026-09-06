// #5 通知系统 E2E
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

function auth(t) { return { Authorization: `Bearer ***}` }; }

async function login(n, p) {
  const r = await j('/api/auth/login', { method: 'POST', body: { username: n, password: p } });
  return r.success ? r.data.token : null;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (n, ok, x = '') => {
    if (ok) { pass++; console.log(`✅ ${n}`); }
    else { fail++; console.log(`❌ ${n} ${x}`); }
  };

  const adminToken = await login('admin', 'Admin@123');
  const uToken = await login('zhangwei', 'Demo@123');
  const lToken = await login('lina', 'Demo@123');
  check('登录', !!adminToken && !!uToken && !!lToken);

  // 用户 A 触发订单流程，产生通知
  const c = await j('/api/orders', { method: 'POST', headers: auth(uToken), body: {
    items: [{ productId: 'activity_1', quantity: 1 }],
    shippingMethod: 'standard', shippingAddress: 'a', receiverName: 'z', receiverPhone: '138',
  }});
  console.log('[debug] create order:', JSON.stringify(c));
  if (!c.success) throw new Error('order create failed: ' + JSON.stringify(c));
  const oid = c.data.id;
  console.log('[debug] oid:', oid);
  await j(`/api/orders/${oid}/payment`, { method: 'POST', headers: auth(uToken) });
  await j(`/api/orders/${oid}/ship`, { method: 'POST', headers: auth(adminToken), body: { tracking: 'T123' } });

  // 1. 分页元数据
  const list1 = await j('/api/notifications?limit=5&page=1', { headers: auth(uToken) });
  check('分页元数据完整',
    list1.success && list1.data?.pagination?.totalPages && list1.data?.pagination?.page === 1,
    JSON.stringify(list1.data?.pagination));

  // 2. limit 上限 clamp
  const list2 = await j('/api/notifications?limit=999', { headers: auth(uToken) });
  check('limit 上限 clamp 到 100', list2.data?.pagination?.limit === 100,
    JSON.stringify(list2.data?.pagination));

  // 3. offset 风格
  const list3 = await j('/api/notifications?limit=2&offset=0', { headers: auth(uToken) });
  check('offset 风格可用', list3.data?.list?.length <= 2, JSON.stringify(list3.data?.pagination));

  // 4. 非整数 clamp
  const list4 = await j('/api/notifications?limit=abc', { headers: auth(uToken) });
  check('非整数 limit clamp 到默认 20', list4.data?.pagination?.limit === 20,
    JSON.stringify(list4.data?.pagination));

  // 5. 未读数量
  const unread = list1.data.unreadCount;
  check('未读计数', typeof unread === 'number', String(unread));

  // 6. 标记单条已读
  const nid = list1.data.list[0]?.id;
  const readR = await j(`/api/notifications/${nid}/read`, { method: 'POST', headers: auth(uToken) });
  check('标记单条已读', readR.success, JSON.stringify(readR));

  // 7. 撤销
  const unreadR = await j(`/api/notifications/${nid}/unread`, { method: 'POST', headers: auth(uToken) });
  check('撤销已读', unreadR.success, JSON.stringify(unreadR));

  // 8. 全部已读
  const ra = await j('/api/notifications/read-all', { method: 'POST', headers: auth(uToken) });
  const listAfter = await j('/api/notifications', { headers: auth(uToken) });
  check('read-all 后 unreadCount=0', ra.success && listAfter.data.unreadCount === 0,
    JSON.stringify({ ra, unread: listAfter.data.unreadCount }));

  // 9. 触发新通知后再验证 unread
  await j(`/api/orders/${oid}/deliver`, { method: 'POST', headers: auth(uToken) });
  await j(`/api/orders/${oid}/confirm`, { method: 'POST', headers: auth(uToken) });
  const listAfter2 = await j('/api/notifications', { headers: auth(uToken) });
  check('新通知增加 unreadCount', listAfter2.data.unreadCount >= 1,
    JSON.stringify({ unread: listAfter2.data.unreadCount }));

  // 10. 详情接口自动标为已读
  const nid2 = listAfter2.data.list[0]?.id;
  const detail = await j(`/api/notifications/${nid2}`, { headers: auth(uToken) });
  check('详情接口自动标为已读', detail.data?.isRead === 1, JSON.stringify(detail));

  // 11. 类型过滤
  const byType = await j('/api/notifications?type=order', { headers: auth(uToken) });
  const allOrder = byType.data.list.every(n => n.type === 'order');
  check('type 过滤', byType.success && allOrder, JSON.stringify(byType.data.list.map(n => n.type)));

  // 12. 未读过滤
  const unreadOnly = await j('/api/notifications?unread=1', { headers: auth(uToken) });
  check('unread=1 过滤', unreadOnly.data.list.every(n => n.isRead === 0),
    JSON.stringify(unreadOnly.data.list.map(n => n.isRead)));

  // 13. 关键词搜索
  const search = await j('/api/notifications?q=订单', { headers: auth(uToken) });
  check('关键词搜索可用', search.success, JSON.stringify(search.data.list.length));

  // 14. 管理员全局查询
  const global = await j('/api/notifications/global', { headers: auth(adminToken) });
  check('管理员全局查询', global.success && global.data?.list?.length >= 0, JSON.stringify(global.data?.pagination));

  // 15. 非管理员禁止 global
  const globalByUser = await j('/api/notifications/global', { headers: auth(uToken) });
  check('非管理员禁止 global（403）', globalByUser.status === 403, JSON.stringify(globalByUser));

  // 16. 管理员广播给指定用户
  const bc = await j('/api/notifications/broadcast', {
    method: 'POST', headers: auth(adminToken),
    body: { userId: 'u_zhangsan', title: '系统公告', content: '欢迎测试', type: 'system' },
  });
  check('广播成功', bc.success && bc.data?.sent === 1, JSON.stringify(bc));

  // 17. 广播后用户可见
  const afterBc = await j('/api/notifications?q=系统公告', { headers: auth(uToken) });
  check('广播通知用户可见', afterBc.data.list.some(n => n.title === '系统公告'),
    JSON.stringify(afterBc.data.list.map(n => n.title)));

  // 18. 广播给所有人
  const bcAll = await j('/api/notifications/broadcast', {
    method: 'POST', headers: auth(adminToken),
    body: { title: '全员通知', content: '全站公告', type: 'promotion' },
  });
  check('广播给所有人', bcAll.success && bcAll.data?.sent >= 6,
    JSON.stringify(bcAll.data));

  // 19. 删除单条
  const toDel = (await j('/api/notifications', { headers: auth(uToken) })).data.list[0]?.id;
  const del = await j(`/api/notifications/${toDel}`, { method: 'DELETE', headers: auth(uToken) });
  check('删除单条', del.success, JSON.stringify(del));

  // 20. 删除别人的通知
  const foreign = await j(`/api/notifications/${toDel}`, { method: 'DELETE', headers: auth(lToken) });
  check('不能删别人通知（404）', foreign.status === 404, JSON.stringify(foreign));

  // 21. 读别人的通知
  const zList = (await j('/api/notifications', { headers: auth(uToken) })).data.list;
  const ownId = zList[0]?.id;
  const foreignRead = await j(`/api/notifications/${ownId}`, { headers: auth(lToken) });
  check('不能读别人通知（404）', foreignRead.status === 404, JSON.stringify(foreignRead));

  // 22. 非管理员不能看 admin stats（顺带验证 admin 权限）
  const adminCheck = await j('/api/orders/admin/stats', { headers: auth(uToken) });
  check('非管理员不能看 admin stats（403）', adminCheck.status === 403, JSON.stringify(adminCheck));

  console.log(`\n====== ${pass} passed, ${fail} failed ======`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
