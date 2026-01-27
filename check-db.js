require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 13306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'zoomnote',
        });

        console.log('\n📊 [DB 확인] 최신 연구노트 20개 조회 중...\n');
        const [rows] = await pool.query(`
      SELECT 
        r.id, 
        CONCAT(r.report_year, '-', r.report_week, '주') as week, 
        LEFT(r.title, 20) as title_summary, 
        u.name AS writer, 
        DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i') as created 
      FROM research_notes r
      LEFT JOIN users u ON r.writer_zoom_user_id = u.zoom_user_id
      ORDER BY r.id DESC
      LIMIT 20
    `);

        if (rows.length === 0) {
            console.log('❌ 저장된 연구노트가 없습니다.');
        } else {
            console.table(rows);
            console.log(`\n✅ 총 ${rows.length}개의 최신 문서를 찾았습니다.`);
        }
        await pool.end();
    } catch (e) {
        console.error('❌ DB 접속 에러:', e.message);
        if (e.code === 'ECONNREFUSED') {
            console.error('👉 DB가 꺼져있거나 포트 설정이 잘못되었습니다. .env를 확인해주세요.');
        }
    }
})();
