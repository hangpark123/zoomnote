const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const conn = await mysql.createConnection({
    host,
    user,
    password,
    multipleStatements: true,
  });

  try {
    await conn.query(schemaSql);
    // eslint-disable-next-line no-console
    console.log('DB schema applied:', schemaPath);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('DB init failed:', err?.message || err);
  process.exit(1);
});

