-- Migration: Add parent_department_id to departments table
-- Enables hierarchical department supervision (e.g. Finance over Sales)

ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON departments(parent_department_id);
