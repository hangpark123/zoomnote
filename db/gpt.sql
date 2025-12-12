USE zoom_notes;

DROP TABLE IF EXISTS research_notes;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    zoom_user_id VARCHAR(50) PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    role        VARCHAR(50) NOT NULL DEFAULT 'staff',
    department  VARCHAR(50) NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE research_notes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    zoom_user_id VARCHAR(50) NOT NULL,
    title       VARCHAR(100) NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (zoom_user_id) REFERENCES users(zoom_user_id)
);
