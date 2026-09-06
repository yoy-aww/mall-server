// #6 删除用户 E2E
const BASE = 'http://localhost:3998';

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: r.status, ...await r.json().catch(() => ({})) };
}

function auth(t) { return { Authorization: `Bearer ${t}` }; }

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
  check('管理员登录', !!adminToken);

  // 找一个可删用户：wangqiang（u_wangwu）—— 演示用户里没做过订单的
  const target = 'u_wangwu';

  // === 边界：不能删管理员 ===
  const delAdmin = await j(`/api/auth/users/admin_001`, { method: 'DELETE', headers: auth(adminToken) });
  check('不能删管理员', delAdmin.status === 400, JSON.stringify(delAdmin));

  // === 边界：不能删自己 ===
  const delSelf = await j(`/api/auth/users/admin_001`, { method: 'DELETE', headers: auth(adminToken) });
  check('不能删自己（同上）', delSelf.status === 400);

  // === 边界：不存在 ===
  const delNotExist = await j('/api/auth/users/nonexistent_xyz', { method: 'DELETE', headers: auth(adminToken) });
  check('删除不存在用户 404', delNotExist.status === 404, JSON.stringify(delNotExist));

  // === 软删除（默认） ===
  // 先看下目标用户当前状态
  const before = await j(`/api/auth/users/${target}`, { headers: auth(adminToken) });
  check('查询目标用户存在', before.success && before.data?.id === target, JSON.stringify(before));
  const beforeOrders = (await j('/api/orders?userId=' + target, { headers: auth(adminToken) })).data?.list || [];
  const beforeReviews = (await j('/api/reviews', { headers: auth(adminToken) })).data?.list?.filter(r => r.userId === target) || [];

  // 软删除
  const delSoft = await j(`/api/auth/users/${target}`, { method: 'DELETE', headers: auth(adminToken) });
  check('软删除返回 counts',
    delSoft.success && delSoft.data?.mode === 'soft' && delSoft.data?.counts,
    JSON.stringify(delSoft));

  // 软删除后用户查询仍能看到（管理员）
  const afterSoft = await j(`/api/auth/users/${target}`, { headers: auth(adminToken) });
  check('软删除后用户可见（管理员）',
    afterSoft.success && afterSoft.data?.disabled === 1 &&
    afterSoft.data?.nickname?.startsWith('[deleted:'),
    JSON.stringify(afterSoft.data));

  // 软删除后不能登录
  const softLogin = await j('/api/auth/login', { method: 'POST', body: { username: 'wangqiang', password: 'Demo@123' } });
  check('软删除后不能登录', !softLogin.success, JSON.stringify(softLogin));

  // 软删除后订单保留（admin 视角）
  const afterOrders = (await j('/api/orders?userId=' + target, { headers: auth(adminToken) })).data?.list || [];
  check('软删除后订单保留', afterOrders.length === beforeOrders.length,
    `before=${beforeOrders.length} after=${afterOrders.length}`);
  if (afterOrders[0]) {
    check('订单 remark 附加删除标记',
      (afterOrders[0].remark || '').includes('owner_deleted:'),
      afterOrders[0].remark);
  }

  // 软删除后评价保留但抹除用户名
  const afterReviews = (await j('/api/reviews', { headers: auth(adminToken) })).data?.list?.filter(r => r.userId === target) || [];
  check('软删除后评价保留但 username 抹除',
    afterReviews.length === beforeReviews.length &&
    afterReviews.every(r => r.username === '[deleted]' && r.nickname === '[deleted]'),
    JSON.stringify(afterReviews.map(r => ({ u: r.username, n: r.nickname }))));

  // 软删除后再删一次应失败
  const delTwice = await j(`/api/auth/users/${target}`, { method: 'DELETE', headers: auth(adminToken) });
  check('重复删除返回 400', delTwice.status === 400, JSON.stringify(delTwice));

  // 撤销：启用（重置 disabled=0，但敏感字段仍抹除，密码已被重置为 invalid）
  const reenable = await j(`/api/auth/users/${target}/status`, {
    method: 'PUT', headers: auth(adminToken), body: { disabled: false },
  });
  check('启用成功', reenable.success && reenable.data?.disabled === 0, JSON.stringify(reenable));
  // 但密码是 invalid，不能登录
  const reLogin = await j('/api/auth/login', { method: 'POST', body: { username: 'wangqiang', password: 'Demo@123' } });
  check('启用后仍需重置密码才能登录', !reLogin.success, JSON.stringify(reLogin));

  // === 硬删除 ===
  const delHard = await j(`/api/auth/users/${target}?mode=hard`, { method: 'DELETE', headers: auth(adminToken) });
  check('硬删除返回 mode=hard',
    delHard.success && delHard.data?.mode === 'hard',
    JSON.stringify(delHard));

  // 硬删除后用户不存在
  const afterHard = await j(`/api/auth/users/${target}`, { headers: auth(adminToken) });
  check('硬删除后用户不存在', afterHard.status === 404, JSON.stringify(afterHard));

  // 硬删除后订单被删除
  const afterHardOrders = (await j('/api/orders?userId=' + target, { headers: auth(adminToken) })).data?.list || [];
  check('硬删除后订单清空', afterHardOrders.length === 0,
    JSON.stringify(afterHardOrders.length));

  console.log(`\n====== ${pass} passed, ${fail} failed ======`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
