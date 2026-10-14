import React, { useState, useEffect } from 'react';
import { Users, Filter, Clock, Search, ExternalLink } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import HRSubNav from '../../components/HR/HRSubNav';
import { useLanguage } from '../../context/LanguageContext';

const AttendanceAdmin = () => {
    const { t, isRTL } = useLanguage();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]); // Default to today

    const fetchAdminAttendance = async () => {
        setLoading(true);
        try {
            const res = await api.get('/hr/attendance');
            let data = res.data.data;
            
            // Apply local Date filter
            if (dateFilter) {
                data = (data || []).filter(log => log.check_in && log.check_in.startsWith(dateFilter));
            }
            
            setLogs(data || []);
        } catch (err) {
            console.error(err);
            toast.error(t('hr.attendanceAdmin.fetchError', 'Failed to load HR attendance summary.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAdminAttendance();
    }, [dateFilter]);

    const getStatusLabel = (status) => {
        switch (status) {
            case 'present': return t('hr.attendance.statuses.present', 'Present');
            case 'late': return t('hr.attendance.statuses.late', 'Late');
            case 'absent': return t('hr.attendance.statuses.absent', 'Absent');
            default: return status;
        }
    };

    return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <HRSubNav />
      <div className="attendance-admin-page" style={{ padding: '0 24px 24px' }}>
            <style>{`
                .admin-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; }
                .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
                .hr-kpi { background: var(--bg-card); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border); display: flex; flex-direction: column; text-align: ${isRTL ? 'right' : 'left'}; }
                .kpi-val { font-size: 28px; font-weight: 800; color: var(--text-main); margin-top: 8px;}
                .kpi-label { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;}
                
                .admin-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .admin-table th, .admin-table td { padding: 16px; text-align: ${isRTL ? 'right' : 'left'}; border-bottom: 1px solid var(--glass-border); }
                .admin-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
                .admin-table tr:hover { background: rgba(255,255,255,0.02); }
                
                .date-picker { background: rgba(255,255,255,0.05); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 8px; padding: 10px 16px; font-size: 14px; outline: none; }
                .date-picker::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; }
            `}</style>

            <div className="admin-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{t('hr.attendanceAdmin.title', 'HR Central Terminal')}</h2>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{t('hr.attendanceAdmin.subtitle', 'Daily attendance logs and staff tracking.')}</p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('hr.attendanceAdmin.timeline', 'Timeline')}</label>
                    <input 
                        type="date" 
                        value={dateFilter} 
                        onChange={(e) => setDateFilter(e.target.value)} 
                        className="date-picker num-en"
                    />
                </div>
            </div>

            <div className="kpi-row">
                <div className="hr-kpi">
                    <span className="kpi-label">{t('hr.attendanceAdmin.activeSignInsToday', 'Active Sign-ins Today')}</span>
                    <span className="kpi-val num-en" style={{ color: '#10b981' }}>{(logs || []).filter(l => !l.check_out).length}</span>
                </div>
                <div className="hr-kpi">
                    <span className="kpi-label">{t('hr.attendanceAdmin.completedShifts', 'Completed Shifts')}</span>
                    <span className="kpi-val num-en">{(logs || []).filter(l => l.check_out).length}</span>
                </div>
                <div className="hr-kpi">
                    <span className="kpi-label">{t('hr.attendanceAdmin.lateArrivals', 'Late Arrivals')}</span>
                    <span className="kpi-val num-en" style={{ color: '#f59e0b' }}>{(logs || []).filter(l => l.status === 'late').length}</span>
                </div>
                <div className="hr-kpi">
                    <span className="kpi-label">{t('hr.attendanceAdmin.totalWorkHours', 'Total Work Hours')}</span>
                    <span className="kpi-val num-en" style={{ color: '#4f46e5' }}>
                        {(logs || []).reduce((acc, curr) => acc + (parseFloat(curr.work_hours) || 0), 0).toFixed(1)} {t('hr.attendanceAdmin.hoursSuffix', 'h')}
                    </span>
                </div>
            </div>

            <table className="admin-table">
                <thead>
                    <tr>
                        <th>{t('hr.attendanceAdmin.colEmployee', 'Employee')}</th>
                        <th>{t('hr.attendanceAdmin.colStatus', 'Status')}</th>
                        <th>{t('hr.attendanceAdmin.colCheckIn', 'Check-in')}</th>
                        <th>{t('hr.attendanceAdmin.colCheckOut', 'Check-out')}</th>
                        <th>{t('hr.attendanceAdmin.colHrsLogged', 'Hrs Logged')}</th>
                        <th>{t('hr.attendanceAdmin.colSourceIp', 'Source IP')}</th>
                        <th>{t('hr.attendanceAdmin.colAction', 'Action')}</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>{t('hr.attendanceAdmin.loadingTerminal', 'Loading Terminal Data...')}</td></tr>
                    ) : logs.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('hr.attendanceAdmin.noRecords', 'No records found for this date.')}</td></tr>
                    ) : logs.map(log => (
                        <tr key={log.id}>
                            <td style={{ fontWeight: 600 }}>
                                {log.employee_name}
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }} className="num-en">{log.employee_email}</div>
                            </td>
                            <td>
                                <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: '20px', 
                                    fontSize: '11px', 
                                    fontWeight: 700, 
                                    textTransform: 'uppercase',
                                    background: log.status === 'present' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: log.status === 'present' ? '#10b981' : '#f59e0b'
                                }}>
                                    {getStatusLabel(log.status)} {log.late_minutes > 0 ? <span className="num-en">{`(+${log.late_minutes}m)`}</span> : ''}
                                </span>
                            </td>
                            <td style={{ fontWeight: 500 }} className="num-en">{new Date(log.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                            <td style={{ fontWeight: 500 }} className="num-en">{log.check_out ? new Date(log.check_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <span style={{ color: '#ef4444' }}>{t('hr.attendanceAdmin.sessionActive', 'Session Active')}</span>}</td>
                            <td style={{ fontWeight: 800, color: 'var(--primary)' }} className="num-en">{log.work_hours ? parseFloat(log.work_hours).toFixed(2) : '-'}</td>
                            <td style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }} className="num-en">{log.ip_address}</td>
                            <td>
                                <button style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-main)' }}>
                                    <ExternalLink size={14} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default AttendanceAdmin;
