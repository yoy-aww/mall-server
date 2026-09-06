const BASE = 'http://localhost:3998';
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: r.status, ...await r.json().catch(() => ({})) };
}

(async () => {
  const login = await j('/api/auth/login', { method: 'POST', body: { username: 'zhangwei', password: 'Demo@123' } });
  console.log('login:', login);
  const tk = login.data?.token;
  const c = await j('/api/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}` },
    body: { items: [{ productId: 'activity_1', quantity: 1 }], shippingMethod: 'standard', shippingAddress: 'a', receiverName: 'z', receiverPhone: '138' },
  });
  console.log('order:', c);
})();
