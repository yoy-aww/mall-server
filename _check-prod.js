const { getDb } = require('./src/db/database');
const db = getDb();
const r = db.prepare("SELECT id, name, stock FROM products WHERE id IN ('activity_1','activity_2')").all();
console.log(r);
const all = db.prepare('SELECT id, name FROM products LIMIT 10').all();
console.log('all:', all);
