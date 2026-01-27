const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        console.log('[Reset] Connecting to DB with config:');
        console.log(`- Host: ${process.env.DB_HOST}`);
        console.log(`- Port: ${process.env.DB_PORT}`);
        console.log(`- User: ${process.env.DB_USER}`);

        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            connectTimeout: 5000
        });

        const key = 'SERIAL_OFFSET_2026';

        // 1. Current Status
        const [rows] = await pool.query('SELECT * FROM system_config WHERE config_key = ?', [key]);
        console.log('Current Config:', rows[0] || 'Not Found');

        // 2. Update to 0 (Start Number 1)
        console.log(`[Reset] Updating ${key} to 0 (Start Number 1)...`);
        await pool.query(
            "INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
            [key, '0']
        );

        // 3. Verify
        const [updated] = await pool.query('SELECT * FROM system_config WHERE config_key = ?', [key]);
        console.log('Updated Config:', updated[0]);

        await pool.end();
        console.log('[Reset] Done.');
    } catch (e) {
        console.error('[Reset] FAILED:', e);
    }
})();
