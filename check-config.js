const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            timezone: '+09:00'
        });

        console.log('--- System Config Table Structure ---');
        try {
            const [desc] = await pool.query('DESCRIBE system_config');
            console.table(desc);
        } catch (e) { console.log('Error desc:', e.message); }

        console.log('--- System Config Data ---');
        const [rows] = await pool.query('SELECT * FROM system_config');
        console.table(rows);

        await pool.end();
    } catch (e) {
        console.error(e);
    }
}
check();
