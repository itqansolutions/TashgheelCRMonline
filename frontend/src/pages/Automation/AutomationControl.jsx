import React, { useState, useEffect } from 'react';
import { Zap, BookOpen, ToggleLeft, ToggleRight, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const RULE_LABELS = {
    LOW_STOCK_AUTO_PROCUREMENT:  { label: 'Low Stock → Auto Purchase Request', icon: '📦', desc: 'Creates a draft purchase request when stock drops below threshold. Cooldown: 6h.' },
    LATE_EMPLOYEE_ESCALATION:    { label: 'Late Employee → Escalation', icon: '🕐', desc: 'Notifies manager on any late check-in. Auto-generates HR warning at 3+ late events per month.' },
    DEAL_AUTO_ASSIGNMENT:        { label: 'New Deal → Auto Assignment', icon: '🎯', desc: 'Assigns unassigned deals to the least-loaded employee automatically.' }
};

const STATUS_STYLE = {
    success: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: <CheckCircle size={12}/> },
    failed:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: <XCircle size={12}/> },
    skipped: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: <AlertTriangle size={12}/> }
};

const AutomationControl = () => {
    const [config, setConfig]   = useState([]);
    const [logs, setLogs]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('rules'); // 'rules' | 'logs'
    const [expandedLog, setExpandedLog] = useState(null);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [cfgRes, logRes] = await Promise.all([
                api.get('/workflows/config'),
                api.get('/workflows/logs')
            ]);
            setConfig(cfgRes.data.data || []);
            setLogs(logRes.data.data || []);
        } catch (err) {
            toast.error('Failed to load Workflow Control Panel');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const handleToggle = async (rule_key, current) => {
        try {
            await api.patch(`/workflows/config/${rule_key}/toggle`, { is_enabled: !current });
            toast.success(`Rule ${!current ? 'enabled' : 'disabled'}.`);
            fetchAll();
        } catch {
            toast.error('Toggle failed — Admin access required.');
        }
    };

    const handleCooldown = async (rule_key, current) => {
        const val = window.prompt(`Set cooldown in minutes for "${rule_key}":`, current || 0);
        if (val === null) return;
        const minutes = parseInt(val);
        if (isNaN(minutes) || minutes < 0) return toast.error('Invalid value');
        try {
            await api.patch(`/workflows/config/${rule_key}/cooldown`, { cooldown_minutes: minutes });
            toast.success(`Cooldown updated to ${minutes} min.`);
            fetchAll();
        } catch {
            toast.error('Failed to update cooldown.');
        }
    };

    return (
        <div className="automation-page">
            <style>{`
                .ac-header { margin-bottom: 32px; }
                .ac-tabs { display: flex; gap: 4px; background: rgba(0,0,0,0.04); padding: 4px; border-radius: 10px; width: fit-content; margin-bottom: 28px; }
                .ac-tab { padding: 8px 20px; border-radius: 7px; font-weight: 700; font-size: 13px; border: none; cursor: pointer; background: transparent; color: var(--text-muted); transition: all 0.2s; }
                .ac-tab.active { background: var(--bg-card); color: var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

                .rule-card { background: var(--bg-card); border: 1px solid var(--glass-border); border-radius: 14px; padding: 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 20px; transition: box-shadow 0.2s; }
                .rule-card:hover { box-shadow: 0 4px 20px rgba(79,70,229,0.08); }
                .rule-icon { font-size: 28px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; background: rgba(79,70,229,0.06); border-radius: 12px; flex-shrink: 0; }
                .rule-body { flex: 1; }
                .rule-label { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
                .rule-desc { font-size: 13px; color: var(--text-muted); }
                .rule-meta { font-size: 12px; color: var(--text-muted); margin-top: 6px; display: flex; gap: 16px; }
                .rule-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
                .btn-toggle { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 8px; transition: 0.2s; }
                .btn-toggle:hover { background: rgba(0,0,0,0.05); }
                .btn-cooldown { font-size: 12px; font-weight: 600; color: var(--text-muted); background: rgba(0,0,0,0.04); border: none; border-radius: 6px; padding: 5px 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
                .btn-cooldown:hover { background: rgba(79,70,229,0.08); color: var(--primary); }

                .log-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .log-table th, .log-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
                .log-table th { background: rgba(0,0,0,0.02); font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
                .log-status { padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
                .log-meta { background: rgba(0,0,0,0.03); padding: 12px 16px; font-size: 12px; font-family: monospace; border-radius: 8px; margin: 4px 16px 12px; }
                .row-expandable { cursor: pointer; }
                .row-expandable:hover td { background: rgba(79,70,229,0.02); }
            `}</style>

            <div className="ac-header">
                <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Zap size={28} color="var(--primary)"/> Automation Control
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Manage, toggle, and audit all automated workflows in the system.</p>
            </div>

            <div className="ac-tabs">
                <button className={`ac-tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
                    <Zap size={14} style={{marginRight: 6}}/> Rules ({config.length})
                </button>
                <button className={`ac-tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                    <BookOpen size={14} style={{marginRight: 6}}/> Audit Log ({logs.length})
                </button>
            </div>

            {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading Automation Matrix...</div>
            ) : activeTab === 'rules' ? (
                <div>
                    {config.map(rule => {
                        const meta = RULE_LABELS[rule.rule_key] || { label: rule.rule_key, icon: '⚙️', desc: '' };
                        return (
                            <div key={rule.rule_key} className="rule-card">
                                <div className="rule-icon">{meta.icon}</div>
                                <div className="rule-body">
                                    <div className="rule-label">{meta.label}</div>
                                    <div className="rule-desc">{meta.desc}</div>
                                    <div className="rule-meta">
                                        <span><Clock size={11}/> Cooldown: {rule.cooldown_minutes || 0} min</span>
                                        {rule.last_triggered_at && (
                                            <span>Last fired: {new Date(rule.last_triggered_at).toLocaleString()}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="rule-controls">
                                    <button className="btn-toggle" onClick={() => handleToggle(rule.rule_key, rule.is_enabled)} title={rule.is_enabled ? 'Disable rule' : 'Enable rule'}>
                                        {rule.is_enabled
                                            ? <ToggleRight size={36} color="#10b981"/>
                                            : <ToggleLeft size={36} color="#9ca3af"/>
                                        }
                                    </button>
                                    <button className="btn-cooldown" onClick={() => handleCooldown(rule.rule_key, rule.cooldown_minutes)}>
                                        <Clock size={12}/> Set Cooldown
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <table className="log-table">
                    <thead>
                        <tr>
                            <th>Rule</th>
                            <th>Event</th>
                            <th>Entity</th>
                            <th>Status</th>
                            <th>Time</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No workflow executions logged yet.</td></tr>
                        ) : logs.map(log => {
                            const s = STATUS_STYLE[log.status] || STATUS_STYLE.skipped;
                            const isExpanded = expandedLog === log.id;
                            return (
                                <React.Fragment key={log.id}>
                                    <tr className="row-expandable" onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                                        <td style={{ fontWeight: 700, fontSize: 13 }}>{log.rule_name}</td>
                                        <td><span style={{ fontSize: 12, background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>{log.event_type}</span></td>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.entity_type} #{log.entity_id}</td>
                                        <td><span className="log-status" style={{ background: s.bg, color: s.color }}>{s.icon} {log.status}</span></td>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</td>
                                        <td>{isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 0 }}>
                                                <div className="log-meta">
                                                    {log.error_message && <div style={{ color: '#ef4444', marginBottom: 6 }}>❌ {log.error_message}</div>}
                                                    {log.metadata && <pre style={{ margin: 0 }}>{JSON.stringify(JSON.parse(log.metadata || '{}'), null, 2)}</pre>}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default AutomationControl;
