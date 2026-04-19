import React, { useState, useEffect } from 'react';
import { Calendar, Check, X, AlertOctagon } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const ApprovalCenter = () => {
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAllLeaves = async () => {
        try {
            const res = await api.get('/hr/leaves');
            setLeaves(res.data?.data || []);
        } catch (err) {
            toast.error('Failed to load leave requests.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllLeaves();
    }, []);

    const handleAction = async (id, status) => {
        if (!window.confirm(`Are you sure you want to mark this request as ${status.toUpperCase()}?`)) return;
        
        try {
            await api.put(`/hr/leaves/${id}/status`, { status });
            toast.success(`Request ${status} successfully.`);
            fetchAllLeaves(); // Refresh the list
        } catch (err) {
            toast.error(err.response?.data?.message || `Failed to ${status} request.`);
        }
    };

    return (
        <div className="approval-center-page">
            <style>{`
                .approval-header { margin-bottom: 24px; }
                .approval-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .approval-table th, .approval-table td { padding: 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
                .approval-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
                .approval-table tr:hover { background: rgba(255,255,255,0.02); }
                
                .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; text-transform: capitalize;}
                .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                .badge-pending { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

                .action-btn { background: transparent; border: 1px solid var(--glass-border); padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; transition: 0.2s; }
                .btn-approve { background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.2); }
                .btn-approve:hover { background: rgba(16, 185, 129, 0.2); }
                .btn-reject { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
                .btn-reject:hover { background: rgba(239, 68, 68, 0.2); }
            `}</style>
            
            <div className="approval-header">
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>Approval Center</h2>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Manage branch-wide leave and operational requests.</p>
            </div>

            <table className="approval-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Type</th>
                        <th>Duration</th>
                        <th>Requested Days</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px' }}>Loading Request Matrix...</td></tr>
                    ) : leaves.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No requests found in this branch.</td></tr>
                    ) : leaves.map(leave => (
                        <tr key={leave.id}>
                            <td style={{ fontWeight: 600 }}>
                                {leave.employee_name}
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '2px' }}>Submitted: {new Date(leave.created_at).toLocaleDateString()}</div>
                            </td>
                            <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                {leave.type} Leave
                                {leave.reason && (
                                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic', maxWidth: '200px' }}>
                                        "{leave.reason}"
                                    </div>
                                )}
                            </td>
                            <td style={{ fontWeight: 500 }}>
                                {new Date(leave.start_date).toLocaleDateString()} <span style={{ color: 'var(--text-muted)' }}>→</span> {new Date(leave.end_date).toLocaleDateString()}
                            </td>
                            <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{leave.days} Days</td>
                            <td>
                                {leave.status === 'approved' ? <span className="badge badge-success">Approved</span> : 
                                 leave.status === 'rejected' ? <span className="badge badge-danger">Rejected</span> : 
                                 <span className="badge badge-pending">Pending</span>}
                            </td>
                            <td>
                                {leave.status === 'pending' ? (
                                    <>
                                        <button className="action-btn btn-approve" onClick={() => handleAction(leave.id, 'approved')}>
                                            <Check size={14} /> Approve
                                        </button>
                                        <button className="action-btn btn-reject" onClick={() => handleAction(leave.id, 'rejected')}>
                                            <X size={14} /> Reject
                                        </button>
                                    </>
                                ) : (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <AlertOctagon size={14}/> Resolved
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ApprovalCenter;
