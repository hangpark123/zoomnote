require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    console.log('🔍 DB 연결 테스트 시작...');
    console.log(`- 호스트: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`- 사용자: ${process.env.DB_USER || 'root'}`);
    console.log(`- 데이터베이스: ${process.env.DB_NAME || 'zoomnote'}`);

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'zoomnote',
        });
        console.log('✅ DB 연결 성공!');
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ DB 연결 실패:', err.message);
        console.error('   에러 코드:', err.code);
        process.exit(1);
    }
})();
