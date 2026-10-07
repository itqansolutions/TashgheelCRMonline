import React, { useState, useEffect } from 'react';
import { DollarSign, Lock, Eye, Calendar, Wallet, AlertCircle, FileText } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Modal from '../../components/Common/Modal';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MyPayroll = () => {
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const fetchMyPayrolls = async () => {
    try {
      setLoading(true);
      const res = await api.get('/hr/payroll/my');
      setPayrolls(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load your payroll slips.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyPayrolls();
  }, []);

  const openDetails = (p) => {
    setSelectedPayroll(p);
    setIsDetailsOpen(true);
  };

  return (
    <div className="my-payroll-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        .mp-header { margin-bottom: 24px; }
        .mp-table { width: 100%; border-collapse: collapse; background: var(--bg-card, white); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border, #e2e8f0); }
        .mp-table th, .mp-table td { padding: 16px; text-align: left; border-bottom: 1px solid var(--glass-border, #e2e8f0); }
        .mp-table th { background: rgba(0,0,0,0.02); font-weight: 700; color: var(--text-muted, #64748b); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
        .mp-table tr:hover { background: rgba(0,0,0,0.01); }
        
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; text-transform: capitalize; }
        .badge-warning { background: rgba(245, 158, 11, 0.12); color: #d97706; }
        .badge-success { background: rgba(16, 185, 129, 0.12); color: #059669; }

        .btn-view { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 8px; cursor: pointer; color: #1e293b; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .btn-view:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }

        .trace-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .trace-row.negative { color: #dc2626; }
        .trace-row.positive { color: #16a34a; }
        .trace-row.grand { border-top: 2px solid #0f172a; font-size: 18px; font-weight: 900; margin-top: 12px; border-bottom: none; }
      `}</style>

      {/* Header */}
      <div className="mp-header">
        <h2 style={{ margin: 0, fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <DollarSign size={26} color="var(--primary, #4f46e5)" />
          My Payroll
        </h2>
        <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: '14px' }}>
          Your personal salary history, monthly compensations, and pay slips.
        </p>
      </div>

      {/* Summary Cards */}
      {payrolls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Latest Net Salary</span>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#4f46e5', marginTop: '6px' }}>
              EGP {fmt(payrolls[0]?.net_salary)}
            </div>
            <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
              Cycle: {payrolls[0]?.payroll_month} / {payrolls[0]?.payroll_year}
            </span>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Base Package</span>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>
              EGP {fmt(payrolls[0]?.base_salary)}
            </div>
            <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
              Registered Base Contract
            </span>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Logged Work Hours</span>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '6px' }}>
              {payrolls[0]?.total_work_hours || 0} hrs
            </div>
            <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
              Calculated from Timesheet
            </span>
          </div>
        </div>
      )}

      {/* Main Ledger Table */}
      <table className="mp-table">
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Base Salary</th>
            <th>Deductions</th>
            <th>Net Package</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>Loading your payroll slips...</td></tr>
          ) : payrolls.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                <Wallet size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ fontWeight: 800, margin: 0, color: '#475569' }}>No payroll data found</p>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>Your salary slips will be displayed here once computed by HR management.</p>
              </td>
            </tr>
          ) : payrolls.map(p => (
            <tr key={p.id}>
              <td style={{ fontWeight: 800, color: '#1e293b' }}>
                {p.payroll_month} / {p.payroll_year}
              </td>
              <td style={{ color: '#64748b', fontWeight: 600 }}>EGP {fmt(p.base_salary)}</td>
              <td style={{ color: '#dc2626', fontWeight: 600 }}>-EGP {fmt(p.deduction_amount)}</td>
              <td style={{ fontWeight: 900, color: '#4f46e5', fontSize: '16px' }}>
                EGP {fmt(p.net_salary)}
              </td>
              <td>
                {p.status === 'finalized' ? (
                  <span className="badge badge-success"><Lock size={12} /> Finalized</span>
                ) : (
                  <span className="badge badge-warning">Draft</span>
                )}
              </td>
              <td>
                <button className="btn-view" onClick={() => openDetails(p)}>
                  <Eye size={13} /> View Breakdown
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Breakdown Modal */}
      {isDetailsOpen && selectedPayroll && (
        <Modal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          title={`Pay Slip: ${selectedPayroll.payroll_month}/${selectedPayroll.payroll_year}`}
          footer={
            <button
              style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => setIsDetailsOpen(false)}
            >
              Close
            </button>
          }
        >
          <div style={{ color: '#1e293b' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Salary Period</div>
              <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px' }}>
                {new Date(selectedPayroll.payroll_year, selectedPayroll.payroll_month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                Timesheet Working Hours: <strong style={{ color: '#0f172a' }}>{selectedPayroll.total_work_hours} Hours</strong>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="trace-row">
                <span style={{ fontWeight: 700 }}>Base Salary</span>
                <span style={{ fontWeight: 700 }}>EGP {fmt(selectedPayroll.base_salary)}</span>
              </div>

              {selectedPayroll.details && selectedPayroll.details[0] !== null && selectedPayroll.details.map(item => (
                <div key={item.id} className={`trace-row ${item.amount < 0 ? 'negative' : 'positive'}`}>
                  <span style={{ fontSize: '13px' }}>
                    {item.description} <span style={{ opacity: 0.6 }}>({item.type.replace('_', ' ')})</span>
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {item.amount > 0 ? '+' : ''}EGP {fmt(item.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="trace-row grand">
              <span>NET SALARY</span>
              <span style={{ color: '#4f46e5' }}>EGP {fmt(selectedPayroll.net_salary)}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MyPayroll;
