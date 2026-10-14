import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Plus, Search, X, Users2, Building, Briefcase, Paperclip,
  ChevronRight, ChevronDown, ChevronUp, User, Phone, Hash, Shield, Calendar, CheckCircle, Save
} from 'lucide-react';
import FileUploader from '../../components/Common/FileUploader';
import { useLanguage } from '../../context/LanguageContext';

// ─── Utility ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US') : '—';

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
  borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none',
  boxSizing: 'border-box', background: '#fafafa', transition: 'border-color 0.2s'
};

const labelStyle = {
  display: 'block', fontWeight: 700, fontSize: '12px', color: '#374151', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em'
};

// ─── Department Modal ─────────────────────────────────────────────────────────
const DeptModal = ({ dept, departments = [], users, onClose, onSave }) => {
  const { t, isRTL } = useLanguage();
  const [form, setForm] = useState({
    name: dept?.name || '',
    manager_id: dept?.manager_id || '',
    parent_department_id: dept?.parent_department_id || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('hr.contactsEmployees.toastDeptNameRequired'));
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        manager_id: form.manager_id || null,
        parent_department_id: form.parent_department_id ? parseInt(form.parent_department_id, 10) : null
      };
      if (dept) { await api.put(`/departments/${dept.id}`, payload); toast.success(t('hr.contactsEmployees.toastDeptUpdated')); }
      else { await api.post('/departments', payload); toast.success(t('hr.contactsEmployees.toastDeptAdded')); }
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || t('hr.contactsEmployees.toastLoadDataError')); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{dept ? t('hr.contactsEmployees.modalDeptEdit') : t('hr.contactsEmployees.modalDeptAdd')}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>{t('hr.contactsEmployees.lblDeptName')}</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('hr.contactsEmployees.placeholderDeptName')} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>{t('hr.contactsEmployees.lblSupervisingDept')}</label>
            <select
              value={form.parent_department_id}
              onChange={e => setForm(f => ({ ...f, parent_department_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">{t('hr.contactsEmployees.optTopLevelDept')}</option>
              {departments
                .filter(d => !dept || d.id !== dept.id)
                .map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('hr.contactsEmployees.lblDirectManager')}</label>
            <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))} style={inputStyle}>
              <option value="">{t('hr.contactsEmployees.optSelectManager')}</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>{t('hr.contactsEmployees.btnCancel')}</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 22px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t('hr.contactsEmployees.saving') : t('hr.contactsEmployees.btnSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Job Title Modal ──────────────────────────────────────────────────────────
const JobTitleModal = ({ jt, onClose, onSave }) => {
  const { t, isRTL } = useLanguage();
  const [name, setName] = useState(jt?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error(t('hr.contactsEmployees.toastJobTitleRequired'));
    setSaving(true);
    try {
      if (jt) { await api.put(`/job-titles/${jt.id}`, { name }); toast.success(t('hr.contactsEmployees.toastJobTitleUpdated')); }
      else { await api.post('/job-titles', { name }); toast.success(t('hr.contactsEmployees.toastJobTitleAdded')); }
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || t('hr.contactsEmployees.toastLoadDataError')); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '380px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{jt ? t('hr.contactsEmployees.modalJobEdit') : t('hr.contactsEmployees.modalJobAdd')}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>{t('hr.contactsEmployees.lblJobTitleName')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('hr.contactsEmployees.placeholderJobTitleName')} style={inputStyle} required />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>{t('hr.contactsEmployees.btnCancel')}</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t('hr.contactsEmployees.saving') : t('hr.contactsEmployees.btnSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Permission Groups Definition ─────────────────────────────────────────────
const PERMISSION_GROUPS = [
  {
    key: 'hr',
    title: 'HR & Attendance',
    pages: [
      { id: '/hr/my-attendance', label: 'My Attendance' },
      { id: '/hr/my-requests', label: 'My Requests' },
      { id: '/hr/dashboard', label: 'Attendance Admin' },
      { id: '/hr/approvals', label: 'Approvals Center' },
      { id: '/hr/payroll', label: 'Payroll Engine' },
      { id: '/hr/shifts', label: 'Shifts' },
      { id: '/hr/devices', label: 'Biometric Devices' },
      { id: '/hr/activity-definition', label: 'Activity Definition' },
      { id: '/hr/activity-balance', label: 'Activity Balance' },
    ]
  },
  {
    key: 'warehouse',
    title: 'Warehouse & Inventory',
    pages: [
      { id: '/products', label: 'Products' },
      { id: '/inventory/warehouses', label: 'Warehouses' },
      { id: '/purchases', label: 'Purchases (Invoices)' },
      { id: '/purchases/requests', label: 'Purchase Requests' },
      { id: '/purchases/orders', label: 'Purchase Orders' },
      { id: '/purchases/rfqs', label: 'RFQs' },
      { id: '/inventory/movements', label: 'Stock Movements' },
      { id: '/inventory/balances', label: 'Stock Balances' },
      { id: '/inventory/item-card', label: 'Item Card' },
      { id: '/inventory/keepers', label: 'Warehouse Keepers' },
      { id: '/inventory/transaction-impact', label: 'Transaction Impact' },
    ]
  },
  {
    key: 'sales',
    title: 'Sales & Pipeline',
    pages: [
      { id: '/deals', label: 'Deals' },
      { id: '/sales/orders', label: 'Sales Orders' },
      { id: '/sales/salesmen', label: 'Salesmen' },
      { id: '/sales/target', label: 'Target & Goals' },
      { id: '/sales/documents', label: 'Documents Hub' },
      { id: '/sales/price-tiers', label: 'Price Tiers' },
    ]
  },
  {
    key: 'finance',
    title: 'Finance & Accounting',
    pages: [
      { id: '/finance', label: 'Invoices & Quotations' },
      { id: '/erp/accounts', label: 'Chart of Accounts' },
      { id: '/erp/journals', label: 'General Ledger' },
      { id: '/erp/reports', label: 'Financial Reports' },
      { id: '/erp/banking', label: 'Bank Reconciliation' },
      { id: '/erp/closing', label: 'Period Closing' },
      { id: '/erp/entries', label: 'Entries' },
    ]
  },
  {
    key: 'crm',
    title: 'CRM & Contacts',
    pages: [
      { id: '/contacts/customers', label: 'Customers' },
      { id: '/contacts/vendors', label: 'Vendors' },
      { id: '/contacts/employees', label: 'Employees' },
      { id: '/tasks', label: 'Tasks' },
    ]
  },
  {
    key: 'marketing',
    title: 'WhatsApp & Marketing',
    pages: [
      { id: '/whatsapp-chat', label: 'WhatsApp Live Chat' },
      { id: '/marketing/whatsapp-campaigns', label: 'WhatsApp Campaigns' },
      { id: '/marketing/whatsapp-chatbots', label: 'WhatsApp Chatbots' },
      { id: '/integrations/whatsapp', label: 'WhatsApp Settings' },
    ]
  },
  {
    key: 'real_estate',
    title: 'Real Estate & Properties',
    pages: [
      { id: '/units-registry', label: 'Units Registry' },
      { id: '/reservations', label: 'Reservations' },
      { id: '/contracts', label: 'Contracts' },
      { id: '/installments', label: 'Installments' },
      { id: '/commissions', label: 'Commissions' },
      { id: '/handover', label: 'Handover' },
    ]
  },
  {
    key: 'admin',
    title: 'General & Administration',
    pages: [
      { id: '/dashboard', label: 'Dashboard' },
      { id: '/my-profile', label: 'My Profile' },
      { id: '/files', label: 'Files' },
      { id: '/reports', label: 'Reports' },
      { id: '/automation', label: 'Automation' },
      { id: '/integrations/einvoice', label: 'E-Invoice' },
      { id: '/integrations/meta-forms', label: 'Meta Lead Ads' },
      { id: '/settings', label: 'Admin Settings' },
      { id: '/billing', label: 'Billing' },
    ]
  }
];

// ─── Employee Modal ───────────────────────────────────────────────────────────
const EmployeeModal = ({ emp, departments, jobTitles, onClose, onSave }) => {
  const { t, isRTL } = useLanguage();
  const [activeTab, setActiveTab] = useState('info');
  const [saving, setSaving] = useState(false);
  const [allowedPages, setAllowedPages] = useState([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [permSearch, setPermSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const [form, setForm] = useState({
    name: emp?.name || '',
    email: emp?.email || '',
    password: '',
    phone: emp?.phone || '',
    national_id: emp?.national_id || '',
    insurance_no: emp?.insurance_no || '',
    marital_status: emp?.marital_status || 'single',
    gender: emp?.gender || 'male',
    birth_date: emp?.birth_date ? emp.birth_date.split('T')[0] : '',
    hire_date: emp?.hire_date ? emp.hire_date.split('T')[0] : '',
    job_title_id: emp?.job_title_id || '',
    department_id: emp?.department_id || '',
    role: emp?.role || 'employee',
    is_working: emp?.is_working !== false,
  });

  useEffect(() => {
    if (emp?.id) {
      setLoadingPerms(true);
      api.get(`/users/${emp.id}/permissions`)
        .then(res => {
          const perms = Array.isArray(res.data.data) ? res.data.data.map(p => p.page_path) : [];
          setAllowedPages(perms);
        })
        .catch(() => toast.error(t('hr.contactsEmployees.toastLoadPermsError')))
        .finally(() => setLoadingPerms(false));
    }
  }, [emp?.id, t]);

  const handleTogglePermission = (path) => {
    setAllowedPages(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const handleSavePermissions = async () => {
    if (!emp?.id) return;
    setSavingPerms(true);
    try {
      await api.post(`/users/${emp.id}/permissions`, { allowedPages });
      toast.success(t('hr.contactsEmployees.toastSavePermsSuccess'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('hr.contactsEmployees.toastSavePermsError'));
    } finally {
      setSavingPerms(false);
    }
  };

  const applyPreset = (presetType) => {
    if (presetType === 'ALL') {
      const all = PERMISSION_GROUPS.flatMap(g => g.pages.map(p => p.id));
      setAllowedPages([...new Set(all)]);
    } else if (presetType === 'CLEAR') {
      setAllowedPages(['/dashboard', '/my-profile']);
    } else if (presetType === 'SALES') {
      setAllowedPages([
        '/dashboard', '/my-profile', '/contacts/customers', '/deals', '/tasks',
        '/sales/orders', '/sales/salesmen', '/sales/target', '/sales/documents',
        '/sales/price-tiers', '/finance', '/hr/my-attendance', '/hr/my-requests', '/files'
      ]);
    } else if (presetType === 'HR') {
      setAllowedPages([
        '/dashboard', '/my-profile', '/contacts/employees',
        '/hr/my-attendance', '/hr/my-requests', '/hr/dashboard', '/hr/approvals',
        '/hr/payroll', '/hr/shifts', '/hr/devices', '/hr/activity-definition',
        '/hr/activity-balance', '/files'
      ]);
    } else if (presetType === 'ACCOUNTANT') {
      setAllowedPages([
        '/dashboard', '/my-profile', '/contacts/customers', '/contacts/vendors',
        '/finance', '/erp/accounts', '/erp/journals', '/erp/reports',
        '/erp/banking', '/erp/closing', '/erp/entries', '/files', '/reports'
      ]);
    } else if (presetType === 'WAREHOUSE') {
      setAllowedPages([
        '/dashboard', '/my-profile', '/products', '/inventory/warehouses',
        '/inventory/movements', '/inventory/balances', '/inventory/item-card',
        '/inventory/keepers', '/inventory/transaction-impact', '/purchases', '/files'
      ]);
    } else if (presetType === 'WHATSAPP') {
      setAllowedPages([
        '/dashboard', '/my-profile', '/whatsapp-chat', '/marketing/whatsapp-campaigns',
        '/marketing/whatsapp-chatbots', '/contacts/customers', '/deals', '/tasks', '/files'
      ]);
    } else if (presetType === 'REAL_ESTATE') {
      setAllowedPages([
        '/dashboard', '/my-profile', '/units-registry', '/contacts/customers',
        '/deals', '/tasks', '/finance', '/files'
      ]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('hr.contactsEmployees.toastFullNameRequired'));
    if (!form.email.trim()) return toast.error(t('hr.contactsEmployees.toastEmailRequired'));
    if (!emp && !form.password) return toast.error(t('hr.contactsEmployees.toastPasswordRequired'));
    setSaving(true);
    try {
      if (emp) {
        await api.put(`/users/${emp.id}/role`, form);
        toast.success(t('hr.contactsEmployees.toastEmpUpdated'));
      } else {
        await api.post('/users', form);
        toast.success(t('hr.contactsEmployees.toastEmpAdded'));
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.message || t('hr.contactsEmployees.toastLoadDataError'));
    } finally { setSaving(false); }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const tabs = [
    { id: 'info', label: t('hr.contactsEmployees.tabBasicInfo'), icon: <User size={14} /> },
    { id: 'permissions', label: t('hr.contactsEmployees.tabPermissions'), icon: <Shield size={14} />, disabled: !emp },
    { id: 'attachments', label: t('hr.contactsEmployees.tabAttachments'), icon: <Paperclip size={14} />, disabled: !emp },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '750px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{emp ? t('hr.contactsEmployees.modalEmpEdit') : t('hr.contactsEmployees.modalEmpAdd')}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* Sub-Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 20px 0', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {tabs.map(tTab => (
            <button key={tTab.id} onClick={() => !tTab.disabled && setActiveTab(tTab.id)} disabled={tTab.disabled}
              style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === tTab.id ? '2px solid #4f46e5' : '2px solid transparent', color: tTab.disabled ? '#cbd5e1' : activeTab === tTab.id ? '#4f46e5' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: tTab.disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '-1px' }}>
              {tTab.icon} {tTab.label} {tTab.disabled && <span style={{ fontSize: '10px' }}>{t('hr.contactsEmployees.saveFirst')}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
          {activeTab === 'info' ? (
            <form id="emp-form" onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblFullName')}</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('hr.contactsEmployees.placeholderFullName')} style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblEmail')}</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder={t('hr.contactsEmployees.placeholderEmail')} style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>{emp ? t('hr.contactsEmployees.lblPasswordEdit') : t('hr.contactsEmployees.lblPasswordAdd')}</label>
                  <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={emp ? t('hr.contactsEmployees.placeholderPasswordEdit') : '••••••••'} style={inputStyle} required={!emp} />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblPhone')}</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01xxxxxxxxx" style={inputStyle} className="num-en" />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblNationalId')}</label>
                  <input value={form.national_id} onChange={e => set('national_id', e.target.value)} placeholder="30xxxxxxxxxxxxxx" style={inputStyle} className="num-en" />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblInsuranceNo')}</label>
                  <input value={form.insurance_no} onChange={e => set('insurance_no', e.target.value)} placeholder="Social insurance number" style={inputStyle} className="num-en" />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblGender')}</label>
                  <select value={form.gender} onChange={e => set('gender', e.target.value)} style={inputStyle}>
                    <option value="male">{t('hr.contactsEmployees.genderMale')}</option>
                    <option value="female">{t('hr.contactsEmployees.genderFemale')}</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblMaritalStatus')}</label>
                  <select value={form.marital_status} onChange={e => set('marital_status', e.target.value)} style={inputStyle}>
                    <option value="single">{t('hr.contactsEmployees.maritalSingle')}</option>
                    <option value="married">{t('hr.contactsEmployees.maritalMarried')}</option>
                    <option value="divorced">{t('hr.contactsEmployees.maritalDivorced')}</option>
                    <option value="widowed">{t('hr.contactsEmployees.maritalWidowed')}</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblBirthDate')}</label>
                  <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblHireDate')}</label>
                  <input type="date" value={form.hire_date} onChange={e => set('hire_date', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblJobTitle')}</label>
                  <select value={form.job_title_id} onChange={e => set('job_title_id', e.target.value)} style={inputStyle}>
                    <option value="">{t('hr.contactsEmployees.optSelectJobTitle')}</option>
                    {jobTitles.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblDepartment')}</label>
                  <select value={form.department_id} onChange={e => set('department_id', e.target.value)} style={inputStyle}>
                    <option value="">{t('hr.contactsEmployees.optSelectDepartment')}</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('hr.contactsEmployees.lblRole')}</label>
                  <select value={form.role} onChange={e => set('role', e.target.value)} style={inputStyle}>
                    <option value="employee">{t('hr.contactsEmployees.roleEmployee')}</option>
                    <option value="manager">{t('hr.contactsEmployees.roleManager')}</option>
                    <option value="admin">{t('hr.contactsEmployees.roleAdmin')}</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" id="is_working" checked={form.is_working} onChange={e => set('is_working', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }} />
                  <label htmlFor="is_working" style={{ fontWeight: 700, fontSize: '14px', cursor: 'pointer', color: form.is_working ? '#10b981' : '#64748b' }}>
                    {form.is_working ? `✅ ${t('hr.contactsEmployees.statusActive')}` : `⏸️ ${t('hr.contactsEmployees.statusInactive')}`}
                  </label>
                </div>
              </div>
            </form>
          ) : activeTab === 'permissions' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 800, fontSize: '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={18} style={{ color: '#4f46e5' }} /> {t('hr.contactsEmployees.permsHeading', { name: emp?.name })}
                  </h4>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '12px' }}>
                    {t('hr.contactsEmployees.permsSubtitle', { count: allowedPages.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingPerms}
                  style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: savingPerms ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(16,185,129,0.25)' }}
                >
                  <Save size={14} /> {savingPerms ? t('hr.contactsEmployees.savingPerms') : t('hr.contactsEmployees.btnSavePerms')}
                </button>
              </div>

              {/* Presets Toolbar */}
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '12px', marginBottom: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('hr.contactsEmployees.quickPresets')}</span>
                <button type="button" onClick={() => applyPreset('ALL')} style={{ padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetAll')}</button>
                <button type="button" onClick={() => applyPreset('HR')} style={{ padding: '4px 10px', background: '#ec4899', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetHr')}</button>
                <button type="button" onClick={() => applyPreset('WAREHOUSE')} style={{ padding: '4px 10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetWarehouse')}</button>
                <button type="button" onClick={() => applyPreset('SALES')} style={{ padding: '4px 10px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetSales')}</button>
                <button type="button" onClick={() => applyPreset('ACCOUNTANT')} style={{ padding: '4px 10px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetAccountant')}</button>
                <button type="button" onClick={() => applyPreset('WHATSAPP')} style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetWhatsapp')}</button>
                <button type="button" onClick={() => applyPreset('REAL_ESTATE')} style={{ padding: '4px 10px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetRealEstate')}</button>
                <button type="button" onClick={() => applyPreset('CLEAR')} style={{ padding: '4px 10px', background: '#e2e8f0', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>{t('hr.contactsEmployees.presetClear')}</button>
              </div>

              {/* Module Filter Tabs */}
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {[
                  { key: 'ALL', label: t('hr.contactsEmployees.catAll') },
                  { key: 'hr', label: t('hr.contactsEmployees.catHr') },
                  { key: 'warehouse', label: t('hr.contactsEmployees.catWarehouse') },
                  { key: 'sales', label: t('hr.contactsEmployees.catSales') },
                  { key: 'finance', label: t('hr.contactsEmployees.catFinance') },
                  { key: 'crm', label: t('hr.contactsEmployees.catCrm') },
                  { key: 'marketing', label: t('hr.contactsEmployees.catMarketing') },
                  { key: 'admin', label: t('hr.contactsEmployees.catAdmin') },
                ].map(cat => {
                  const isSelected = activeCategory === cat.key;
                  const catGroups = cat.key === 'ALL' ? PERMISSION_GROUPS : PERMISSION_GROUPS.filter(g => g.key === cat.key);
                  const catPageIds = catGroups.flatMap(g => g.pages.map(p => p.id));
                  const enabledCount = catPageIds.filter(id => allowedPages.includes(id)).length;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setActiveCategory(cat.key)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: isSelected ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                        background: isSelected ? '#eef2ff' : '#ffffff',
                        color: isSelected ? '#4338ca' : '#475569',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span>{cat.label}</span>
                      <span className="num-en" style={{ background: isSelected ? '#4338ca' : '#f1f5f9', color: isSelected ? '#ffffff' : '#64748b', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}>
                        {enabledCount}/{catPageIds.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar & Collapse Toggle */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder={t('hr.contactsEmployees.searchPermsPlaceholder')}
                    value={permSearch}
                    onChange={e => setPermSearch(e.target.value)}
                    style={{ width: '100%', padding: isRTL ? '8px 32px 8px 12px' : '8px 12px 8px 32px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#fafbfc' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const allCollapsed = Object.keys(collapsedGroups).length === PERMISSION_GROUPS.length;
                    if (allCollapsed) setCollapsedGroups({});
                    else {
                      const c = {};
                      PERMISSION_GROUPS.forEach(g => { c[g.key] = true; });
                      setCollapsedGroups(c);
                    }
                  }}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {Object.keys(collapsedGroups).length === PERMISSION_GROUPS.length ? t('hr.contactsEmployees.btnExpandAll') : t('hr.contactsEmployees.btnCollapseAll')}
                </button>
              </div>

              {/* Permission Groups */}
              {loadingPerms ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>{t('hr.contactsEmployees.loadingPerms')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {PERMISSION_GROUPS
                    .filter(g => activeCategory === 'ALL' || g.key === activeCategory)
                    .map(group => {
                      const search = permSearch.trim().toLowerCase();
                      const matchedPages = search
                        ? group.pages.filter(p => p.label.toLowerCase().includes(search) || p.id.toLowerCase().includes(search))
                        : group.pages;

                      if (search && matchedPages.length === 0) return null;

                      const groupSelectedCount = group.pages.filter(p => allowedPages.includes(p.id)).length;
                      const allSelected = group.pages.length > 0 && groupSelectedCount === group.pages.length;
                      const isCollapsed = Boolean(collapsedGroups[group.key]);

                      const toggleGroupSelect = (e) => {
                        e.stopPropagation();
                        if (allSelected) {
                          const groupIds = group.pages.map(p => p.id);
                          setAllowedPages(prev => prev.filter(id => !groupIds.includes(id)));
                        } else {
                          const groupIds = group.pages.map(p => p.id);
                          setAllowedPages(prev => [...new Set([...prev, ...groupIds])]);
                        }
                      };

                      const toggleCollapse = () => {
                        setCollapsedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }));
                      };

                      return (
                        <div key={group.key || group.title} style={{ border: '1.5px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: 'white' }}>
                          <div
                            onClick={toggleCollapse}
                            style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isCollapsed ? <ChevronRight size={16} style={{ color: '#64748b' }} /> : <ChevronDown size={16} style={{ color: '#4f46e5' }} />}
                              <span style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>
                                {group.title}
                              </span>
                              <span className="num-en" style={{ fontSize: '11px', color: groupSelectedCount > 0 ? '#4f46e5' : '#94a3b8', background: groupSelectedCount > 0 ? '#eef2ff' : '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                {t('hr.contactsEmployees.selectedCount', { count: groupSelectedCount, total: group.pages.length })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={toggleGroupSelect}
                                style={{ background: allSelected ? '#fee2e2' : '#e0e7ff', color: allSelected ? '#dc2626' : '#4338ca', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                {allSelected ? t('hr.contactsEmployees.btnDeselectAll') : t('hr.contactsEmployees.btnSelectAll')}
                              </button>
                            </div>
                          </div>

                          {!isCollapsed && (
                            <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', background: '#fafbfc' }}>
                              {matchedPages.map(page => {
                                const isChecked = allowedPages.includes(page.id);
                                return (
                                  <label
                                    key={page.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      background: isChecked ? '#eff6ff' : '#ffffff',
                                      border: isChecked ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleTogglePermission(page.id)}
                                      style={{ accentColor: '#4f46e5', width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '12px', fontWeight: isChecked ? 700 : 500, color: isChecked ? '#1e40af' : '#334155' }}>
                                      {page.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px', fontWeight: 600 }}>
                {t('hr.contactsEmployees.docsUploadHint')}
              </p>
              {emp && <FileUploader linkedType="employee" linkedId={emp.id} />}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'info' && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#fafbfc' }}>
            <button onClick={onClose} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>{t('hr.contactsEmployees.btnCancel')}</button>
            <button form="emp-form" type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t('hr.contactsEmployees.saving') : emp ? t('hr.contactsEmployees.btnSaveChanges') : t('hr.contactsEmployees.btnAddEmployee')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
const ContactsEmployees = () => {
  const { t, isRTL } = useLanguage();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'employees';
  const [activeTab, setActiveTab] = useState(['employees', 'departments', 'jobtitles'].includes(initialTab) ? initialTab : 'employees');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['employees', 'departments', 'jobtitles'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [deptModal, setDeptModal] = useState(null); // null | 'add' | dept object
  const [jtModal, setJtModal] = useState(null);
  const [empModal, setEmpModal] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, dRes, jRes] = await Promise.all([
        api.get('/users'),
        api.get('/departments'),
        api.get('/job-titles'),
      ]);
      setUsers(uRes.data.data || []);
      setDepartments(dRes.data.data || []);
      setJobTitles(jRes.data.data || []);
    } catch { toast.error(t('hr.contactsEmployees.toastLoadDataError')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const handleDeleteDept = async (id) => {
    if (!window.confirm(t('hr.contactsEmployees.confirmDeleteDept'))) return;
    try { await api.delete(`/departments/${id}`); toast.success(t('hr.contactsEmployees.toastDeptDeleted')); fetchAll(); }
    catch { toast.error(t('hr.contactsEmployees.toastDeleteDeptError')); }
  };

  const handleDeleteJt = async (id) => {
    if (!window.confirm(t('hr.contactsEmployees.confirmDeleteJobTitle'))) return;
    try { await api.delete(`/job-titles/${id}`); toast.success(t('hr.contactsEmployees.toastJobTitleDeleted')); fetchAll(); }
    catch { toast.error(t('hr.contactsEmployees.toastDeleteJobTitleError')); }
  };

  const handleDeleteEmp = async () => {
    toast.error(t('hr.contactsEmployees.toastCantDeleteEmp'));
  };

  const TABS = [
    { id: 'departments', label: t('hr.contactsEmployees.tabDepartments'), icon: <Building size={15} /> },
    { id: 'jobtitles', label: t('hr.contactsEmployees.tabJobTitles'), icon: <Briefcase size={15} /> },
    { id: 'employees', label: t('hr.contactsEmployees.tabEmployees'), icon: <Users2 size={15} /> },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>{t('hr.contactsEmployees.title')}</h1>
          <p className="num-en" style={{ color: '#64748b', margin: '6px 0 0', fontSize: '14px', fontWeight: 600 }}>
            {t('hr.contactsEmployees.subtitle', { users: users.length, depts: departments.length, jobs: jobTitles.length })}
          </p>
        </div>
        <div>
          {activeTab === 'departments' && (
            <button onClick={() => setDeptModal('add')} style={{ background: 'linear-gradient(135deg, #0f172a, #334155)', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 20px', cursor: 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Plus size={16} /> {t('hr.contactsEmployees.btnAddDept')}
            </button>
          )}
          {activeTab === 'jobtitles' && (
            <button onClick={() => setJtModal('add')} style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 20px', cursor: 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Plus size={16} /> {t('hr.contactsEmployees.btnAddJobTitle')}
            </button>
          )}
          {activeTab === 'employees' && (
            <button onClick={() => setEmpModal('add')} style={{ background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 20px', cursor: 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Plus size={16} /> {t('hr.contactsEmployees.btnAddEmployee')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', borderRadius: '14px', padding: '5px', marginBottom: '24px', width: 'fit-content' }}>
        {TABS.map(tTab => (
          <button key={tTab.id} onClick={() => setActiveTab(tTab.id)} style={{
            padding: '9px 20px', border: 'none', borderRadius: '10px',
            background: activeTab === tTab.id ? 'white' : 'transparent',
            color: activeTab === tTab.id ? '#1e293b' : '#64748b',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            boxShadow: activeTab === tTab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            {tTab.icon} {tTab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('hr.contactsEmployees.loading')}</div>
      ) : (
        <>
          {/* ── Departments Tab ── */}
          {activeTab === 'departments' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {departments.length === 0 ? (
                <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <Building size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontWeight: 700, margin: 0 }}>{t('hr.contactsEmployees.noDepts')}</p>
                </div>
              ) : departments.map(d => (
                <div key={d.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #1e293b, #334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                      <Building size={20} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setDeptModal(d)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>{t('hr.contactsEmployees.btnEdit')}</button>
                      <button onClick={() => handleDeleteDept(d.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>{t('hr.contactsEmployees.btnDelete')}</button>
                    </div>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>{d.name}</h3>
                  {d.parent_department_name && (
                    <div style={{ margin: '0 0 6px', fontSize: '12px', color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{t('hr.contactsEmployees.underDept')}</span>
                      <span style={{ background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>{d.parent_department_name}</span>
                    </div>
                  )}
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                    {t('hr.contactsEmployees.managerPrefix')} <span style={{ color: '#4f46e5' }}>{d.manager_name || t('hr.contactsEmployees.unassigned')}</span>
                  </p>
                  <div className="num-en" style={{ marginTop: '12px', padding: '8px', background: '#f8fafc', borderRadius: '8px', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                    {t('hr.contactsEmployees.deptEmployeesCount', { count: users.filter(u => u.department_id === d.id).length })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Job Titles Tab ── */}
          {activeTab === 'jobtitles' && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
              {jobTitles.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                  <Briefcase size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontWeight: 700, margin: 0 }}>{t('hr.contactsEmployees.noJobTitles')}</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '14px 16px', textAlign: isRTL ? 'right' : 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('hr.contactsEmployees.colJobTitle')}</th>
                      <th style={{ padding: '14px 16px', textAlign: isRTL ? 'right' : 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{t('hr.contactsEmployees.colEmployeeCount')}</th>
                      <th style={{ padding: '14px 16px', textAlign: isRTL ? 'right' : 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{t('hr.contactsEmployees.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTitles.map((jt, i) => (
                      <tr key={jt.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                              <Briefcase size={14} />
                            </div>
                            {jt.name}
                          </div>
                        </td>
                        <td className="num-en" style={{ padding: '14px 16px', color: '#64748b', fontSize: '13px' }}>
                          {t('hr.contactsEmployees.deptEmployeesCount', { count: users.filter(u => u.job_title_id === jt.id).length })}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => setJtModal(jt)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>{t('hr.contactsEmployees.btnEdit')}</button>
                            <button onClick={() => handleDeleteJt(jt.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>{t('hr.contactsEmployees.btnDelete')}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Employees Tab ── */}
          {activeTab === 'employees' && (
            <>
              <div style={{ position: 'relative', maxWidth: '380px', marginBottom: '16px' }}>
                <Search size={16} style={{ position: 'absolute', [isRTL ? 'left' : 'right']: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('hr.contactsEmployees.searchPlaceholder')} style={{ ...inputStyle, [isRTL ? 'paddingLeft' : 'paddingRight']: '38px' }} />
              </div>
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
                {filteredUsers.length === 0 ? (
                  <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <Users2 size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                    <p style={{ fontWeight: 700, margin: 0 }}>{t('hr.contactsEmployees.noEmployees')}</p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {[
                          t('hr.contactsEmployees.colEmployee'),
                          t('hr.contactsEmployees.colJobTitle'),
                          t('hr.contactsEmployees.colDepartment'),
                          t('hr.contactsEmployees.colNationalId'),
                          t('hr.contactsEmployees.colHireDate'),
                          t('hr.contactsEmployees.colStatus'),
                          t('hr.contactsEmployees.colActions')
                        ].map(h => (
                          <th key={h} style={{ padding: '14px 16px', textAlign: isRTL ? 'right' : 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafbfc'}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 900, flexShrink: 0 }}>
                                {u.name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>{u.name}</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569', fontSize: '13px' }}>{u.job_title_name || '—'}</td>
                          <td style={{ padding: '12px 16px', color: '#475569', fontSize: '13px' }}>{u.department_name || '—'}</td>
                          <td className="num-en" style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>{u.national_id || '—'}</td>
                          <td className="num-en" style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>{fmtDate(u.hire_date)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {u.is_working !== false ? (
                              <span style={{ background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>✅ {t('hr.contactsEmployees.statusActive')}</span>
                            ) : (
                              <span style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>⏸️ {t('hr.contactsEmployees.statusInactive')}</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <button onClick={() => setEmpModal(u)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>{t('hr.contactsEmployees.btnEdit')}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Modals */}
      {deptModal && (
        <DeptModal
          dept={deptModal === 'add' ? null : deptModal}
          departments={departments}
          users={users}
          onClose={() => setDeptModal(null)}
          onSave={() => { setDeptModal(null); fetchAll(); }}
        />
      )}
      {jtModal && (
        <JobTitleModal
          jt={jtModal === 'add' ? null : jtModal}
          onClose={() => setJtModal(null)}
          onSave={() => { setJtModal(null); fetchAll(); }}
        />
      )}
      {empModal && (
        <EmployeeModal
          emp={empModal === 'add' ? null : empModal}
          departments={departments}
          jobTitles={jobTitles}
          onClose={() => setEmpModal(null)}
          onSave={() => { setEmpModal(null); fetchAll(); }}
        />
      )}
    </div>
  );
};

export default ContactsEmployees;
