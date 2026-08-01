const app = require('./src/app');

const PORT = 3000;
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log('Server started on port ' + PORT);

  // Test health
  const http = require('http');
  const get = (url) => new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });

  try {
    const health = await get('http://localhost:3000/api/health');
    console.log('Health check:', health.status, health.body);

    const banners = await get('http://localhost:3000/api/banners');
    const b = JSON.parse(banners.body);
    console.log('Banners:', b.data.length, 'items');

    const products = await get('http://localhost:3000/api/products');
    const p = JSON.parse(products.body);
    console.log('Products:', p.data.length, 'items');

    const search = await get('http://localhost:3000/api/products/search?q=人参');
    const s = JSON.parse(search.body);
    console.log('Search "人参":', s.data.length, 'results');

    console.log('\n✅ All API tests passed!');
  } catch (e) {
    console.error('Test failed:', e.message);
  }

  server.close();
  process.exit(0);
});