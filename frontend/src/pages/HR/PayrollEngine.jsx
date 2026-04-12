import React, { useState, useEffect } from 'react';
import { Calculator, Lock, Eye, AlertTriangle, FileText, Search } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Modal from '../../components/Common/Modal';

const PayrollEngine = () => {
    const [payrolls, setPayrolls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Generator State
    const [genData, setGenData] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        user_id: '' // Specific employee for MVP or batch (not implemented)
    });
    const [staff, setStaff] = useState([]); // to populate user_id select

    // Details Modal State
    const [selectedPayroll, setSelectedPayroll] = useState(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const fetchPayrolls = async () => {
        try {
            setLoading(true);
            const res = await api.get('/hr/payroll');
            setPayrolls(res.data.data);
        } catch (err) {
            toast.error('Failed to load Payroll Ledger.');
        } finally {
            setLoading(false);
        }
    };

    const fetchStaff = async () => {
        try {
            // Reusing existing endpoint or a generic users endpoint restricted to branch
            // Since we didn't explicitly implement GET /api/hr/staff in phase 1 (we used Attendance),
            // We will fetch users from /api/users which we assume exists via admin routes, or just type ID for MVP.
            // Let's assume we fetch standard users for now.
            const res = await api.get('/users');
            setStaff(res.data.data || []);
        } catch (err) {
            console.error('Could not load staff list', err);
        }
    };

    useEffect(() => {
        fetchPayrolls();
        fetchStaff();
    }, []);

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!genData.user_id) return toast.error('Check Target Employee');
        
        setIsGenerating(true);
        try {
            await api.post('/hr/payroll/generate', genData);
            toast.success('Payroll Slip Generated Successfully.');
            fetchPayrolls();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to generate payroll.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFinalize = async (id) => {
        if (!window.confirm('WARNING: Finalizing a Payroll securely LOCKS it. It cannot be reversed. Proceed?')) return;
        try {
            await api.put(`/hr/payroll/${id}/finalize`);
            toast.success('Payroll locked and finalized.');
            fetchPayrolls();
            setIsDetailsOpen(false); // Close details if open
        } catch (err) {
            toast.error('Failed to finalize payroll.');
        }
    };

    const openDetails = (payroll) => {
        setSelectedPayroll(payroll);
        setIsDetailsOpen(true);
    };

    // Helper components
    const StatusBadge = ({ status }) => {
        if (status === 'draft') return <span className="badge badge-warning">Draft Mode</span>;
        if (status === 'finalized') return <span className="badge badge-success"><Lock size={12}/> Locked</span>;
        return <span className="badge">{status}</span>;
    };

    return (
        <div className="payroll-engine-page">
            <style>{`
                .pe-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
                .gen-box { background: var(--bg-card); padding: 24px; border-radius: 12px; border: 1px solid var(--primary); box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.1); margin-bottom: 32px; display: flex; gap: 16px; align-items: flex-end;}
                .form-group-p { display: flex; flex-direction: column; gap: 6px; flex: 1; }
                .form-group-p label { font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;}
                .form-group-p select, .form-group-p input { padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--bg-main); color: var(--text-main); outline: none; }
                
                .btn-generate { background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; white-space: nowrap;}
                .btn-generate:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }

                .pr-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .pr-table th, .pr-table td { padding: 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
                .pr-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
                
                .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; text-transform: capitalize;}
                .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }

                .btn-action { background: transparent; border: 1px solid var(--glass-border); padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; }
                .btn-action:hover { background: rgba(0,0,0,0.05); }

                .trace-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; fontSize: 14px;}
                .trace-row.negative { color: #ef4444; }
                .trace-row.positive { color: #10b981; }
                .trace-row.grand { border-top: 2px solid #000; font-size: 20px; font-weight: 900; margin-top: 12px; border-bottom: none; }
            `}</style>
            
            <div className="pe-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '900', letterSpacing: '-0.5px' }}>Payroll Engine</h2>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Generate, Verify, and Lock monthly salaries.</p>
                </div>
            </div>

            <form className="gen-box" onSubmit={handleGenerate}>
                <div className="form-group-p">
                    <label>Employee Target</label>
                    <select value={genData.user_id} onChange={(e) => setGenData({...genData, user_id: e.target.value})} required style={{ color: 'black' }}>
                        <option value="">-- Select Staff --</option>
                        {staff.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                        {staff.length === 0 && <option disabled>Fallback: Type ID instead (API missing)</option>}
                    </select>
                </div>
                {staff.length === 0 && (
                    <div className="form-group-p">
                        <label>Manual Employee ID</label>
                        <input type="number" placeholder="Enter ID" value={genData.user_id} onChange={(e) => setGenData({...genData, user_id: e.target.value})} />
                    </div>
                )}
                <div className="form-group-p">
                    <label>Month</label>
                    <select value={genData.month} onChange={(e) => setGenData({...genData, month: e.target.value})} style={{ color: 'black' }}>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(0, m-1).toLocaleString('default', { month: 'long' })}</option>)}
                    </select>
                </div>
                <div className="form-group-p">
                    <label>Year</label>
                    <input type="number" value={genData.year} onChange={(e) => setGenData({...genData, year: e.target.value})} />
                </div>
                <button type="submit" className="btn-generate" disabled={isGenerating}>
                    <Calculator size={18} /> {isGenerating ? 'Computing...' : 'Generate Payroll'}
                </button>
            </form>

            <table className="pr-table">
                <thead>
                    <tr>
                        <th>Cycle</th>
                        <th>Employee</th>
                        <th>Base Salary</th>
                        <th>Net Package</th>
                        <th>System Status</th>
                        <th>Operations</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px' }}>Loading Financial Ledger...</td></tr>
                    ) : payrolls.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No Payrolls generated yet.</td></tr>
                    ) : payrolls.map(p => (
                        <tr key={p.id}>
                            <td style={{ fontWeight: 800 }}>{p.payroll_month} / {p.payroll_year}</td>
                            <td style={{ fontWeight: 600 }}>{p.employee_name || `User ID ${p.user_id}`}</td>
                            <td style={{ color: '#6b7280' }}>EGP {parseFloat(p.base_salary).toLocaleString()}</td>
                            <td style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '18px' }}>EGP {parseFloat(p.net_salary).toLocaleString()}</td>
                            <td><StatusBadge status={p.status} /></td>
                            <td>
                                <button className="btn-action" onClick={() => openDetails(p)}>
                                    <Eye size={14} /> View Details
                                </button>
                                {p.status === 'draft' && (
                                    <button className="btn-action" onClick={() => handleFinalize(p.id)} style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                                        <Lock size={14} /> Finalize
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Massive Details Visualizer */}
            {isDetailsOpen && selectedPayroll && (
                <Modal 
                    isOpen={isDetailsOpen} 
                    onClose={() => setIsDetailsOpen(false)}
                    title={`Salary Breakdown: ${selectedPayroll.employee_name}`}
                    footer={
                        <>
                           <button style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setIsDetailsOpen(false)}>Close</button>
                           {selectedPayroll.status === 'draft' && (
                               <button className="btn-generate" style={{ background: '#10b981' }} onClick={() => handleFinalize(selectedPayroll.id)}>
                                   <Lock size={16}/> Lock & Finalize
                               </button>
                           )}
                        </>
                    }
                >
                    <div style={{ color: 'black' }}>
                        <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Cycle Overview</div>
                            <div style={{ fontSize: '24px', fontWeight: 900 }}>{selectedPayroll.payroll_month} - {selectedPayroll.payroll_year}</div>
                            <div style={{ fontSize: '14px', color: '#4b5563', marginTop: '4px' }}>Logged Working Hours: <strong style={{color:'#000'}}>{selectedPayroll.total_work_hours} H</strong></div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <div className="trace-row">
                                <span style={{ fontWeight: 600 }}>Base Salary</span>
                                <span>{parseFloat(selectedPayroll.base_salary).toLocaleString()}</span>
                            </div>

                            {/* Dynamically render JSONB details mapping penalties, leaves, bonuses */}
                            {selectedPayroll.details && selectedPayroll.details[0] !== null && selectedPayroll.details.map(item => (
                                <div key={item.id} className={`trace-row ${item.amount < 0 ? 'negative' : 'positive'}`}>
                                    <span style={{ fontSize: '13px' }}>{item.description} <span style={{opacity:0.5}}>({item.type.replace('_', ' ')})</span></span>
                                    <span>{item.amount > 0 ? '+' : ''}{parseFloat(item.amount).toLocaleString()}</span>
                                </div>
                            ))}

                        </div>

                        <div className="trace-row grand">
                            <span>NET PAYOUT</span>
                            <span style={{ color: '#4f46e5' }}>{parseFloat(selectedPayroll.net_salary).toLocaleString()} EGP</span>
                        </div>
                        
                        {selectedPayroll.status === 'draft' && (
                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', padding: '12px', borderRadius: '8px', marginTop: '24px', fontSize: '13px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }}/>
                                <div>This payroll is in <strong>Draft Mode</strong>. Recalculating now will overwrite it. Finalize it to lock it permanently.</div>
                            </div>
                        )}
                    </div>
                </Modal>
            )}

        </div>
    );
};

export default PayrollEngine;
