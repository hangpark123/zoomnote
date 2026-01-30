-- 사용자별 연구노트 고정값 저장 기능을 위한 DB 스키마 변경
-- users 테이블에 template 컬럼 3개 추가
-- ⚠️ MySQL 8.0에서는 ALTER TABLE ADD COLUMN에 IF NOT EXISTS를 지원하지 않음

-- 먼저 현재 컬럼 확인
SHOW COLUMNS FROM users;

-- template 컬럼이 없는 것을 확인한 후 실행
ALTER TABLE users
ADD COLUMN template_title VARCHAR(500),
ADD COLUMN template_start_date DATE,
ADD COLUMN template_end_date DATE;

-- 확인
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE
    TABLE_NAME = 'users'
    AND COLUMN_NAME LIKE 'template%';