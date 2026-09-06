const { getDb } = require('./src/db/database');
const db = getDb();
const rows = db.prepare("SELECT id, username, salt, password FROM users").all();
for (const u of rows) {
  const h = String(u.password || '');
  console.log(`${u.username.padEnd(10)} bcrypt=${h.startsWith('$2')} salt_len=${String(u.salt||'').length} id=${u.id}`);
}
