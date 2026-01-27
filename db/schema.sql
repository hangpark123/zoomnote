CREATE DATABASE IF NOT EXISTS zoomnote DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zoomnote;

SET NAMES utf8mb4;

DROP TABLE IF EXISTS research_note_files;
DROP TABLE IF EXISTS research_notes;
DROP TABLE IF EXISTS user_vacations;
DROP TABLE IF EXISTS zoom_oauth_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;

CREATE TABLE departments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  parent_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  zoom_user_id VARCHAR(64) NOT NULL,
  zoom_account_id VARCHAR(64) DEFAULT NULL,
  email VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  job_title VARCHAR(191) DEFAULT NULL,
  department_id BIGINT UNSIGNED DEFAULT NULL,
  signature_data MEDIUMTEXT DEFAULT NULL,
  signature_type ENUM('none','draw','text','image') NOT NULL DEFAULT 'none',
  signature_updated_at TIMESTAMP NULL DEFAULT NULL,
  role ENUM('staff','leader','executive','admin','master') NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_zoom_user_id (zoom_user_id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_department (department_id),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE research_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  writer_zoom_user_id VARCHAR(64) NOT NULL,
  checker_zoom_user_id VARCHAR(64) DEFAULT NULL,
  reviewer_zoom_user_id VARCHAR(64) DEFAULT NULL,
  checker_signature_data MEDIUMTEXT DEFAULT NULL,
  checker_signature_type ENUM('none','draw','text','image') NOT NULL DEFAULT 'none',
  reviewer_signature_data MEDIUMTEXT DEFAULT NULL,
  reviewer_signature_type ENUM('none','draw','text','image') NOT NULL DEFAULT 'none',
  checker_signed_at TIMESTAMP NULL DEFAULT NULL,
  reviewer_signed_at TIMESTAMP NULL DEFAULT NULL,
  attachment_name VARCHAR(255) DEFAULT NULL,
  attachment_data MEDIUMTEXT DEFAULT NULL,
  record_date DATE NOT NULL,
  report_year INT NOT NULL,
  report_week INT NOT NULL,
  serial_no VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  period_start DATE DEFAULT NULL,
  period_end DATE DEFAULT NULL,
  weekly_goal TEXT,
  content MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_research_notes_writer (writer_zoom_user_id),
  KEY idx_research_notes_report (report_year, report_week),
  CONSTRAINT fk_research_notes_writer FOREIGN KEY (writer_zoom_user_id) REFERENCES users (zoom_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE research_note_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_mime VARCHAR(191) NOT NULL,
  file_data LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_note_files_note (note_id),
  CONSTRAINT fk_research_note_files_note FOREIGN KEY (note_id) REFERENCES research_notes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_vacations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  zoom_user_id VARCHAR(128) NOT NULL,
  year INT NOT NULL,
  week INT NOT NULL,
  reason VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_week (zoom_user_id, year, week)
);

CREATE TABLE zoom_oauth_tokens (
  id INT PRIMARY KEY,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  expires_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
