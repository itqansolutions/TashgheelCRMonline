const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const purchasesController = require('../controllers/purchasesController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

// Apply auth and strict branch isolation to ALL finance routes
router.use(authMiddleware);
router.use(branchScope);

// @route   GET api/finance/invoices
// @desc    Get all isolated invoices
router.get('/invoices', financeController.getInvoices);

// @route   POST api/finance/invoices
// @desc    Create new isolated invoice and items
router.post('/invoices', financeController.createInvoice);

// @route   POST api/finance/invoices/from-deal/:dealId
// @desc    Convert Deal to Invoice directly
router.post('/invoices/from-deal/:dealId', financeController.createInvoiceFromDeal);

// @route   GET api/finance/invoices/:id
// @desc    Deep fetch for particular Invoice (Items + Payments)
router.get('/invoices/:id', financeController.getInvoiceDetails);

// @route   POST api/finance/payments
// @desc    Register a payment and run Smart Status calculation
router.post('/payments', financeController.createPayment);

// @route   POST api/finance/invoices/:id/payments
// @desc    Register a payment directly to an invoice (nested route compatibility)
router.post('/invoices/:id/payments', financeController.createInvoicePaymentDirect);

// @route   GET api/finance/vouchers
// @desc    Get all vouchers (Receipt & Payment) with optional type filter
router.get('/vouchers', financeController.getVouchers);

// @route   POST api/finance/vouchers
// @desc    Create a new voucher (Receipt or Payment)
router.post('/vouchers', financeController.createVoucher);

// @route   GET api/finance/vouchers/:id
// @desc    Get detailed voucher for preview & printing
router.get('/vouchers/:id', financeController.getVoucherDetails);

const { requirePermission } = require('../middleware/financialPermission');

// @route   POST api/finance/vouchers/:id/cancel
// @desc    Cancel a voucher with mandatory reason in body (Requires voucher.cancel permission: admin only)
router.post('/vouchers/:id/cancel', requirePermission('voucher.cancel'), financeController.deleteVoucher);

// @route   DELETE api/finance/vouchers/:id
// @desc    Backward-compatible alias for cancel voucher
router.delete('/vouchers/:id', requirePermission('voucher.cancel'), financeController.deleteVoucher);

// @route   GET api/finance/expenses
// @desc    Get expenses under finance
router.get('/expenses', financeController.getExpenses);

// @route   POST api/finance/expenses
// @desc    Create an expense under finance
router.post('/expenses', financeController.createExpense);

// @route   GET api/finance/income
// @desc    Get income records under finance
router.get('/income', financeController.getIncome);

// @route   GET api/finance/summary
// @desc    Get financial KPI summary
router.get('/summary', financeController.getSummary);

// ==========================================
// CUSTOMER ACCOUNTS — Phase 2
// ==========================================

// @route   GET api/finance/customers
// @desc    All customers with financial activity, totals & aging summary
router.get('/customers', financeController.getCustomerAccounts);

// @route   GET api/finance/customers/:id/statement
// @desc    Full debit/credit statement + summary for a customer
router.get('/customers/:id/statement', financeController.getCustomerStatement);

// @route   GET api/finance/customers/:id/aging
// @desc    Aging report (5 buckets from due_date) for a customer
router.get('/customers/:id/aging', financeController.getCustomerAging);

// ==========================================
// TREASURY — Phase 3
// ==========================================

// @route   GET api/finance/treasury/accounts
// @desc    List all treasury accounts + computed balance per account
router.get('/treasury/accounts', financeController.getTreasuryAccounts);

// @route   POST api/finance/treasury/accounts
// @desc    Create a cashbox or bank account
router.post('/treasury/accounts', financeController.createTreasuryAccount);

// @route   PUT api/finance/treasury/accounts/:id
// @desc    Update treasury account details (name, bank info, default, active)
router.put('/treasury/accounts/:id', financeController.updateTreasuryAccount);

// @route   GET api/finance/treasury/accounts/:id/transactions
// @desc    UNION of payments (IN) + expenses (OUT) for a treasury account
router.get('/treasury/accounts/:id/transactions', financeController.getTreasuryAccountTransactions);

// ==========================================
// FINANCIAL INTELLIGENCE & REPORTS — Phase 4
// ==========================================

// @route   GET api/finance/reports
// @desc    Financial intelligence overview & 5 core reports
router.get('/reports', financeController.getFinancialReports);

// ==========================================
// VENDOR ACCOUNTS & PAYABLES — Phase 5A
// ==========================================

// @route   GET api/finance/vendors
// @desc    All vendors with financial activity, totals & payables summary
router.get('/vendors', financeController.getVendorAccounts);

// @route   GET api/finance/vendors/:id/statement
// @desc    Full purchases/payments statement for a vendor
router.get('/vendors/:id/statement', purchasesController.getVendorStatement);

// @route   GET api/finance/vendors/:id/aging
// @desc    Aging report (5 buckets from due_date) for a vendor
router.get('/vendors/:id/aging', financeController.getVendorAging);

// @route   POST api/finance/vendors/:id/payments
// @desc    Record a vendor payment and link to Treasury
router.post('/vendors/:id/payments', purchasesController.recordVendorPayment);

module.exports = router;

