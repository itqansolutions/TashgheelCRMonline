import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Edit3, ToggleRight, ToggleLeft, ChevronRight, Zap, Check, X, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

// ── Static metadata for the UI ────────────────────────────────
const TRIGGERS = [
    { value: 'LOW_STOCK',     label: '📦 Product Stock Low',     fields: ['stock', 'product_id'] },
    { value: 'EMPLOYEE_LATE', label: '🕐 Employee Checked In Late', fields: ['late_minutes', 'user_id'] },
    { value: 'DEAL_CREATED',  label: '🎯 New Deal Created',        fields: ['value', 'pipeline_stage'] },
    { value: 'INVOICE_PAID',  label: '💰 Invoice Fully Paid',      fields: ['amount'] },
];

const CONDITION_FIELDS = {
    LOW_STOCK:     [{ value: 'stock', label: 'Stock Quantity' }],
    EMPLOYEE_LATE: [{ value: 'late_minutes', label: 'Late Minutes' }, { value: 'late_count', label: 'Monthly Late Count' }],
    DEAL_CREATED:  [{ value: 'value', label: 'Deal Value' }],
    INVOICE_PAID:  [{ value: 'amount', label: 'Amount' }],
};

const OPERATORS = [
    { value: 'lt',  label: 'is less than' },
    { value: 'lte', label: 'is less than or equal to' },
    { value: 'gt',  label: 'is greater than' },
    { value: 'gte', label: 'is greater than or equal to' },
    { value: 'eq',  label: 'equals' },
    { value: 'neq', label: 'does not equal' },
];

const ACTIONS = [
    { value: 'notify_manager',          label: '🔔 Notify Manager' },
    { value: 'create_purchase_request', label: '📋 Create Purchase Request' },
    { value: 'assign_lead',             label: '🎯 Auto-Assign Deal' },
    { value: 'notify_user',             label: '📩 Notify Specific User' },
];

const emptyRule = () => ({
    name: '',
    trigger_event: 'LOW_STOCK',
    conditions: [{ field: 'stock', operator: 'lt', value: '10' }],
    actions: [{ type: 'notify_manager' }],
    cooldown_minutes: 0,
});

// ── Helpers ────────────────────────────────────────────────────
const buildConditionsObj = (condArr) => {
    const obj = {};
    condArr.forEach(c => {
        if (c.field && c.operator && c.value !== '') {
            obj[c.field] = { [c.operator]: isNaN(Number(c.value)) ? c.value : Number(c.value) };
        }
    });
    return obj;
};

const buildPreview = (trigger, conditions, actions) => {
    const trig = TRIGGERS.find(t => t.value === trigger);
    const condText = conditions.map(c => {
        const op = OPERATORS.find(o => o.value === c.operator)?.label || c.operator;
        return `${c.field} ${op} ${c.value}`;
    }).join(' AND ');
    const actText = actions.map(a => ACTIONS.find(x => x.value === a.type)?.label || a.type).join(', ');
    return `When "${trig?.label || trigger}"${condText ? ` and ${condText}` : ''} → ${actText || 'no actions'}`;
};

// ── Main Component ─────────────────────────────────────────────
const RuleBuilder = () => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(emptyRule());
    const [editingId, setEditingId] = useState(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [simResult, setSimResult] = useState(null);
    const [simPayload, setSimPayload] = useState('{ "stock": 5 }');
    const [simRuleId, setSimRuleId] = useState(null);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await api.get('/rules');
            setRules(res.data.data || []);
        } catch { toast.error('Failed to load rules'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchRules(); }, []);

    const handleSave = async () => {
        if (!form.name.trim()) return toast.error('Rule name is required');
        if (form.actions.length === 0) return toast.error('At least one action is required');

        const payload = {
            name: form.name,
            trigger_event: form.trigger_event,
            conditions: buildConditionsObj(form.conditions),
            actions: form.actions,
            cooldown_minutes: form.cooldown_minutes
        };

        try {
            if (editingId) {
                await api.put(`/rules/${editingId}`, payload);
                toast.success('Rule updated!');
            } else {
                await api.post('/rules', payload);
                toast.success('Rule created!');
            }
            setShowBuilder(false);
            setEditingId(null);
            setForm(emptyRule());
            fetchRules();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save rule');
        }
    };

    const handleEdit = (rule) => {
        // Reconstruct form conditions array from object
        const condArr = Object.entries(rule.conditions || {}).map(([field, ops]) => {
            const [operator, value] = Object.entries(ops)[0];
            return { field, operator, value: String(value) };
        });
        setForm({
            name: rule.name,
            trigger_event: rule.trigger_event,
            conditions: condArr.length ? condArr : [{ field: 'stock', operator: 'lt', value: '10' }],
            actions: rule.actions || [{ type: 'notify_manager' }],
            cooldown_minutes: rule.cooldown_minutes || 0,
        });
        setEditingId(rule.id);
        setShowBuilder(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this rule permanently?')) return;
        try {
            await api.delete(`/rules/${id}`);
            toast.success('Rule deleted');
            fetchRules();
        } catch { toast.error('Failed to delete'); }
    };

    const handleToggle = async (rule) => {
        try {
            await api.put(`/rules/${rule.id}`, { is_active: !rule.is_active });
            fetchRules();
        } catch { toast.error('Toggle failed'); }
    };

    const handleSimulate = async (ruleId) => {
        try {
            let parsed;
            try { parsed = JSON.parse(simPayload); } catch { return toast.error('Invalid JSON in test payload'); }
            const res = await api.post(`/rules/${ruleId}/simulate`, { test_payload: parsed });
            setSimResult(res.data.simulation);
            setSimRuleId(ruleId);
        } catch { toast.error('Simulation failed'); }
    };

    // ── Condition Builder ──
    const addCondition = () => setForm(f => ({ ...f, conditions: [...f.conditions, { field: 'stock', operator: 'lt', value: '' }] }));
    const removeCondition = (i) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
    const updateCondition = (i, key, val) => setForm(f => {
        const c = [...f.conditions];
        c[i] = { ...c[i], [key]: val };
        return { ...f, conditions: c };
    });
    const addAction = () => setForm(f => ({ ...f, actions: [...f.actions, { type: 'notify_manager' }] }));
    const removeAction = (i) => setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));
    const updateAction = (i, val) => setForm(f => {
        const a = [...f.actions];
        a[i] = { type: val };
        return { ...f, actions: a };
    });

    const condFields = CONDITION_FIELDS[form.trigger_event] || [];

    return (
        <div className="rule-builder-page">
            <style>{`
                .rb-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px; }
                .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(79,70,229,0.3); }

                .builder-card { background: var(--bg-card); border: 1.5px solid var(--primary); border-radius: 16px; padding: 28px; margin-bottom: 28px; }
                .builder-section { margin-bottom: 24px; }
                .builder-section h4 { font-size: 13px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
                .builder-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
                .builder-select, .builder-input { padding: 9px 12px; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--bg-main); color: var(--text-main); font-size: 14px; font-weight: 500; outline: none; }
                .builder-select:focus, .builder-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
                .btn-icon { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--text-muted); }
                .btn-icon:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
                .btn-add { background: rgba(79,70,229,0.08); color: var(--primary); border: 1px dashed rgba(79,70,229,0.3); padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
                .btn-add:hover { background: rgba(79,70,229,0.15); }

                .preview-box { background: rgba(79,70,229,0.05); border: 1px solid rgba(79,70,229,0.2); border-radius: 10px; padding: 14px; font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 20px; }
                
                .rule-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .rule-table th, .rule-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
                .rule-table th { background: rgba(0,0,0,0.02); font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }

                .sim-panel { background: var(--bg-card); border-radius: 12px; padding: 20px; margin-top: 16px; border: 1px solid var(--glass-border); }
                .sim-result-pass { background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 12px; color: #10b981; font-weight: 700; }
                .sim-result-fail { background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 12px; color: #ef4444; font-weight: 700; }
            `}</style>

            <div className="rb-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Zap size={28} color="var(--primary)"/> Automation Builder
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                        Build IF → THEN automation rules with no code. ({rules.length}/20 rules used)
                    </p>
                </div>
                <button className="btn-primary" onClick={() => { setForm(emptyRule()); setEditingId(null); setShowBuilder(true); }}>
                    <Plus size={16}/> New Rule
                </button>
            </div>

            {/* ── NO-CODE BUILDER ── */}
            {showBuilder && (
                <div className="builder-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0, fontWeight: 900 }}>{editingId ? 'Edit Rule' : 'Build New Rule'}</h3>
                        <button className="btn-icon" onClick={() => setShowBuilder(false)}><X size={20}/></button>
                    </div>

                    {/* Name */}
                    <div className="builder-section">
                        <h4>Rule Name</h4>
                        <input className="builder-input" style={{ width: '100%' }} placeholder="e.g. Auto-Restock Sugar when Low" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>

                    {/* Trigger */}
                    <div className="builder-section">
                        <h4>⚡ WHEN this happens…</h4>
                        <select className="builder-select" value={form.trigger_event} onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value, conditions: [] }))}>
                            {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    {/* Conditions */}
                    <div className="builder-section">
                        <h4>🔍 IF these conditions are met…</h4>
                        {form.conditions.map((c, i) => (
                            <div key={i} className="builder-row">
                                <select className="builder-select" value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)}>
                                    {condFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    {condFields.length === 0 && <option value="">No conditions available</option>}
                                </select>
                                <select className="builder-select" value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)}>
                                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                <input className="builder-input" style={{ width: 100 }} type="text" placeholder="value" value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} />
                                <button className="btn-icon" onClick={() => removeCondition(i)}><Trash2 size={15}/></button>
                            </div>
                        ))}
                        <button className="btn-add" onClick={addCondition}><Plus size={13}/> Add Condition</button>
                    </div>

                    {/* Actions */}
                    <div className="builder-section">
                        <h4>⚙️ THEN do these actions…</h4>
                        {form.actions.map((a, i) => (
                            <div key={i} className="builder-row">
                                <select className="builder-select" value={a.type} onChange={e => updateAction(i, e.target.value)}>
                                    {ACTIONS.map(ac => <option key={ac.value} value={ac.value}>{ac.label}</option>)}
                                </select>
                                <button className="btn-icon" onClick={() => removeAction(i)}><Trash2 size={15}/></button>
                            </div>
                        ))}
                        <button className="btn-add" onClick={addAction}><Plus size={13}/> Add Action</button>
                    </div>

                    {/* Cooldown */}
                    <div className="builder-section">
                        <h4>⏱️ Cooldown</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input className="builder-input" type="number" min="0" style={{ width: 100 }} value={form.cooldown_minutes} onChange={e => setForm(f => ({ ...f, cooldown_minutes: parseInt(e.target.value) || 0 }))} />
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>minutes between re-fires (0 = no cooldown)</span>
                        </div>
                    </div>

                    {/* Live Preview */}
                    <div className="preview-box">
                        <ChevronRight size={14} style={{ marginRight: 6 }}/>
                        {buildPreview(form.trigger_event, form.conditions, form.actions)}
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowBuilder(false)} style={{ background: 'none', border: '1px solid var(--glass-border)', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        <button className="btn-primary" onClick={handleSave}>
                            <Check size={16}/> {editingId ? 'Update Rule' : 'Save Rule'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── RULES TABLE ── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading Rules...</div>
            ) : rules.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 56, color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 12, border: '1px dashed var(--glass-border)' }}>
                    <Zap size={40} style={{ opacity: 0.2, marginBottom: 12 }}/><br/>
                    No automation rules yet. Click "New Rule" to build your first one.
                </div>
            ) : (
                <table className="rule-table">
                    <thead>
                        <tr>
                            <th>Rule</th>
                            <th>Trigger</th>
                            <th>Actions</th>
                            <th>Status</th>
                            <th>Operations</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rules.map(rule => (
                            <React.Fragment key={rule.id}>
                                <tr>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{rule.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>By {rule.created_by_name || 'System'}</div>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: 12, background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
                                            {TRIGGERS.find(t => t.value === rule.trigger_event)?.label || rule.trigger_event}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 13 }}>
                                        {(rule.actions || []).map(a => ACTIONS.find(x => x.value === a.type)?.label || a.type).join(', ')}
                                    </td>
                                    <td>
                                        <button className="btn-icon" style={{ padding: 0 }} onClick={() => handleToggle(rule)} title={rule.is_active ? 'Disable' : 'Enable'}>
                                            {rule.is_active ? <ToggleRight size={28} color="#10b981"/> : <ToggleLeft size={28} color="#9ca3af"/>}
                                        </button>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className="btn-icon" onClick={() => handleEdit(rule)} title="Edit"><Edit3 size={15}/></button>
                                            <button className="btn-icon" onClick={() => setSimRuleId(simRuleId === rule.id ? null : rule.id)} title="Test Rule"><Play size={15} color="var(--primary)"/></button>
                                            <button className="btn-icon" onClick={() => handleDelete(rule.id)} title="Delete"><Trash2 size={15}/></button>
                                        </div>
                                    </td>
                                </tr>

                                {/* ── Simulator Panel ── */}
                                {simRuleId === rule.id && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '0 16px 16px' }}>
                                            <div className="sim-panel">
                                                <div style={{ fontWeight: 800, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><Play size={14} color="var(--primary)"/> Rule Simulator</div>
                                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>Paste a test payload (JSON) to see if this rule would fire:</p>
                                                <textarea
                                                    value={simPayload}
                                                    onChange={e => setSimPayload(e.target.value)}
                                                    rows={3}
                                                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 10, border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--bg-main)', color: 'var(--text-main)', resize: 'vertical' }}
                                                />
                                                <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => handleSimulate(rule.id)}>
                                                    <Play size={14}/> Run Simulation
                                                </button>
                                                {simResult && simRuleId === rule.id && (
                                                    <div style={{ marginTop: 14 }}>
                                                        <div className={simResult.conditions_passed ? 'sim-result-pass' : 'sim-result-fail'}>
                                                            {simResult.conditions_passed ? <Check size={14}/> : <AlertCircle size={14}/>}
                                                            {' '}{simResult.preview}
                                                        </div>
                                                        {simResult.conditions_passed && simResult.actions_that_would_fire.length > 0 && (
                                                            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                                                                Actions that would fire: <strong>{simResult.actions_that_would_fire.map(a => a.type).join(', ')}</strong>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default RuleBuilder;
