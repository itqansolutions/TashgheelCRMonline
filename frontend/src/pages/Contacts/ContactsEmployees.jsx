import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Plus, Search, X, Users2, Building, Briefcase, Paperclip,
  ChevronRight, User, Phone, Hash, Shield, Calendar, CheckCircle
} from 'lucide-react';
import FileUploader from '../../components/Common/FileUploader';

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
const DeptModal = ({ dept, users, onClose, onSave }) => {
  const [form, setForm] = useState({ name: dept?.name || '', manager_id: dept?.manager_id || '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Department name is required');
    setSaving(true);
    try {
      if (dept) { await api.put(`/departments/${dept.id}`, form); toast.success('Department updated successfully'); }
      else { await api.post('/departments', form); toast.success('Department added successfully'); }
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || 'An error occurred'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{dept ? 'Edit Department' : 'Add Department'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Department Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sales Department" style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>Direct Manager</label>
            <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))} style={inputStyle}>
              <option value="">-- Select Manager --</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 22px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Job Title Modal ──────────────────────────────────────────────────────────
const JobTitleModal = ({ jt, onClose, onSave }) => {
  const [name, setName] = useState(jt?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Job title is required');
    setSaving(true);
    try {
      if (jt) { await api.put(`/job-titles/${jt.id}`, { name }); toast.success('Job title updated successfully'); }
      else { await api.post('/job-titles', { name }); toast.success('Job title added successfully'); }
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || 'An error occurred'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '380px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{jt ? 'Edit Job Title' : 'Add Job Title'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Job Title *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales Manager" style={inputStyle} required />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Employee Modal ───────────────────────────────────────────────────────────
const EmployeeModal = ({ emp, departments, jobTitles, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState('info');
  const [saving, setSaving] = useState(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Full name is required');
    if (!emp && !form.email.trim()) return toast.error('Email is required');
    if (!emp && !form.password) return toast.error('Password is required');
    setSaving(true);
    try {
      if (emp) {
        await api.put(`/users/${emp.id}/role`, form);
        toast.success('Employee data updated successfully');
      } else {
        await api.post('/users', form);
        toast.success('Employee added successfully');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.message || 'An error occurred');
    } finally { setSaving(false); }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const tabs = [
    { id: 'info', label: 'Basic Info', icon: <User size={14} /> },
    { id: 'attachments', label: 'Attachments', icon: <Paperclip size={14} />, disabled: !emp },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{emp ? 'Edit Employee Details' : 'Add New Employee'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* Sub-Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 20px 0', borderBottom: '1px solid #e2e8f0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} disabled={t.disabled}
              style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === t.id ? '2px solid #4f46e5' : '2px solid transparent', color: t.disabled ? '#cbd5e1' : activeTab === t.id ? '#4f46e5' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: t.disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '-1px' }}>
              {t.icon} {t.label} {t.disabled && <span style={{ fontSize: '10px' }}>(Save first)</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {activeTab === 'info' ? (
            <form id="emp-form" onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Full Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Employee name" style={inputStyle} required />
                </div>
                {!emp && (<>
                  <div>
                    <label style={labelStyle}>Email Address *</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@company.com" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Password *</label>
                    <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" style={inputStyle} required />
                  </div>
                </>)}
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01xxxxxxxxx" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>National ID</label>
                  <input value={form.national_id} onChange={e => set('national_id', e.target.value)} placeholder="30xxxxxxxxxxxxxx" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Insurance No.</label>
                  <input value={form.insurance_no} onChange={e => set('insurance_no', e.target.value)} placeholder="Social insurance number" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Gender</label>
                  <select value={form.gender} onChange={e => set('gender', e.target.value)} style={inputStyle}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Marital Status</label>
                  <select value={form.marital_status} onChange={e => set('marital_status', e.target.value)} style={inputStyle}>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date of Birth</label>
                  <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Hire Date</label>
                  <input type="date" value={form.hire_date} onChange={e => set('hire_date', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Job Title</label>
                  <select value={form.job_title_id} onChange={e => set('job_title_id', e.target.value)} style={inputStyle}>
                    <option value="">-- Select Job Title --</option>
                    {jobTitles.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select value={form.department_id} onChange={e => set('department_id', e.target.value)} style={inputStyle}>
                    <option value="">-- Select Department --</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Role</label>
                  <select value={form.role} onChange={e => set('role', e.target.value)} style={inputStyle}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">System Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" id="is_working" checked={form.is_working} onChange={e => set('is_working', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }} />
                  <label htmlFor="is_working" style={{ fontWeight: 700, fontSize: '14px', cursor: 'pointer', color: form.is_working ? '#10b981' : '#64748b' }}>
                    {form.is_working ? '✅ Active Employee' : '⏸️ Inactive'}
                  </label>
                </div>
              </div>
            </form>
          ) : (
            <div>
              <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px', fontWeight: 600 }}>
                Upload employee documents (ID copy, certificates, employment contract, etc.)
              </p>
              {emp && <FileUploader linkedType="employee" linkedId={emp.id} />}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'info' && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#fafbfc' }}>
            <button onClick={onClose} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
            <button form="emp-form" type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : emp ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
const ContactsEmployees = () => {
  const [activeTab, setActiveTab] = useState('employees');
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
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const handleDeleteDept = async (id) => {
    if (!window.confirm('Are you sure you want to delete this department?')) return;
    try { await api.delete(`/departments/${id}`); toast.success('Department deleted successfully'); fetchAll(); }
    catch { toast.error('Failed to delete department'); }
  };

  const handleDeleteJt = async (id) => {
    if (!window.confirm('Are you sure you want to delete this job title?')) return;
    try { await api.delete(`/job-titles/${id}`); toast.success('Job title deleted successfully'); fetchAll(); }
    catch { toast.error('Failed to delete job title'); }
  };

  const handleDeleteEmp = async (id) => {
    toast.error('Employees cannot be deleted directly from here — please manage via system settings');
  };

  const TABS = [
    { id: 'departments', label: 'Departments', icon: <Building size={15} /> },
    { id: 'jobtitles', label: 'Job Titles', icon: <Briefcase size={15} /> },
    { id: 'employees', label: 'Employees', icon: <Users2 size={15} /> },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>Employees</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '14px', fontWeight: 600 }}>
            {users.length} Employees · {departments.length} Departments · {jobTitles.length} Job Titles
          </p>
        </div>
        <div>
          {activeTab === 'departments' && (
            <button onClick={() => setDeptModal('add')} style={{ background: 'linear-gradient(135deg, #0f172a, #334155)', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 20px', cursor: 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Plus size={16} /> Add Department
            </button>
          )}
          {activeTab === 'jobtitles' && (
            <button onClick={() => setJtModal('add')} style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 20px', cursor: 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Plus size={16} /> Add Job Title
            </button>
          )}
          {activeTab === 'employees' && (
            <button onClick={() => setEmpModal('add')} style={{ background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 20px', cursor: 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Plus size={16} /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', borderRadius: '14px', padding: '5px', marginBottom: '24px', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '9px 20px', border: 'none', borderRadius: '10px',
            background: activeTab === t.id ? 'white' : 'transparent',
            color: activeTab === t.id ? '#1e293b' : '#64748b',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            boxShadow: activeTab === t.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
      ) : (
        <>
          {/* ── Departments Tab ── */}
          {activeTab === 'departments' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {departments.length === 0 ? (
                <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <Building size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontWeight: 700, margin: 0 }}>No departments yet</p>
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
                      <button onClick={() => setDeptModal(d)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>Edit</button>
                      <button onClick={() => handleDeleteDept(d.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>Delete</button>
                    </div>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>{d.name}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                    Manager: <span style={{ color: '#4f46e5' }}>{d.manager_name || 'Unassigned'}</span>
                  </p>
                  <div style={{ marginTop: '12px', padding: '8px', background: '#f8fafc', borderRadius: '8px', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                    {users.filter(u => u.department_id === d.id).length} employees
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
                  <p style={{ fontWeight: 700, margin: 0 }}>No job titles yet</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Job Title</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Employee Count</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
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
                        <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '13px' }}>
                          {users.filter(u => u.job_title_id === jt.id).length} employees
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => setJtModal(jt)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>Edit</button>
                            <button onClick={() => handleDeleteJt(jt.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>Delete</button>
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
                <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." style={{ ...inputStyle, paddingRight: '38px' }} />
              </div>
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
                {filteredUsers.length === 0 ? (
                  <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <Users2 size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                    <p style={{ fontWeight: 700, margin: 0 }}>No employees found</p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {['Employee', 'Job Title', 'Department', 'National ID', 'Hire Date', 'Status', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
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
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>{u.national_id || '—'}</td>
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>{fmtDate(u.hire_date)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {u.is_working !== false ? (
                              <span style={{ background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>✅ Active</span>
                            ) : (
                              <span style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>⏸️ Inactive</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <button onClick={() => setEmpModal(u)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>Edit</button>
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
