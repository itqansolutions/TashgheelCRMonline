-- Migration: Add HR fields to users table + FK to job_titles
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS national_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS insurance_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20) DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT 'male',
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS job_title_id INTEGER REFERENCES job_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_working BOOLEAN DEFAULT TRUE;

-- Add manager_id to departments
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
