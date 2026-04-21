import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  History, User, Tag, Clock, Info, Shield, Search, Filter, 
  Download, ChevronDown, Eye, AlertCircle, CheckCircle, Activity,
  ArrowRight, X, Terminal, Fingerprint, Globe, Cpu
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
    <div className="min-h-screen bg-slate-950 p-6 md:p-10 animate-in fade-in duration-500">
      <style>{`
        .hud-card {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 2rem;
        }
        .hud-input {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: white;
            border-radius: 0.75rem;
            padding: 0.6rem 0.8rem;
            outline: none;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .hud-input:focus { border-color: rgba(99, 102, 241, 0.5); }
        .hud-table-row:hover { background: rgba(99, 102, 241, 0.03); }
      `}</style>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/20">
              <Terminal size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Protocol: Forensic_Audit_Oracle</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter">System Intelligence Feed</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1 opacity-70">Real-time action monitoring across all active nodes</p>
        </div>
        <div className="flex gap-4">
             <button onClick={fetchLogs} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all border border-white/5"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
             <button onClick={exportToCSV} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all border border-white/5"><Download size={18}/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="hud-card p-8 flex items-center gap-6">
            <div className="w-14 h-14 bg-indigo-600/10 text-indigo-500 border border-indigo-500/20 rounded-2xl flex items-center justify-center"><Activity size={24}/></div>
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Events</p>
                <h3 className="text-2xl font-black text-white">{total}</h3>
            </div>
        </div>
        <div className="hud-card p-8 flex items-center gap-6">
            <div className="w-14 h-14 bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 rounded-2xl flex items-center justify-center"><Globe size={24}/></div>
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Cycle</p>
                <h3 className="text-2xl font-black text-white">24h Forensic Sync</h3>
            </div>
        </div>
        <div className="hud-card p-8 flex items-center gap-6">
            <div className="w-14 h-14 bg-rose-600/10 text-rose-500 border border-rose-500/20 rounded-2xl flex items-center justify-center"><Cpu size={24}/></div>
            <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Security Health</p>
                <h3 className="text-2xl font-black text-white">Operational</h3>
            </div>
        </div>
      </div>

      <div className="hud-card p-8 mb-10 border-indigo-500/10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Node Operator</label>
            <select name="user_id" value={filters.user_id} className="hud-input w-full" onChange={handleFilterChange}>
              <option value="">All Intelligence Units</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Action Sequence</label>
            <select name="action" value={filters.action} className="hud-input w-full" onChange={handleFilterChange}>
              <option value="">All Operations</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="LOGIN">LOGIN</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Severity Index</label>
            <select name="level" value={filters.level} className="hud-input w-full" onChange={handleFilterChange}>
              <option value="">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="flex gap-2">
             <button onClick={fetchLogs} className="flex-1 h-10 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all">Filter Feed</button>
             <button onClick={resetFilters} className="w-10 h-10 bg-white/5 text-slate-500 rounded-xl flex items-center justify-center border border-white/5 hover:text-white transition-all"><X size={16}/></button>
          </div>
        </div>
      </div>

      <div className="hud-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-black/20 border-b border-white/5">
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Event Timestamp</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Intelligence Unit</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Operation Details</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Index</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Analysis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                    <td colSpan="5" className="py-20 text-center text-slate-600 font-black text-[10px] uppercase tracking-[0.4em]">Interpreting Signal...</td>
                </tr>
              ) : logs.map(log => {
                const style = getLevelStyle(log.level);
                return (
                  <tr key={log.id} className="hud-table-row transition-colors group">
                    <td className="px-8 py-5">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-white tracking-tighter">{new Date(log.created_at).toLocaleTimeString()}</span>
                            <span className="text-[9px] font-black text-slate-700 uppercase">{new Date(log.created_at).toLocaleDateString()}</span>
                        </div>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-[10px] font-black shadow-lg border border-indigo-500/10">
                                {log.user_name?.[0] || 'S'}
                           </div>
                           <div className="flex flex-col">
                               <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{log.user_name || 'System Auto'}</span>
                               <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">{log.ip_address || 'INT_BUS'}</span>
                           </div>
                       </div>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex items-center gap-4">
                           <span className="px-3 py-1 bg-white/5 rounded-lg border border-white/5 text-[9px] font-black text-slate-400 uppercase tracking-widest">{log.action}</span>
                           <span className="text-xs font-bold text-slate-500 tracking-tight">{log.entity_type}</span>
                       </div>
                    </td>
                    <td className="px-8 py-5">
                       <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border ${style.bg} ${style.color} ${style.border}`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${style.color === 'text-rose-500' ? 'bg-rose-500 shadow-[0_0_10px_#ef4444]' : 'bg-current'} animate-pulse`}></div>
                           <span className="text-[9px] font-black uppercase tracking-widest">{log.level}</span>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                       <button 
                        onClick={() => { setSelectedLog(log); setIsModalOpen(true); }}
                        className="p-3 bg-white/5 rounded-xl text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-all opacity-0 group-hover:opacity-100"
                       >
                           <Eye size={16} />
                       </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
            <div className="flex items-center gap-4 text-white">
                <Shield className="text-indigo-500" size={24}/>
                <div className="flex flex-col">
                    <span className="text-xl font-black tracking-tighter uppercase">Deep Scan: Event_{selectedLog?.id}</span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Security Level Verification Sequence</span>
                </div>
            </div>
        }
        width="1000px"
        footer={<button className="px-8 py-3 bg-slate-800 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all" onClick={() => setIsModalOpen(false)}>Terminate Inspection</button>}
      >
        <div className="bg-slate-950 p-8 rounded-[2.5rem] border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-20 opacity-5 pointer-events-none transform rotate-12">
                <Fingerprint size={240} className="text-indigo-500" />
            </div>
            
            {selectedLog && (
                <div className="space-y-12 relative z-10">
                    <div className="grid grid-cols-4 gap-8">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Origin Source</label>
                            <div className="text-lg font-black text-white">{selectedLog.user_name || 'System'}</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">IP Nexus</label>
                            <div className="text-lg font-black text-white">{selectedLog.ip_address || '127.0.0.1'}</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Protocol Date</label>
                            <div className="text-lg font-black text-white">{new Date(selectedLog.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="space-y-1 text-right">
                            <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Auth Level</label>
                            <div className="text-lg font-black text-indigo-500 uppercase">{selectedLog.level}</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <Terminal size={14} /> Intelligence Delta Matrix
                        </h4>
                        {renderDiffView(selectedLog.details)}
                    </div>

                    <div className="p-6 bg-black/40 border border-white/5 rounded-2xl flex items-center gap-4">
                        <Globe size={18} className="text-slate-600" />
                        <span className="text-[10px] font-bold text-slate-500 font-mono tracking-tight">{selectedLog.user_agent}</span>
                    </div>
                </div>
            )}
        </div>
      </Modal>
    </div>
  );
};

export default Logs;
