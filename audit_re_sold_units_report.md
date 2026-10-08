# Phase 1: Real Estate "Sold" Units Audit & Reconciliation Report

**Audit Date:** October 2026  
**Target Table:** `re_units`  
**Purpose:** Precise classification and evidence-based reconciliation of existing units marked as `Sold` prior to schema constraint enforcement and code transitions.

---

## 1. Executive Summary & Inventory Overview

A complete scan of the PostgreSQL `re_units` table across all tenants revealed:
- **Total Units in Database:** 11 units
- **Available Units:** 7 units (`status = 'Available'`)
- **Reserved Units:** 0 units
- **Sold Units:** 4 units (`status = 'Sold'`)

---

## 2. Unit-by-Unit Evidence & Classification Matrix

| # | Unit ID | Unit Number & Name | Tenant ID | Associated Deal | Associated Contract & Status | Handover Milestone & Status | Evidentiary Assessment | Target Reconciled Status |
|---|---|---|---|---|---|---|---|---|
| **1** | `e4abce60-bd67-4787-adab-d97ef1983d8e` | **AUD-101**<br/>(Audit Master Unit) | `3a7103aa...` | Deal #36<br/>(`won`) | `c3abc78f...`<br/>**CNT-AUDIT-2026** (`Active`) | `b33eabd3...`<br/>**Handed Over** | **Conclusive Handover**<br/>The contract is Active, and the physical handover milestone is confirmed as completed (`Handed Over`). | **`Handed Over`** |
| **2** | `460fa5bb-6160-4af1-bf96-b951fceae992` | **VIL-07**<br/>(Grand Standalone Villa) | `3a7103aa...` | Deal #33<br/>(`won`) | `d02dbce6...`<br/>**CNT-2026-0089** (`Active`) | `37f5ecd9...`<br/>**Inspection** | **Binding Contract in Delivery Pipeline**<br/>Contract is Active; Handover is scheduled and currently at `Inspection` stage. Possession not yet transferred. | **`Contracted`** |
| **3** | `551a04f9-bb16-4be1-acdb-ee5d87438e11` | **AUD-101**<br/>(Audit Master Unit) | `3a7103aa...` | Deal #40<br/>(`won`) | `cedd3d1a...`<br/>**CNT-AUDIT-2026** (`Active`) | `6d1593d2...`<br/>**Handed Over** | **Conclusive Handover**<br/>The contract is Active, and physical handover is completed (`Handed Over`). | **`Handed Over`** |
| **4** | `0384db5f-4da7-427e-818f-51e01a5eb4da` | **UNIT-TEST-99**<br/>(Live Test Unit 99) | `3a7103aa...` | Deal #43<br/>(`won`) | `f1c39d96...`<br/>**REC-202610-9552** (`Draft`) | *None* | **Unsigned Draft Contract**<br/>The deal was marked `won` during test creation, generating a `Draft` contract, but no signed contract or handover exists. As the deal is won/locked awaiting signature, it is either `Reserved` pending signature or `Contracted`. In accordance with conservative audit principles, units with un-executed draft contracts should be held as **`Reserved`** or **`Contracted`**. Because the originating deal is won, transitioning it to `Reserved` (or `Contracted` upon manual confirmation) preserves its reservation lock without falsely assuming a signed contract. | **`Reserved`** |

---

## 3. Reconciliation Actions Summary

1. **Units to transition to `Handed Over`:** 2 units (`e4abce60...`, `551a04f9...`)
2. **Units to transition to `Contracted`:** 1 unit (`460fa5bb...`)
3. **Units to transition to `Reserved` (Pending Contract Signing):** 1 unit (`0384db5f...`)
4. **Units requiring manual escalation:** 0 units (all 4 have clear, documented provenance).

Once these updates are executed, **zero units will remain with `status = 'Sold'`**, allowing the strict DB constraint:
`CHECK (status IN ('Available', 'Reserved', 'Contracted', 'Handed Over', 'Under Dispute'))`
to be applied without failing.
