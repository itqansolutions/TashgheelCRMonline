import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    Filter, Plus, X, Phone, MessageSquare, Users,
    Mail, Bell, Home, FileText, CheckCircle, Edit,
    User, Clock, ChevronDown, ChevronUp, Send,
    Calendar, Check, CheckCheck, AlertCircle, RotateCcw
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// Helper to format date for datetime-local input (YYYY-MM-DDTHH:mm)
const toLocalDatetimeString = (date) => {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getNowPlusHours = (hours) => {
    return new Date(Date.now() + hours * 3600 * 1000);
};

const getTomorrowMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
};

const getInDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    return d;
};


// ── Action type configuration ──────────────────────────────────────────────
const ACTION_TYPES = [
    { value: 'called',      label: '📞 Called',       color: '#7c3aed', bg: '#f5f3ff' },
    { value: 'whatsapp',    label: '💬 WhatsApp',      color: '#059669', bg: '#ecfdf5' },
    { value: 'meeting',     label: '🤝 Meeting',       color: '#2563eb', bg: '#eff6ff' },
    { value: 'email_sent',  label: '📧 Email Sent',    color: '#0891b2', bg: '#ecfeff' },
    { value: 'follow_up',   label: '🔔 Follow-Up',     color: '#d97706', bg: '#fffbeb' },
    { value: 'visited',     label: '🏠 Site Visit',    color: '#dc2626', bg: '#fef2f2' },
    { value: 'task',        label: '📋 Task',          color: '#0284c7', bg: '#f0f9ff' },
    { value: 'note',        label: '📝 Note',          color: '#475569', bg: '#f8fafc' },
];

const ACTION_MAP = Object.fromEntries(ACTION_TYPES.map(a => [a.value, a]));

// Icon per action key for the timeline bullet
const getActionStyle = (action) => {
    return ACTION_MAP[action] || { color: '#64748b', bg: '#f1f5f9' };
};

const getActionIcon = (action) => {
    switch (action) {
        case 'called':      return <Phone     size={14} />;
        case 'whatsapp':    return <MessageSquare size={14} />;
        case 'meeting':     return <Users     size={14} />;
        case 'email_sent':  return <Mail      size={14} />;
        case 'follow_up':   return <Bell      size={14} />;
        case 'visited':     return <Home      size={14} />;
        case 'task':        return <CheckCircle size={14} />;
        case 'note':        return <FileText  size={14} />;
        case 'created':     return <CheckCircle size={14} />;
        case 'updated':
        case 'status_changed':
        case 'stage_changed': return <Edit   size={14} />;
        case 'assigned':    return <User      size={14} />;
        default:            return <Clock     size={14} />;
    }
};

const getBulletColors = (action) => {
    const style = getActionStyle(action);
    // System actions get neutral styling
    const systemActions = ['created', 'updated', 'assigned', 'status_changed', 'stage_changed'];
    if (systemActions.includes(action)) {
        return { color: '#3b82f6', bg: '#eff6ff' };
    }
    return style;
};

// ── ActivityTimeline component ─────────────────────────────────────────────
const ActivityTimeline = ({ entityType, entityId, canLog = true, onActivityCreated }) => {
    const { t, isRTL } = useLanguage();
    const [activities, setActivities]   = useState([]);
    const [loading, setLoading]         = useState(true);
    const [filter, setFilter]           = useState('all');
    const [offset, setOffset]           = useState(0);
    const [hasMore, setHasMore]         = useState(true);

    // Log form state
    const [showForm, setShowForm]       = useState(false);
    const [logAction, setLogAction]     = useState('called');
    const [logNote, setLogNote]         = useState('');
    const [hasSchedule, setHasSchedule] = useState(false);
    const [scheduledAt, setScheduledAt] = useState('');
    const [reminderNote, setReminderNote] = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [submitError, setSubmitError] = useState('');

    // Reminder action state in timeline cards
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [reschedulingId, setReschedulingId]   = useState(null);
    const [rescheduleDate, setRescheduleDate]   = useState('');

    const LIMIT = 20;

    const applyPreset = (presetFn) => {
        setHasSchedule(true);
        const dt = presetFn();
        setScheduledAt(toLocalDatetimeString(dt));
    };

    const handleDismissReminder = async (activityId) => {
        setActionLoadingId(activityId);
        try {
            const res = await api.patch(`/activities/${activityId}/reminder`, { dismiss: true });
            if (res.data.status === 'success') {
                setActivities(prev => prev.map(a => a.id === activityId ? {
                    ...a,
                    is_reminder_dismissed: true
                } : a));
            }
        } catch (err) {
            console.error('Failed to dismiss reminder', err);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleRescheduleReminder = async (activityId) => {
        if (!rescheduleDate) return;
        setActionLoadingId(activityId);
        try {
            const res = await api.patch(`/activities/${activityId}/reminder`, {
                scheduled_at: new Date(rescheduleDate).toISOString()
            });
            if (res.data.status === 'success') {
                setActivities(prev => prev.map(a => a.id === activityId ? {
                    ...a,
                    scheduled_at: res.data.data.scheduled_at,
                    reminder_sent_at: null,
                    is_reminder_dismissed: false
                } : a));
                setReschedulingId(null);
                setRescheduleDate('');
            }
        } catch (err) {
            console.error('Failed to reschedule reminder', err);
        } finally {
            setActionLoadingId(null);
        }
    };

    const getActionTypeLabel = (value) => {
        switch (value) {
            case 'called': return `📞 ${t('customers.actionTypes.called', 'Called')}`;
            case 'whatsapp': return `💬 ${t('customers.actionTypes.whatsapp', 'WhatsApp')}`;
            case 'meeting': return `🤝 ${t('customers.actionTypes.meeting', 'Meeting')}`;
            case 'email_sent': return `📧 ${t('customers.actionTypes.emailSent', 'Email Sent')}`;
            case 'follow_up': return `🔔 ${t('customers.actionTypes.followUp', 'Follow-Up')}`;
            case 'visited': return `🏠 ${t('customers.actionTypes.siteVisit', 'Site Visit')}`;
            case 'task': return `📋 ${t('deals.actionTypes.task', t('common.task', 'Task'))}`;
            case 'note': return `📝 ${t('customers.actionTypes.note', 'Note')}`;
            default: return value;
        }
    };

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchActivities = async (currentOffset = 0, append = false) => {
        try {
            if (!append) setLoading(true);
            const response = await api.get(
                `/activities/${entityType}/${entityId}?limit=${LIMIT}&offset=${currentOffset}`
            );
            if (response.data.status === 'success') {
                const newData = response.data.data;
                if (newData.length < LIMIT) setHasMore(false);
                setActivities(prev => append ? [...prev, ...newData] : newData);
            }
        } catch (err) {
            console.error('Failed to fetch activities', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (entityId) {
            setOffset(0);
            setHasMore(true);
            fetchActivities(0, false);
        }
    }, [entityType, entityId]);

    const handleLoadMore = () => {
        const nextOffset = offset + LIMIT;
        setOffset(nextOffset);
        fetchActivities(nextOffset, true);
    };

    // ── Submit log entry ───────────────────────────────────────────────────
    const handleSubmitLog = async (e) => {
        e.preventDefault();
        setSubmitError('');
        if (!logNote.trim()) {
            setSubmitError(t('customers.pleaseEnterDescription', 'Please enter a description.'));
            return;
        }
        if (hasSchedule && !scheduledAt) {
            setSubmitError(t('customers.scheduleTimeRequired', 'Please specify the scheduled date & time.'));
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                action: logAction,
                note:   logNote.trim()
            };
            if (hasSchedule && scheduledAt) {
                payload.scheduled_at = new Date(scheduledAt).toISOString();
                if (reminderNote.trim()) {
                    payload.reminder_note = reminderNote.trim();
                }
            }
            const res = await api.post(`/activities/${entityType}/${entityId}`, payload);
            if (res.data.status === 'success') {
                // Prepend new entry to top of timeline instantly
                setActivities(prev => [res.data.data, ...prev]);
                setLogNote('');
                setHasSchedule(false);
                setScheduledAt('');
                setReminderNote('');
                setShowForm(false);
                if (typeof onActivityCreated === 'function') {
                    onActivityCreated(res.data.data);
                }
            }
        } catch (err) {
            setSubmitError(err.response?.data?.message || t('customers.failedToSaveLog', 'Failed to save log. Please try again.'));
        } finally {
            setSubmitting(false);
        }
    };

    // ── Filter ─────────────────────────────────────────────────────────────
    const filteredActivities = activities.filter(a => {
        if (filter === 'all')       return true;
        if (filter === 'scheduled') return Boolean(a.scheduled_at && !a.is_reminder_dismissed);
        if (filter === 'manual')    return ['called', 'whatsapp', 'meeting', 'email_sent', 'follow_up', 'visited', 'note', 'task'].includes(a.action);
        if (filter === 'system')    return ['created', 'updated', 'assigned', 'status_changed', 'stage_changed'].includes(a.action);
        return a.action === filter;
    });

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div>
            {/* ── Header row ──────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                {/* Filter */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Filter size={14} color="#64748b" />
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        style={{
                            fontSize: '12px', padding: '5px 10px', borderRadius: '8px',
                            border: '1px solid #e2e8f0', outline: 'none', background: '#fff', cursor: 'pointer'
                        }}
                    >
                        <option value="all">{t('customers.allActivities', 'All Activities')}</option>
                        <option value="scheduled">⏰ {t('customers.scheduledFollowUps', 'Scheduled Follow-ups')}</option>
                        <option value="manual">{t('customers.interactionsOnly', 'Interactions Only')}</option>
                        <option value="system">{t('customers.systemEvents', 'System Events')}</option>
                        <option value="called">📞 {t('customers.calls', 'Calls')}</option>
                        <option value="whatsapp">💬 {t('customers.whatsapp', 'WhatsApp')}</option>
                        <option value="meeting">🤝 {t('customers.meetings', 'Meetings')}</option>
                        <option value="task">📋 {t('deals.tasks', t('common.tasks', 'Tasks'))}</option>
                        <option value="follow_up">🔔 {t('customers.followUps', 'Follow-Ups')}</option>
                        <option value="note">📝 {t('customers.notesFilter', 'Notes')}</option>
                    </select>
                </div>

                {/* Add Log Button (rendered only if authorized) */}
                {canLog && (
                    <button
                        onClick={() => setShowForm(prev => !prev)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '7px 14px', borderRadius: '8px',
                            background: showForm ? '#f1f5f9' : 'var(--primary, #4f46e5)',
                            color: showForm ? '#64748b' : '#fff',
                            border: 'none', fontWeight: '700', fontSize: '12px', cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {showForm ? <><X size={14} /> {t('common.cancel', 'Cancel')}</> : <><Plus size={14} /> {t('customers.logInteraction', 'Log Interaction')}</>}
                    </button>
                )}
            </div>

            {/* ── Log Form ────────────────────────────────────────────────── */}
            {canLog && showForm && (
                <form
                    onSubmit={handleSubmitLog}
                    style={{
                        background: '#f8fafc', border: '1.5px dashed #cbd5e1',
                        borderRadius: '12px', padding: '16px', marginBottom: '20px'
                    }}
                >
                    <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--primary, #4f46e5)', marginBottom: '12px' }}>
                        📋 {entityType === 'deal' ? t('deals.logDealInteraction', 'Log Deal Activity') : t('customers.logCustomerInteraction', 'Log a Customer Interaction')}
                    </div>

                    {/* Action type pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        {ACTION_TYPES.map(at => (
                            <button
                                key={at.value}
                                type="button"
                                onClick={() => setLogAction(at.value)}
                                style={{
                                    padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
                                    fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s',
                                    border: logAction === at.value ? `2px solid ${at.color}` : '2px solid transparent',
                                    background: logAction === at.value ? at.bg : '#e2e8f0',
                                    color: logAction === at.value ? at.color : '#64748b',
                                }}
                            >
                                {getActionTypeLabel(at.value)}
                            </button>
                        ))}
                    </div>

                    {/* Description */}
                    <textarea
                        rows={3}
                        placeholder={entityType === 'deal'
                            ? t('deals.describeDealInteraction', 'Describe the interaction… e.g. Phone call with client, discussed pricing and terms')
                            : t('customers.describeInteraction', 'Describe the interaction… e.g. Customer answered, interested in 3BR unit')}
                        value={logNote}
                        onChange={e => setLogNote(e.target.value)}
                        required
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: '8px',
                            border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none',
                            resize: 'vertical', background: '#fff', boxSizing: 'border-box',
                            fontFamily: 'inherit', lineHeight: '1.5'
                        }}
                    />

                    {/* Schedule Follow-up / Reminder Section */}
                    <div style={{
                        marginTop: '12px',
                        background: '#fff',
                        border: hasSchedule ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        transition: 'all 0.2s'
                    }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={hasSchedule}
                                    onChange={e => {
                                        const checked = e.target.checked;
                                        setHasSchedule(checked);
                                        if (checked && !scheduledAt) {
                                            setScheduledAt(toLocalDatetimeString(getNowPlusHours(2)));
                                        }
                                    }}
                                    style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }}
                                />
                                <div>
                                    <span style={{ fontWeight: '800', fontSize: '13px', color: '#1e293b' }}>
                                        ⏰ {t('customers.scheduleFollowUp', 'Schedule Follow-up / Reminder')}
                                    </span>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                        {t('customers.scheduleFollowUpDesc', 'Set a reminder to call back or follow up with an automatic in-app notification when due')}
                                    </div>
                                </div>
                            </div>
                            <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                color: hasSchedule ? '#4f46e5' : '#94a3b8',
                                background: hasSchedule ? '#eef2ff' : '#f1f5f9',
                                padding: '3px 8px',
                                borderRadius: '6px'
                            }}>
                                {hasSchedule ? (isRTL ? 'مفعل' : 'Active') : (isRTL ? 'اختياري' : 'Optional')}
                            </span>
                        </label>

                        {hasSchedule && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                                {/* Quick Presets */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                                        {isRTL ? 'خيارات سريعة:' : 'Quick Presets:'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(() => getNowPlusHours(2))}
                                        style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '15px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        +2 {t('customers.preset2Hours', 'In 2 hours')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(() => getNowPlusHours(4))}
                                        style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '15px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        +4 {t('customers.preset4Hours', 'In 4 hours')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(getTomorrowMorning)}
                                        style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '15px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        🌅 {t('customers.presetTomorrow', 'Tomorrow')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(() => getInDays(2))}
                                        style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '15px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        📅 {t('customers.preset2Days', 'In 2 days')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset(() => getInDays(7))}
                                        style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '15px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        📆 {t('customers.presetWeek', 'In 1 week')}
                                    </button>
                                </div>

                                {/* Date time picker + reminder note */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                            📅 {t('customers.scheduleTime', 'Follow-up Date & Time')} *
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={scheduledAt}
                                            onChange={e => setScheduledAt(e.target.value)}
                                            min={toLocalDatetimeString(new Date())}
                                            required={hasSchedule}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '12px',
                                                outline: 'none',
                                                background: '#f8fafc',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                                            📝 {isRTL ? 'ملاحظة التذكير (اختياري)' : 'Reminder Note (Optional)'}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={t('customers.reminderNotePlaceholder', 'e.g., Call client back regarding price proposal...')}
                                            value={reminderNote}
                                            onChange={e => setReminderNote(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '12px',
                                                outline: 'none',
                                                background: '#f8fafc',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {submitError && (
                        <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px', fontWeight: '600' }}>
                            ⚠ {submitError}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 18px', borderRadius: '8px',
                                background: submitting ? '#94a3b8' : 'var(--primary, #4f46e5)',
                                color: '#fff', border: 'none', fontWeight: '700',
                                fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <Send size={14} />
                            {submitting ? t('customers.saving', 'Saving…') : t('customers.saveLog', 'Save Log')}
                        </button>
                    </div>
                </form>
            )}

            {/* ── Timeline ────────────────────────────────────────────────── */}
            {loading && activities.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', padding: '12px 0' }}>
                    {t('customers.loadingTimeline', 'Loading timeline…')}
                </div>
            ) : filteredActivities.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '32px 16px',
                    background: '#f8fafc', borderRadius: '12px',
                    border: '1px dashed #e2e8f0', color: '#94a3b8', fontSize: '13px'
                }}>
                    {t('customers.noActivitiesMatch', 'No activities match your filter.')}<br />
                    <span style={{ fontSize: '11px' }}>{t('customers.useLogToStart', 'Use "Log Interaction" above to add the first one.')}</span>
                </div>
            ) : (
                <div style={{ position: 'relative', paddingInlineStart: '28px' }}>
                    {/* Vertical line */}
                    <div style={{
                        position: 'absolute', insetInlineStart: '11px', top: '8px',
                        bottom: '8px', width: '2px', background: '#e2e8f0'
                    }} />

                    {filteredActivities.map((activity, idx) => {
                        const { color, bg } = getBulletColors(activity.action);
                        const isLast = idx === filteredActivities.length - 1;

                        return (
                            <div
                                key={activity.id}
                                style={{ position: 'relative', paddingBottom: isLast ? 0 : '20px' }}
                            >
                                {/* Bullet */}
                                <div style={{
                                    position: 'absolute', insetInlineStart: '-28px', top: '2px',
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    background: bg, color, border: `2px solid ${color}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 0 0 3px #fff'
                                }}>
                                    {getActionIcon(activity.action)}
                                </div>

                                {/* Card */}
                                <div style={{
                                    background: '#fff', border: '1px solid #e2e8f0',
                                    borderRadius: '10px', padding: '12px 14px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    transition: 'box-shadow 0.15s'
                                }}>
                                    {/* Top row: user + time */}
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: '6px'
                                    }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            fontSize: '12px', fontWeight: '700', color: '#1e293b'
                                        }}>
                                            <div style={{
                                                width: '22px', height: '22px', borderRadius: '50%',
                                                background: 'var(--primary, #4f46e5)', color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '9px', fontWeight: '800', flexShrink: 0
                                            }}>
                                                {(activity.user_name || 'S')[0].toUpperCase()}
                                            </div>
                                            {activity.user_name || 'System'}
                                        </div>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            fontSize: '11px', color: '#94a3b8'
                                        }}>
                                            <Clock size={11} />
                                            <span className="num-en" title={new Date(activity.created_at).toLocaleString('en-GB')}>
                                                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Message */}
                                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: '600', lineHeight: '1.5' }}>
                                        {activity.formatted_message}
                                    </div>

                                    {/* Scheduled Follow-up / Reminder Box */}
                                    {activity.scheduled_at && (() => {
                                        const isDismissed = Boolean(activity.is_reminder_dismissed);
                                        const isSent = Boolean(activity.reminder_sent_at);
                                        const isDue = !isDismissed && new Date(activity.scheduled_at) <= new Date();
                                        const schedDate = new Date(activity.scheduled_at);

                                        let boxBg = '#eff6ff';
                                        let boxBorder = '#bfdbfe';
                                        let badgeBg = '#dbeafe';
                                        let badgeColor = '#1d4ed8';
                                        let statusLabel = `⏰ ${t('customers.upcoming', 'Upcoming')}`;

                                        if (isDismissed) {
                                            boxBg = '#f0fdf4';
                                            boxBorder = '#bbf7d0';
                                            badgeBg = '#dcfce7';
                                            badgeColor = '#15803d';
                                            statusLabel = `✅ ${t('customers.completed', 'Completed')}`;
                                        } else if (isDue) {
                                            boxBg = '#fffbeb';
                                            boxBorder = '#fde68a';
                                            badgeBg = '#fef3c7';
                                            badgeColor = '#b45309';
                                            statusLabel = `⚠️ ${t('customers.dueNow', 'Due Now')}`;
                                        } else if (isSent) {
                                            boxBg = '#f5f3ff';
                                            boxBorder = '#ddd6fe';
                                            badgeBg = '#ede9fe';
                                            badgeColor = '#6d28d9';
                                            statusLabel = `🔔 ${t('customers.reminderSent', 'Reminder Sent')}`;
                                        }

                                        return (
                                            <div style={{
                                                marginTop: '10px',
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                background: boxBg,
                                                border: `1px solid ${boxBorder}`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '11px',
                                                            background: badgeBg,
                                                            color: badgeColor,
                                                            fontWeight: '800'
                                                        }}>
                                                            {statusLabel}
                                                        </span>
                                                        <span style={{ color: '#1e293b' }}>
                                                            {t('customers.scheduledFor', 'Follow-up due:')}{' '}
                                                            <span className="num-en">
                                                                {schedDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                            ({formatDistanceToNow(schedDate, { addSuffix: true })})
                                                        </span>
                                                    </div>

                                                    {/* Actions */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {!isDismissed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDismissReminder(activity.id)}
                                                                disabled={actionLoadingId === activity.id}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                    padding: '3px 9px', borderRadius: '6px',
                                                                    background: '#16a34a', color: '#fff',
                                                                    border: 'none', fontSize: '11px', fontWeight: '700',
                                                                    cursor: actionLoadingId === activity.id ? 'not-allowed' : 'pointer'
                                                                }}
                                                                title={t('customers.markCompleted', 'Mark Done')}
                                                            >
                                                                <Check size={12} /> {t('customers.markCompleted', 'Mark Done')}
                                                            </button>
                                                        )}
                                                        {!isDismissed && reschedulingId !== activity.id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setReschedulingId(activity.id);
                                                                    setRescheduleDate(toLocalDatetimeString(schedDate));
                                                                }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                    padding: '3px 8px', borderRadius: '6px',
                                                                    background: '#fff', color: '#475569',
                                                                    border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: '600',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <RotateCcw size={11} /> {t('customers.reschedule', 'Reschedule')}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Reminder Note */}
                                                {activity.reminder_note && (
                                                    <div style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span>📝</span>
                                                        <span>{activity.reminder_note}</span>
                                                    </div>
                                                )}

                                                {/* Reschedule inline editor */}
                                                {reschedulingId === activity.id && (
                                                    <div style={{
                                                        marginTop: '6px',
                                                        paddingTop: '8px',
                                                        borderTop: `1px dashed ${boxBorder}`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        flexWrap: 'wrap'
                                                    }}>
                                                        <input
                                                            type="datetime-local"
                                                            value={rescheduleDate}
                                                            onChange={e => setRescheduleDate(e.target.value)}
                                                            min={toLocalDatetimeString(new Date())}
                                                            style={{
                                                                padding: '4px 8px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #cbd5e1',
                                                                fontSize: '11px',
                                                                outline: 'none',
                                                                background: '#fff'
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRescheduleReminder(activity.id)}
                                                            disabled={actionLoadingId === activity.id}
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                background: '#4f46e5',
                                                                color: '#fff',
                                                                border: 'none',
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {isRTL ? 'حفظ الموعد' : 'Save'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setReschedulingId(null)}
                                                            style={{
                                                                padding: '4px 8px',
                                                                borderRadius: '6px',
                                                                background: '#f1f5f9',
                                                                color: '#64748b',
                                                                border: '1px solid #cbd5e1',
                                                                fontSize: '11px',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {t('common.cancel', 'Cancel')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Exact date stamp */}
                                    <div className="num-en" style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '6px' }}>
                                        {new Date(activity.created_at).toLocaleString('en-GB', {
                                             day: '2-digit', month: 'short', year: 'numeric',
                                             hour: '2-digit', minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Load More ───────────────────────────────────────────────── */}
            {hasMore && activities.length > 0 && !loading && (
                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <button
                        onClick={handleLoadMore}
                        style={{
                            padding: '7px 20px', background: '#f1f5f9',
                            color: '#475569', border: '1px solid #e2e8f0',
                            borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                        }}
                    >
                        {t('customers.loadOlderActivities', 'Load Older Activities')}
                    </button>
                </div>
            )}
            {loading && activities.length > 0 && (
                <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                    {t('customers.loadingMore', 'Loading more…')}
                </div>
            )}
        </div>
    );
};

export default ActivityTimeline;
