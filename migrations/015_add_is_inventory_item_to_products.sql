-- Migration 015: Formalize inventory item tracking flag (Phase 3.1)
-- Scope: Add is_inventory_item flag to products with default true, preserving physical stock tracking for existing catalog

BEGIN;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_inventory_item BOOLEAN NOT NULL DEFAULT true;

COMMIT;
