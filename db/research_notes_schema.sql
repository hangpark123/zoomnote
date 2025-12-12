-- zoomnote schema v2

SET NAMES utf8mb4;

DROP TABLE IF EXISTS research_notes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;

CREATE TABLE departments (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  parent_id  BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE users (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  zoom_user_id   VARCHAR(64) NOT NULL,
  zoom_account_id VARCHAR(64) NOT NULL,
  email          VARCHAR(191) NOT NULL,
  name           VARCHAR(191) NOT NULL,
  job_title      VARCHAR(191) DEFAULT NULL,
  department_id  BIGINT UNSIGNED DEFAULT NULL,
  role           ENUM('staff','leader','executive') NOT NULL DEFAULT 'staff',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_zoom_user_id (zoom_user_id),
  UNIQUE KEY uq_email (email),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE research_notes (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  writer_zoom_user_id VARCHAR(64) NOT NULL,
  record_date        DATE NOT NULL,
  report_year        INT NOT NULL,
  report_week        INT NOT NULL,
  serial_no          VARCHAR(50) NOT NULL,
  title              VARCHAR(200) NOT NULL,
  period_start       DATE NULL,
  period_end         DATE NULL,
  weekly_goal        VARCHAR(500) NULL,
  content            LONGTEXT NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_writer FOREIGN KEY (writer_zoom_user_id) REFERENCES users(zoom_user_id),
  INDEX idx_notes_writer (writer_zoom_user_id),
  INDEX idx_notes_week (report_year, report_week)
);
