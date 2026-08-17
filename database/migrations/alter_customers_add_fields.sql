-- Migration: Add new fields to customers table
-- Run this on your PostgreSQL database

ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS tax_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reg_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT FALSE;

-- Update existing rows to have default active status
UPDATE customers SET is_active = TRUE WHERE is_active IS NULL;
UPDATE customers SET is_blacklisted = FALSE WHERE is_blacklisted IS NULL;
