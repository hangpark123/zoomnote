const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        console.log('[Debug] Connecting to DB... 1.220.31.27');
        const pool = mysql.createPool({
            host: '1.220.31.27',
            port: 13306,
            user: 'root',
            password: 'IRlink01!',
            database: 'zoomnote',
            connectTimeout: 5000
        });

        // 1. Check System Config
        const yr = 2026;
        const configKey = `SERIAL_OFFSET_${yr}`;
        const [configRows] = await pool.query('SELECT config_value FROM system_config WHERE config_key = ?', [configKey]);
        console.log(`\n--- [1] System Config for ${yr} ---`);
        if (configRows.length > 0) {
            console.log(`Key: ${configKey}`);
            console.log(`Value (Offset): ${configRows[0].config_value}`);
            console.log(`Expected Start No: ${Number(configRows[0].config_value) + 1}`);
        } else {
            console.log('Config Not Found (Default Start: 1)');
        }

        // 2. Check Actual Max Serial
        const [noteRows] = await pool.query(
            'SELECT id, serial_no, writer_zoom_user_id FROM research_notes WHERE report_year = ? ORDER BY id DESC LIMIT 5',
            [yr]
        );
        console.log(`\n--- [2] Recent Notes for ${yr} ---`);
        if (noteRows.length > 0) {
            console.table(noteRows);
            const lastSerial = noteRows[0].serial_no;
            const parts = lastSerial.split('-');
            const lastNum = parseInt(parts[parts.length - 1], 10);
            console.log(`Last Serial Number: ${lastNum}`);
            console.log(`Next Auto-Serial (Last + 1): ${lastNum + 1}`);
        } else {
            console.log('No notes found for 2026.');
        }

        await pool.end();
    } catch (e) {
        console.error('Fatal Error:', e);
    }
})();
