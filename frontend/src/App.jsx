import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { DataProvider } from './context/DataContext';
import { LanguageProvider } from './context/LanguageContext';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import MyProfile from './pages/MyProfile';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Deals from './pages/Deals';
import Tasks from './pages/Tasks';
import Invoices from './pages/Finance/Invoices';
import InvoicePreview from './pages/Finance/InvoicePreview';
import QuotationPreview from './pages/Finance/QuotationPreview';
import Files from './pages/Files';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import CompanySettings from './pages/Settings/CompanySettings';
import SuperAdmin from './pages/SuperAdmin';
import Attendance from './pages/HR/Attendance';
import AttendanceAdmin from './pages/HR/AttendanceAdmin';
import UnitsRegistry from './pages/RealEstate/UnitsRegistry';
import MyRequests from './pages/HR/MyRequests';
import ApprovalCenter from './pages/HR/ApprovalCenter';
import PayrollEngine from './pages/HR/PayrollEngine';
import ActivityDefinition from './pages/HR/ActivityDefinition';
import ActivityBalance from './pages/HR/ActivityBalance';
import Shifts from './pages/HR/Shifts';
import AttendanceDevices from './pages/HR/AttendanceDevices';
import InventoryControl from './pages/Inventory/InventoryControl';
import AutomationControl from './pages/Automation/AutomationControl';
import RuleBuilder from './pages/Automation/RuleBuilder';
import Pricing from './pages/Pricing/Pricing';
import AdminPlans from './pages/Admin/AdminPlans';
import AdminUpgradeRequests from './pages/Admin/AdminUpgradeRequests';
import Billing from './pages/Billing/Billing';
import PlatformWrapper from './pages/SuperAdmin/PlatformWrapper';
import SecretPortalHUD from './pages/SuperAdmin/SecretPortalHUD';

// Contacts Module Pages
import ContactsCustomers from './pages/Contacts/ContactsCustomers';
import ContactsVendors from './pages/Contacts/ContactsVendors';
import ContactsEmployees from './pages/Contacts/ContactsEmployees';

// ERP Suite Pages
import ChartOfAccounts from './pages/ERP/ChartOfAccounts';
import JournalEntries from './pages/ERP/JournalEntries';
import SalesCycle from './pages/ERP/SalesCycle';
import PurchasingCycle from './pages/ERP/PurchasingCycle';
import FinancialReports from './pages/ERP/FinancialReports';
import BankReconciliation from './pages/ERP/BankReconciliation';
import PeriodClosing from './pages/ERP/PeriodClosing';

// Corporate Pages
import CorporateLayout from './pages/Corporate/CorporateLayout';
import CorporateHome from './pages/Corporate/Home';
import ProductRetail from './pages/Corporate/ProductRetail';
import ProductRestaurant from './pages/Corporate/ProductRestaurant';
import BusinessServices from './pages/Corporate/ProductServices';
import DemoAccess from './pages/Corporate/DemoAccess';

// Placeholder components for other modules
const Placeholder = ({ name }) => (
  <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--border)' }}>
    <h2 style={{ color: 'var(--primary)', marginBottom: '16px' }}>{name} Module</h2>
    <p>This module is currently under development. Stay tuned for Phase 10!</p>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BranchProvider>
          <DataProvider>
            <Router>
              <Toaster position="top-right" reverseOrder={false} />
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/pricing" element={<Pricing />} />

                {/* Corporate "Sales Machine" Layer */}
                <Route path="/" element={<CorporateLayout />}>
                  <Route index element={<CorporateHome />} />
                  <Route path="retail" element={<ProductRetail />} />
                  <Route path="restaurants" element={<ProductRestaurant />} />
                  <Route path="services" element={<BusinessServices />} />
                  <Route path="solutions" element={<Placeholder name="Solutions" />} />
                  <Route path="about" element={<Placeholder name="About Us" />} />
                  <Route path="portfolio" element={<Placeholder name="Portfolio" />} />
                  <Route path="contact" element={<Placeholder name="Contact" />} />
                  <Route path="demo" element={<DemoAccess />} />
                </Route>

                {/* Protected Dashboard Routes */}
                <Route 
                  path="/" 
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="my-profile" element={<MyProfile />} />
                  <Route path="inventory" element={<Navigate to="/inventory/movements" replace />} />
                  <Route path="pricing" element={<Pricing />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="contacts/customers" element={<ContactsCustomers />} />
                  <Route path="contacts/vendors" element={<ContactsVendors />} />
                  <Route path="contacts/employees" element={<ContactsEmployees />} />
                  <Route path="products" element={<Products />} />
                  <Route path="deals" element={<Deals />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="units-registry" element={<UnitsRegistry />} />
                  <Route path="finance" element={<Invoices />} />
                  <Route path="finance/invoice-preview/:id" element={<InvoicePreview />} />
                  <Route path="finance/quotation-preview/:id" element={<QuotationPreview />} />

                  {/* ERP Core System Routes */}
                  <Route path="erp/accounts" element={<ChartOfAccounts />} />
                  <Route path="erp/journals" element={<JournalEntries />} />
                  <Route path="erp/sales" element={<SalesCycle />} />
                  <Route path="erp/purchasing" element={<PurchasingCycle />} />
                  <Route path="erp/reports" element={<FinancialReports />} />
                  <Route path="erp/banking" element={<BankReconciliation />} />
                  <Route path="erp/closing" element={<PeriodClosing />} />
                  <Route path="accounting" element={<Navigate to="/erp/accounts" replace />} />
                  <Route path="reports" element={<Navigate to="/erp/reports" replace />} />
                  <Route 
                    path="employees" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <Employees />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="hr/my-attendance" element={<Attendance />} />
                  <Route path="hr" element={<Navigate to="/hr/dashboard" replace />} />
                  <Route path="hr/my-requests" element={<MyRequests />} />
                  <Route 
                    path="hr/dashboard" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <AttendanceAdmin />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="hr/approvals" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <ApprovalCenter />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="hr/payroll" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <PayrollEngine />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="hr/activity-definition" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <ActivityDefinition />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="hr/activity-balance" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <ActivityBalance />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="hr/shifts" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <Shifts />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="hr/devices" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <AttendanceDevices />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="inventory/movements" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <InventoryControl />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="automation" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <AutomationControl />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="automation/rules" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'manager']}>
                        <RuleBuilder />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="files" element={<Files />} />
                  <Route path="reports" element={<Reports />} />
                  <Route 
                    path="logs" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <Logs />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="settings" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <Settings />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="settings/company" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <CompanySettings />
                      </ProtectedRoute>
                    } 
                  />
                </Route>

                {/* --- SECLUDED PLATFORM OWNER PORTAL (SOP) --- */}
                {/* MOVED OUTSIDE MAIN Layout FOR ISOLATION */}
                <Route path="itqan-crm-hud" element={<PlatformWrapper />}>
                  <Route index element={<SecretPortalHUD />} />
                  <Route path="hub" element={<SuperAdmin />} />
                  <Route path="pricing" element={<AdminPlans />} />
                  <Route path="upgrades" element={<AdminUpgradeRequests />} />
                  <Route path="audit" element={<Logs />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </DataProvider>
        </BranchProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const AppWrapper = () => (
  <LanguageProvider>
    <App />
  </LanguageProvider>
);

export default AppWrapper;
