import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  History, User, Tag, Clock, Info, Shield, Search, Filter, 
  Download, ChevronDown, Eye, AlertCircle, CheckCircle, Activity,
  ArrowRight, X, Terminal, Fingerprint, Globe, Cpu, RefreshCw
} from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';
import toast from 'react-hot-toast';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState([]);
  
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    entity_type: '',
    level: '',
    from: '',
    to: '',
    limit: 50,
    offset: 0
  });

  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchUsers();
  }, [filters.offset, filters.limit]);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data || []);
    } catch (err) { console.error('Filter load failed'); }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, val]) => {
        if (val) queryParams.append(key, val);
      });
      const res = await api.get(`/logs?${queryParams.toString()}`);
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch (err) { toast.error('Signal Error: Logs retrieval failed'); }
    finally { setLoading(false); }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value, offset: 0 }));
  };

  const resetFilters = () => {
    setFilters({ user_id: '', action: '', entity_type: '', level: '', from: '', to: '', limit: 50, offset: 0 });
  };

  const exportToCSV = () => {
    if (logs.length === 0) return toast.error('No data in buffer');
    const headers = ['Timestamp', 'Operator', 'Action', 'Module', 'Severity', 'Details'];
    const rows = logs.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.user_name || 'System',
      log.action,
      log.entity_type,
      log.level,
      JSON.stringify(log.details)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `oracle_audit_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLevelStyle = (level) => {
    const map = {
      INFO:     { color: 'text-indigo-400',  bg: 'bg-indigo-500/10', border: 'border-indigo-500/10' },
      WARNING:  { color: 'text-amber-500',   bg: 'bg-amber-500/10',  border: 'border-amber-500/10' },
      CRITICAL: { color: 'text-rose-500',    bg: 'bg-rose-500/10',   border: 'border-rose-500/10' }
    };
    return map[level] || map.INFO;
  };

  const renderDiffView = (details) => {
    if (!details || (!details.before && !details.after)) {
      return (
        <div className="bg-black/40 border border-white/5 p-6 rounded-2xl font-mono text-[11px] text-indigo-300 leading-relaxed max-h-[400px] overflow-y-auto">
          {JSON.stringify(details, null, 2)}
        </div>
      );
    }
    const before = details.before || {};
    const after = details.after || {};
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
            <div className="col-span-3">Attribute</div>
            <div className="col-span-4">Previous State</div>
            <div className="col-span-1 text-center">∆</div>
            <div className="col-span-4">Next State</div>
        </div>
        <div className="space-y-1">
          {allKeys.map(key => (
            <div key={key} className="grid grid-cols-12 gap-4 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] items-center">
              <div className="col-span-3 font-black text-slate-400 uppercase tracking-tighter truncate">{key.replace(/_/g, ' ')}</div>
              <div className="col-span-4 font-mono text-rose-500/80 line-through truncate">{String(before[key] ?? '-')}</div>
              <div className="col-span-1 flex justify-center text-slate-700"><ArrowRight size={12}/></div>
              <div className="col-span-4 font-mono text-emerald-400 font-bold truncate">{String(after[key] ?? '-')}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
        <div className="p-4 md:p-8 animate-in fade-in duration-500">
            <style>{`
                .platform-table th {
                    padding: 16px 24px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    border-bottom: 1px solid var(--border);
                }
                .platform-table td {
                    padding: 20px 24px;
                    border-bottom: 1px solid var(--border);
                }
                .log-level-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .diff-row {
                    display: grid;
                    grid-template-cols: 140px 1fr 20px 1fr;
                    gap: 16px;
                    padding: 12px 16px;
                    border-radius: 12px;
                    font-size: 12px;
                    background: var(--bg-main);
                    border: 1px solid var(--border);
                    align-items: center;
                }
            `}</style>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div className="section-header">
                    <h2 className="text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Forensic Audit Feed</h2>
                    <p className="text-[var(--text-muted)] mt-1 font-medium">Real-time action monitoring and security trace across all system nodes.</p>
                </div>
                <div className="flex items-center gap-3">
                     <button onClick={fetchLogs} className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-900 border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--primary)] transition-all">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
                     </button>
                     <button onClick={exportToCSV} className="btn-primary-premium flex items-center gap-2">
                        <Download size={18}/> Export Dataset
                     </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="ap-card p-6 flex items-center gap-5 border-[var(--primary)] shadow-lg shadow-indigo-600/5">
                    <div className="w-14 h-14 bg-indigo-600/10 text-indigo-600 rounded-2xl flex items-center justify-center">
                        <Activity size={26}/>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Captured Events</p>
                        <h3 className="text-2xl font-black text-[var(--text-main)]">{total}</h3>
                    </div>
                </div>
                <div className="ap-card p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-600/10 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <Globe size={26}/>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Monitoring Status</p>
                        <h3 className="text-2xl font-black text-[var(--text-main)]">Deep Sync</h3>
                    </div>
                </div>
                <div className="ap-card p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-rose-600/10 text-rose-600 rounded-2xl flex items-center justify-center">
                        <Shield size={26}/>
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Security Health</p>
                        <h3 className="text-2xl font-black text-[var(--text-main)]">Optimized</h3>
                    </div>
                </div>
            </div>

            <div className="ap-card p-8 mb-10 border-indigo-100 dark:border-indigo-900/20">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
                    <div className="space-y-2 lg:col-span-1">
                        <label className="ap-label">Operator Node</label>
                        <select name="user_id" value={filters.user_id} className="ap-input" onChange={handleFilterChange}>
                            <option value="">All Intelligence Units</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2 lg:col-span-1">
                        <label className="ap-label">Action Signature</label>
                        <select name="action" value={filters.action} className="ap-input" onChange={handleFilterChange}>
                            <option value="">All Signatures</option>
                            <option value="CREATE">CREATE</option>
                            <option value="UPDATE">UPDATE</option>
                            <option value="DELETE">DELETE</option>
                            <option value="LOGIN">LOGIN</option>
                        </select>
                    </div>
                    <div className="space-y-2 lg:col-span-1">
                        <label className="ap-label">Severity Level</label>
                        <select name="level" value={filters.level} className="ap-input" onChange={handleFilterChange}>
                            <option value="">All severities</option>
                            <option value="INFO">INFO</option>
                            <option value="WARNING">WARNING</option>
                            <option value="CRITICAL">CRITICAL</option>
                        </select>
                    </div>
                    <div className="flex gap-2 lg:col-span-2">
                         <button onClick={fetchLogs} className="btn-primary-premium flex-1 h-[45px] justify-center">Filter Sequence</button>
                         <button onClick={resetFilters} className="w-[45px] h-[45px] bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all">
                            <X size={20}/>
                         </button>
                    </div>
                </div>
            </div>

            <div className="ap-card overflow-hidden">
                <table className="w-full text-left platform-table">
                    <thead>
                        <tr>
                            <th>Event Horizon</th>
                            <th>Identity Node</th>
                            <th>Operation Delta</th>
                            <th>Security Index</th>
                            <th className="text-right">Analysis</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="py-24 text-center">
                                    <div className="flex flex-col items-center justify-center opacity-50">
                                        <RefreshCw className="animate-spin text-[var(--primary)] mb-4" size={32} />
                                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Decoding Metadata...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : logs.map(log => {
                            const style = getLevelStyle(log.level);
                            return (
                                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group">
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-extrabold text-[var(--text-main)]">{new Date(log.created_at).toLocaleTimeString()}</span>
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{new Date(log.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td>
                                       <div className="flex items-center gap-3">
                                           <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center text-xs font-black border border-indigo-600/10">
                                                {log.user_name?.[0] || 'S'}
                                           </div>
                                           <div className="flex flex-col">
                                               <span className="text-sm font-bold text-[var(--text-main)]">{log.user_name || 'System Context'}</span>
                                               <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider">{log.ip_address || 'Internal'}</span>
                                           </div>
                                       </div>
                                    </td>
                                    <td>
                                       <div className="flex items-center gap-3">
                                           <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-black text-slate-500 uppercase">{log.action}</span>
                                           <span className="text-xs font-bold text-[var(--text-main)] capitalize">{log.entity_type}</span>
                                       </div>
                                    </td>
                                    <td>
                                       <div className={`log-level-badge ${style.bg} ${style.color} ${style.border}`}>
                                           <div className={`w-1.5 h-1.5 rounded-full ${style.color === 'text-rose-500' ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-current'} animate-pulse`}></div>
                                           {log.level}
                                       </div>
                                    </td>
                                    <td className="text-right">
                                       <button 
                                        onClick={() => { setSelectedLog(log); setIsModalOpen(true); }}
                                        className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                                       >
                                           <Eye size={18} />
                                       </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* DEEP SCAN MODAL (CUSTOM STYLING FOR LOGS) */}
            {isModalOpen && selectedLog && (
                <>
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[250] animate-in fade-in" onClick={() => setIsModalOpen(false)} />
                <div className="fixed inset-y-0 right-0 w-full max-w-[800px] bg-white dark:bg-slate-950 shadow-2xl z-[300] p-10 overflow-y-auto animate-in slide-in-from-right duration-500">
                    <div className="flex items-center justify-between mb-12">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
                                <History size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-[var(--text-main)] tracking-tight">Deep Scan: Event_{selectedLog.id}</h3>
                                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Forensic Trace Verification Sequence</p>
                            </div>
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-rose-600">
                            <X size={32} />
                        </button>
                    </div>

                    <div className="space-y-10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="ap-card p-5 bg-slate-50 dark:bg-slate-900/40">
                                <label className="ap-label text-indigo-600">Operator</label>
                                <div className="text-sm font-black text-[var(--text-main)] mt-1">{selectedLog.user_name || 'System'}</div>
                            </div>
                            <div className="ap-card p-5 bg-slate-50 dark:bg-slate-900/40">
                                <label className="ap-label text-indigo-600">IP Node</label>
                                <div className="text-sm font-black text-[var(--text-main)] mt-1">{selectedLog.ip_address || 'Localhost'}</div>
                            </div>
                            <div className="ap-card p-5 bg-slate-50 dark:bg-slate-900/40">
                                <label className="ap-label text-indigo-600">Precision Date</label>
                                <div className="text-sm font-black text-[var(--text-main)] mt-1">{new Date(selectedLog.created_at).toLocaleDateString()}</div>
                            </div>
                            <div className="ap-card p-5 bg-slate-50 dark:bg-slate-900/40">
                                <label className="ap-label text-indigo-600">Severity</label>
                                <div className="text-sm font-black text-rose-500 uppercase mt-1">{selectedLog.level}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-black text-[var(--text-main)] flex items-center gap-3 uppercase tracking-tighter">
                                <Terminal size={18} className="text-indigo-600" /> 
                                Mutation Matrix (Delta)
                            </h4>
                            <div className="space-y-3">
                                {selectedLog.details && (selectedLog.details.before || selectedLog.details.after) ? (
                                    (() => {
                                        const before = selectedLog.details.before || {};
                                        const after = selectedLog.details.after || {};
                                        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
                                        return keys.map(key => (
                                            <div key={key} className="diff-row">
                                                <span className="font-extrabold text-[var(--text-muted)] uppercase text-[10px] truncate">{key.replace(/_/g, ' ')}</span>
                                                <span className="font-mono text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded truncate line-through opacity-70">
                                                    {String(before[key] ?? '-')}
                                                </span>
                                                <ArrowRight size={12} className="text-slate-400" />
                                                <span className="font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded truncate font-bold">
                                                    {String(after[key] ?? '-')}
                                                </span>
                                            </div>
                                        ));
                                    })()
                                ) : (
                                    <pre className="p-6 bg-slate-900 text-indigo-300 rounded-2xl text-[11px] font-mono overflow-auto border border-indigo-900/30">
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>

                        <div className="p-5 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-[var(--border)] flex items-center gap-4">
                            <Globe size={18} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-500 font-mono break-all">{selectedLog.user_agent}</span>
                        </div>

                         <button 
                            onClick={() => setIsModalOpen(false)} 
                            className="btn-primary-premium w-full justify-center py-4"
                         >
                            Acknowledge Forensic Report
                        </button>
                    </div>
                </div>
                </>
            )}
        </div>
    );
};

export default Logs;
