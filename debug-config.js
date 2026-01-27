const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        console.log('[Debug] Connecting to DB...', process.env.DB_HOST);
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            connectTimeout: 5000
        });

        // Insert the config value user wanted (Start #22 -> Offset 21)
        console.log('[Fix] Inserting SERIAL_OFFSET_2026 = 21...');
        await pool.query(
            "INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
            ['SERIAL_OFFSET_2026', '21']
        );

        const [rows] = await pool.query('SELECT * FROM system_config');
        console.log('--- SYSTEM CONFIG DUMP ---');
        console.table(rows);

        // Also check if SERIAL_OFFSET_2026 exists specifically
        const [specific] = await pool.query("SELECT * FROM system_config WHERE config_key = 'SERIAL_OFFSET_2026'");
        console.log('--- SPECIFIC KEY CHECK (SERIAL_OFFSET_2026) ---');
        console.table(specific);

        await pool.end();
    } catch (e) {
        console.error('Fatal Error:', e);
    }
})();
