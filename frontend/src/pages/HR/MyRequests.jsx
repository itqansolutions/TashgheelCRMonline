import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Modal from '../../components/Common/Modal';
import { useLanguage } from '../../context/LanguageContext';

const MyRequests = () => {
    const { t, isRTL } = useLanguage();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        type: 'annual',
        start_date: '',
        end_date: '',
        reason: ''
    });

    const fetchLeaves = async () => {
        try {
            const res = await api.get('/hr/leaves/my');
            setLeaves(res.data.data);
        } catch (err) {
            toast.error(t('hr.myRequests.fetchError', 'Failed to load leave history.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaves();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (new Date(formData.end_date) < new Date(formData.start_date)) {
            return toast.error(t('hr.myRequests.endDateBeforeStartDate', 'End date must be after start date!'));
        }

        setIsSubmitting(true);
        try {
            await api.post('/hr/leaves', formData);
            toast.success(t('hr.myRequests.submitSuccess', 'Leave request submitted. Awaiting manager approval.'));
            fetchLeaves();
            setIsModalOpen(false);
            setFormData({ type: 'annual', start_date: '', end_date: '', reason: '' });
        } catch (err) {
            toast.error(err.response?.data?.message || t('hr.myRequests.submitFailed', 'Failed to submit leave request.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const StatusBadge = ({ status }) => {
        if (status === 'approved') return <span className="badge badge-success"><CheckCircle size={12}/> {t('hr.myRequests.statuses.approved', 'Approved')}</span>;
        if (status === 'rejected') return <span className="badge badge-danger"><XCircle size={12}/> {t('hr.myRequests.statuses.rejected', 'Rejected')}</span>;
        return <span className="badge badge-pending"><Clock size={12}/> {t('hr.myRequests.statuses.pending', 'Pending')}</span>;
    };

    const getLeaveTypeName = (type) => {
        if (type === 'annual') return t('hr.myRequests.types.annual', 'Annual Leave (Paid)');
        if (type === 'sick') return t('hr.myRequests.types.sick', 'Sick Leave');
        if (type === 'unpaid') return t('hr.myRequests.types.unpaid', 'Unpaid Personal Leave');
        return type;
    };

    return (
        <div className="my-requests-page" dir={isRTL ? 'rtl' : 'ltr'}>
            <style>{`
                .req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; text-align: ${isRTL ? 'right' : 'left'}; }
                .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
                
                .req-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .req-table th, .req-table td { padding: 16px; text-align: ${isRTL ? 'right' : 'left'}; border-bottom: 1px solid var(--glass-border); }
                .req-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
                .req-table tr:hover { background: rgba(255,255,255,0.02); }
                
                .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; text-transform: capitalize;}
                .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                .badge-pending { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

                .form-group { margin-bottom: 16px; text-align: ${isRTL ? 'right' : 'left'}; }
                .form-group label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--text-muted); }
                .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--glass-border); border-radius: 8px; background: transparent; color: var(--text-main); font-size: 14px; outline: none; }
                .form-group input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); }
            `}</style>
            
            <div className="req-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{t('hr.myRequests.title', 'My Leaves & Requests')}</h2>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{t('hr.myRequests.subtitle', 'Submit and track your time-off requests.')}</p>
                </div>
                <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} /> {t('hr.myRequests.requestLeaveBtn', 'Request Leave')}
                </button>
            </div>

            <table className="req-table">
                <thead>
                    <tr>
                        <th>{t('hr.myRequests.colLeaveType', 'Leave Type')}</th>
                        <th>{t('hr.myRequests.colDuration', 'Duration')}</th>
                        <th>{t('hr.myRequests.colRequestedDays', 'Requested Days')}</th>
                        <th>{t('hr.myRequests.colStatus', 'Status')}</th>
                        <th>{t('hr.myRequests.colSubmittedOn', 'Submitted On')}</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>{t('hr.myRequests.loading', 'Loading Request Data...')}</td></tr>
                    ) : leaves.length === 0 ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('hr.myRequests.noRecords', 'No leave history found.')}</td></tr>
                    ) : leaves.map(leave => (
                        <tr key={leave.id}>
                            <td style={{ fontWeight: 600 }}>
                                {getLeaveTypeName(leave.type)}
                                {leave.reason && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500 }}>{leave.reason}</div>}
                            </td>
                            <td style={{ fontWeight: 500 }}>
                                <span className="num-en">{new Date(leave.start_date).toLocaleDateString()}</span> <ArrowRightSpan isRTL={isRTL}/> <span className="num-en">{new Date(leave.end_date).toLocaleDateString()}</span>
                            </td>
                            <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                                <span className="num-en">{leave.days}</span> {t('hr.myRequests.colRequestedDays', 'Days')}
                            </td>
                            <td><StatusBadge status={leave.status} /></td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }} className="num-en">{new Date(leave.created_at).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)}
                title={t('hr.myRequests.modalTitle', 'Submit Leave Application')}
                footer={
                    <>
                        <button style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>{t('hr.myRequests.btnCancel', 'Cancel')}</button>
                        <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? t('hr.myRequests.submitting', 'Submitting...') : t('hr.myRequests.btnSubmit', 'Send Request')}
                        </button>
                    </>
                }
            >
                <form>
                    <div className="form-group">
                        <label>{t('hr.myRequests.fieldLeaveType', 'Leave Type')}</label>
                        <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} style={{color: 'black'}}>
                            <option value="annual">{t('hr.myRequests.types.annual', 'Annual Leave (Paid)')}</option>
                            <option value="sick">{t('hr.myRequests.types.sick', 'Sick Leave')}</option>
                            <option value="unpaid">{t('hr.myRequests.types.unpaid', 'Unpaid Personal Leave')}</option>
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="form-group">
                            <label>{t('hr.myRequests.fieldStartDate', 'Start Date')}</label>
                            <input type="date" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} required className="num-en" />
                        </div>
                        <div className="form-group">
                            <label>{t('hr.myRequests.fieldEndDate', 'End Date')}</label>
                            <input type="date" value={formData.end_date} onChange={(e) => setFormData({...formData, end_date: e.target.value})} required className="num-en" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>{t('hr.myRequests.fieldReason', 'Reason / Comments (Optional)')}</label>
                        <textarea 
                            rows="3" 
                            value={formData.reason} 
                            onChange={(e) => setFormData({...formData, reason: e.target.value})} 
                            placeholder={t('hr.myRequests.placeholderReason', 'Briefly explain the reason for your time-off request...')}
                        />
                    </div>
                    {/* Conflict detection alert UI hint */}
                    <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', fontSize: '12px', color: '#38bdf8', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <Calendar size={16} style={{ flexShrink: 0 }} />
                        <span>{t('hr.myRequests.conflictNotice', 'The system features strict conflict detection. You cannot apply for overlapping dates with an existing pending/approved request.')}</span>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const ArrowRightSpan = ({ isRTL }) => <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>{isRTL ? '←' : '→'}</span>;

export default MyRequests;
