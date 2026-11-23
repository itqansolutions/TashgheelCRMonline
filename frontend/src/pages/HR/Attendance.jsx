import { useBranch } from '../../context/BranchContext';
import React, { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, History, Coffee } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';

const Attendance = () => {
  const { t, isRTL } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [loadError,setLoadError]=useState(false);
  const [timezone,setTimezone]=useState(undefined);
  const busy=useRef(false);
  const mounted=useRef(true);
  const [locationEnforced,setLocationEnforced]=useState(false);

  const fetchAttendance = async () => {
    try {
      const res = await api.get('/hr/attendance/my');
      const data = res.data.data || [];
      setLogs(data);

      if(!res.data.meta?.session_state || !res.data.meta?.timezone) throw Error('Attendance session metadata unavailable');
      setTimezone(res.data.meta.timezone);
      setActiveSession(res.data.meta.session_state);
      const policy=await api.get('/hr/attendance-policy');
      setLocationEnforced(policy.data.data?.enforcement_enabled===true);
      setLoadError(false);
      return true;

    } catch (err) {
      setLoadError(true);setActiveSession(null);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current=true;
    setLoading(true);setActiveSession(null);setLocationEnforced(false);
    fetchAttendance();
    return()=>{mounted.current=false;};
  }, []);

  const getPunchLocation = () => new Promise((resolve,reject) => {
    if(!locationEnforced)return resolve(undefined);
    if(!/Android|iPhone|iPod|IEMobile|Windows Phone/i.test(navigator.userAgent)) return reject(new Error(t('hr.attendance.mobileRequired','Use your mobile phone for manual attendance.')));
    if(!navigator.geolocation) return reject(new Error(t('hr.attendance.locationRequired','Location access is required.')));
    navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp}),()=>reject(new Error(t('hr.attendance.locationRequired','Location access is required.'))),{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });

  const handleCheckIn = async () => {
    if(busy.current)return;busy.current=true;
    setIsProcessing(true);
    try {
      const res = await api.post('/hr/attendance/check-in',{location:await getPunchLocation().then(fix=>{if(!mounted.current)throw Error('Branch changed. Retry attendance in the selected branch.');return fix;})});
      toast.success(res.data.message || t('hr.attendance.toastCheckInSuccess', 'Checked in successfully!'));
      await fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('hr.attendance.toastCheckInError', 'Failed to check in'));
    } finally {
      busy.current=false;setIsProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    if(busy.current)return;busy.current=true;
    setIsProcessing(true);
    try {
      const res = await api.post('/hr/attendance/check-out',{location:await getPunchLocation().then(fix=>{if(!mounted.current)throw Error('Branch changed. Retry attendance in the selected branch.');return fix;})});
      toast.success(res.data.message || t('hr.attendance.toastCheckOutSuccess', 'Checked out successfully!'));
      await fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('hr.attendance.toastCheckOutError', 'Failed to check out'));
    } finally {
      busy.current=false;setIsProcessing(false);
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'present': return t('hr.attendance.statusPresent', 'Present');
      case 'late': return t('hr.attendance.statusLate', 'Late');
      case 'absent': return t('hr.attendance.statusAbsent', 'Absent');
      default: return status;
    }
  };

  return (
    <div className="attendance-dashboard" dir={isRTL ? 'rtl' : 'ltr'}>
      {loadError && <div role="alert">{t('hr.attendance.loadFailed','Attendance could not be loaded. Please retry.')} <button onClick={fetchAttendance}>{t('common.retry','Retry')}</button></div>}
      {activeSession==='conflict' && <div role="alert">{t('hr.attendance.conflict','Attendance records need review. Contact HR.')}</div>}
      <style>{`
        .attendance-dashboard { width:100%; min-width:0; max-width:100%; overflow:hidden; }
        .attendance-dashboard .responsive-table-region { width:100%; max-width:100%; overflow-x:auto; }
        @media(max-width:600px) { .attendance-dashboard .clock-pad {padding:24px 12px;} .attendance-dashboard .btn-clock {width:150px;height:150px;font-size:18px;} .attendance-dashboard .log-table {min-width:650px;} }

        .attendance-dashboard .att-header { margin-bottom: 24px; text-align: ${isRTL ? 'right' : 'left'}; }
        .attendance-dashboard .clock-pad { background: var(--bg-card); border-radius: 16px; padding: 40px; text-align: center; border: 1px solid var(--glass-border); box-shadow: var(--shadow-xl); margin-bottom: 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px; }
        
        .attendance-dashboard .btn-clock { width: 180px; height: 180px; border-radius: 50%; border: none; font-size: 20px; font-weight: 800; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); color: white; }
        .attendance-dashboard .btn-clock:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
        .attendance-dashboard .btn-clock:hover:not(:disabled) { transform: scale(1.05) translateY(-5px); }
        
        .attendance-dashboard .btn-checkin { background: linear-gradient(135deg, #10b981, #059669); }
        .attendance-dashboard .btn-checkout { background: linear-gradient(135deg, #ef4444, #b91c1c); }
        .attendance-dashboard .btn-completed { background: linear-gradient(135deg, #6b7280, #4b5563); cursor: default; }
        
        .attendance-dashboard .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; margin-top: 24px; }
        .attendance-dashboard .status-late { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .attendance-dashboard .status-present { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .attendance-dashboard .log-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
        .attendance-dashboard .log-table th, .attendance-dashboard .log-table td { padding: 16px; text-align: ${isRTL ? 'right' : 'left'}; border-bottom: 1px solid var(--glass-border); }
        .attendance-dashboard .log-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
        .attendance-dashboard .log-table tr:hover { background: rgba(255,255,255,0.02); }
      `}</style>
      
      <div className="att-header">
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{t('hr.attendance.title', 'Self-Service Attendance')}</h2>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{t('hr.attendance.subtitle', 'Daily punch clock and timesheet history.')}</p>
      </div>

      {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>{t('hr.attendance.loading', 'Loading Terminal...')}</div>
      ) : (
          <>
            {!loadError && <div className="clock-pad">
                {activeSession === 'none' && (
                    <button className="btn-clock btn-checkin" onClick={handleCheckIn} disabled={isProcessing}>
                        <Clock size={40} />
                        {t('hr.attendance.btnCheckIn', 'CHECK IN')}
                    </button>
                )}
                
                {activeSession === 'checked_in' && (
                    <button className="btn-clock btn-checkout" onClick={handleCheckOut} disabled={isProcessing}>
                        <Clock size={40} />
                        {t('hr.attendance.btnCheckOut', 'CHECK OUT')}
                    </button>
                )}

                {activeSession === 'completed' && (
                    <div className="btn-clock btn-completed">
                        <CheckCircle size={40} />
                        {t('hr.attendance.btnCompleted', 'COMPLETED')}
                        <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 500 }}>{t('hr.attendance.shiftEnded', 'Shift Ended')}</span>
                    </div>
                )}
                
                {/* Live Status Indicator */}
                <div style={{ marginTop: '24px' }}>
                    {activeSession === 'none' && <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}><XCircle size={16}/> {t('hr.attendance.notCheckedIn', 'Not Checked In')}</span>}
                    {activeSession === 'checked_in' && <span className="status-badge status-present"><CheckCircle size={16}/> {t('hr.attendance.checkedInActive', 'Checked In (Active Session)')}</span>}
                    {activeSession === 'completed' && <span className="status-badge" style={{ background: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' }}><Coffee size={16}/> {t('hr.attendance.shiftCompleted', 'Shift Completed')}</span>}
                </div>
            </div>}

            {!loadError && <><div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <History size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '18px' }}>{t('hr.attendance.timesheetTitle', 'My Timesheet')}</h3>
            </div>

            <div className="responsive-table-region" role="region" tabIndex={0}><table className="log-table">
                <thead>
                    <tr>
                        <th>{t('hr.attendance.colDate', 'Date')}</th>
                        <th>{t('hr.attendance.colCheckIn', 'Check-in')}</th>
                        <th>{t('hr.attendance.colCheckOut', 'Check-out')}</th>
                        <th>{t('hr.attendance.colDuration', 'Duration (Hrs)')}</th>
                        <th>{t('hr.attendance.colStatus', 'Status')}</th>
                        <th>{t('hr.attendance.colSource', 'Source')}</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('hr.attendance.noHistory', 'No attendance history found.')}</td></tr>
                    ) : logs.map((log) => (
                        <tr key={log.id}>
                            <td style={{ fontWeight: 600 }} className="num-en">{new Date(log.check_in).toLocaleDateString(undefined,{timeZone:timezone})}</td>
                            <td className="num-en">{new Date(log.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit',timeZone:timezone})}</td>
                            <td className="num-en">{log.check_out ? new Date(log.check_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit',timeZone:timezone}) : <span style={{ color: '#ef4444' }}>--:--</span>}</td>
                            <td style={{ fontWeight: 700 }} className="num-en">{log.work_hours !== null && log.work_hours !== undefined ? parseFloat(log.work_hours).toFixed(2) : '-'}</td>
                            <td>
                                <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: '20px', 
                                    fontSize: '11px', 
                                    fontWeight: 700, 
                                    textTransform: 'uppercase',
                                    background: log.status === 'present' ? 'rgba(16, 185, 129, 0.1)' : log.status === 'late' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: log.status === 'present' ? '#10b981' : log.status === 'late' ? '#f59e0b' : '#ef4444'
                                }}>
                                    {getStatusLabel(log.status)} {log.late_minutes > 0 ? <span className="num-en">{`(+${log.late_minutes}m)`}</span> : ''}
                                </span>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{log.source ? log.source.toUpperCase() : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table></div></>}
          </>
      )}
    </div>
  );
};

export default function BranchAttendance(){const {currentBranch}=useBranch();return <Attendance key={currentBranch?.id}/>;}
