import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, History, Coffee } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const Attendance = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSession, setActiveSession] = useState(null);

  const fetchAttendance = async () => {
    try {
      const res = await api.get('/hr/attendance/my');
      const data = res.data.data || [];
      setLogs(data);

      // Determine active session: check_in exists today but NO check_out
      const today = new Date().toISOString().split('T')[0];
      const sessionToday = (data || []).find(log => log.check_in && log.check_in.startsWith(today));
      
      if (sessionToday) {
        if (!sessionToday.check_out) {
            setActiveSession('checked_in');
        } else {
            setActiveSession('completed');
        }
      } else {
        setActiveSession('none');
      }

    } catch (err) {
      console.error('Failed to fetch attendance logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const handleCheckIn = async () => {
    setIsProcessing(true);
    try {
      const res = await api.post('/hr/attendance/check-in');
      toast.success(res.data.message || 'Checked in successfully!');
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to check in');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    setIsProcessing(true);
    try {
      const res = await api.post('/hr/attendance/check-out');
      toast.success(res.data.message || 'Checked out successfully!');
      fetchAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to check out');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="attendance-dashboard">
      <style>{`
        .att-header { margin-bottom: 24px; }
        .clock-pad { background: var(--bg-card); border-radius: 16px; padding: 40px; text-align: center; border: 1px solid var(--glass-border); box-shadow: var(--shadow-xl); margin-bottom: 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px; }
        
        .btn-clock { width: 180px; height: 180px; border-radius: 50%; border: none; font-size: 20px; font-weight: 800; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); color: white; }
        .btn-clock:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
        .btn-clock:hover:not(:disabled) { transform: scale(1.05) translateY(-5px); }
        
        .btn-checkin { background: linear-gradient(135deg, #10b981, #059669); }
        .btn-checkout { background: linear-gradient(135deg, #ef4444, #b91c1c); }
        .btn-completed { background: linear-gradient(135deg, #6b7280, #4b5563); cursor: default; }
        
        .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; margin-top: 24px; }
        .status-late { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .status-present { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .log-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
        .log-table th, .log-table td { padding: 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
        .log-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
        .log-table tr:hover { background: rgba(255,255,255,0.02); }
      `}</style>
      
      <div className="att-header">
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>Self-Service Attendance</h2>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Daily punch clock and timesheet history.</p>
      </div>

      {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading Terminal...</div>
      ) : (
          <>
            <div className="clock-pad">
                {activeSession === 'none' && (
                    <button className="btn-clock btn-checkin" onClick={handleCheckIn} disabled={isProcessing}>
                        <Clock size={40} />
                        CHECK IN
                    </button>
                )}
                
                {activeSession === 'checked_in' && (
                    <button className="btn-clock btn-checkout" onClick={handleCheckOut} disabled={isProcessing}>
                        <Clock size={40} />
                        CHECK OUT
                    </button>
                )}

                {activeSession === 'completed' && (
                    <div className="btn-clock btn-completed">
                        <CheckCircle size={40} />
                        COMPLETED
                        <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 500 }}>Shift Ended</span>
                    </div>
                )}
                
                {/* Live Status Indicator */}
                <div style={{ marginTop: '24px' }}>
                    {activeSession === 'none' && <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}><XCircle size={16}/> Not Checked In</span>}
                    {activeSession === 'checked_in' && <span className="status-badge status-present"><CheckCircle size={16}/> Checked In (Active Session)</span>}
                    {activeSession === 'completed' && <span className="status-badge" style={{ background: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' }}><Coffee size={16}/> Shift Completed</span>}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <History size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '18px' }}>My Timesheet</h3>
            </div>

            <table className="log-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Duration (Hrs)</th>
                        <th>Status</th>
                        <th>Source</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No attendance history found.</td></tr>
                    ) : logs.map((log) => (
                        <tr key={log.id}>
                            <td style={{ fontWeight: 600 }}>{new Date(log.check_in).toLocaleDateString()}</td>
                            <td>{new Date(log.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                            <td>{log.check_out ? new Date(log.check_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <span style={{ color: '#ef4444' }}>--:--</span>}</td>
                            <td style={{ fontWeight: 700 }}>{log.work_hours ? parseFloat(log.work_hours).toFixed(2) : '-'}</td>
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
                                    {log.status} {log.late_minutes > 0 ? `(+${log.late_minutes}m)` : ''}
                                </span>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{log.source.toUpperCase()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </>
      )}
    </div>
  );
};

export default Attendance;
