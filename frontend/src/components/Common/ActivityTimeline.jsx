import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
    Filter, Plus, X, Phone, MessageSquare, Users,
    Mail, Bell, Home, FileText, CheckCircle, Edit,
    User, Clock, ChevronDown, ChevronUp, Send
} from 'lucide-react';

// ── Action type configuration ──────────────────────────────────────────────
const ACTION_TYPES = [
    { value: 'called',      label: '📞 Called',       color: '#7c3aed', bg: '#f5f3ff' },
    { value: 'whatsapp',    label: '💬 WhatsApp',      color: '#059669', bg: '#ecfdf5' },
    { value: 'meeting',     label: '🤝 Meeting',       color: '#2563eb', bg: '#eff6ff' },
    { value: 'email_sent',  label: '📧 Email Sent',    color: '#0891b2', bg: '#ecfeff' },
    { value: 'follow_up',   label: '🔔 Follow-Up',     color: '#d97706', bg: '#fffbeb' },
    { value: 'visited',     label: '🏠 Site Visit',    color: '#dc2626', bg: '#fef2f2' },
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
const ActivityTimeline = ({ entityType, entityId }) => {
    const [activities, setActivities]   = useState([]);
    const [loading, setLoading]         = useState(true);
    const [filter, setFilter]           = useState('all');
    const [offset, setOffset]           = useState(0);
    const [hasMore, setHasMore]         = useState(true);

    // Log form state
    const [showForm, setShowForm]       = useState(false);
    const [logAction, setLogAction]     = useState('called');
    const [logNote, setLogNote]         = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [submitError, setSubmitError] = useState('');

    const LIMIT = 20;

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
            setSubmitError('Please enter a description.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await api.post(`/activities/${entityType}/${entityId}`, {
                action: logAction,
                note:   logNote.trim()
            });
            if (res.data.status === 'success') {
                // Prepend new entry to top of timeline instantly
                setActivities(prev => [res.data.data, ...prev]);
                setLogNote('');
                setShowForm(false);
            }
        } catch (err) {
            setSubmitError(err.response?.data?.message || 'Failed to save log. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Filter ─────────────────────────────────────────────────────────────
    const filteredActivities = activities.filter(a => {
        if (filter === 'all')       return true;
        if (filter === 'manual')    return ['called', 'whatsapp', 'meeting', 'email_sent', 'follow_up', 'visited', 'note'].includes(a.action);
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
                        <option value="all">All Activities</option>
                        <option value="manual">Interactions Only</option>
                        <option value="system">System Events</option>
                        <option value="called">📞 Calls</option>
                        <option value="whatsapp">💬 WhatsApp</option>
                        <option value="meeting">🤝 Meetings</option>
                        <option value="follow_up">🔔 Follow-Ups</option>
                        <option value="note">📝 Notes</option>
                    </select>
                </div>

                {/* Add Log Button */}
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
                    {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Log Interaction</>}
                </button>
            </div>

            {/* ── Log Form ────────────────────────────────────────────────── */}
            {showForm && (
                <form
                    onSubmit={handleSubmitLog}
                    style={{
                        background: '#f8fafc', border: '1.5px dashed #cbd5e1',
                        borderRadius: '12px', padding: '16px', marginBottom: '20px'
                    }}
                >
                    <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--primary, #4f46e5)', marginBottom: '12px' }}>
                        📋 Log a Customer Interaction
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
                                {at.label}
                            </button>
                        ))}
                    </div>

                    {/* Description */}
                    <textarea
                        rows={3}
                        placeholder={`Describe the ${ACTION_MAP[logAction]?.label.replace(/^.{2}\s/, '') || 'interaction'}… e.g. "Customer answered, interested in 3BR unit"`}
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
                            {submitting ? 'Saving…' : 'Save Log'}
                        </button>
                    </div>
                </form>
            )}

            {/* ── Timeline ────────────────────────────────────────────────── */}
            {loading && activities.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', padding: '12px 0' }}>
                    Loading timeline…
                </div>
            ) : filteredActivities.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '32px 16px',
                    background: '#f8fafc', borderRadius: '12px',
                    border: '1px dashed #e2e8f0', color: '#94a3b8', fontSize: '13px'
                }}>
                    No activities match your filter.<br />
                    <span style={{ fontSize: '11px' }}>Use "Log Interaction" above to add the first one.</span>
                </div>
            ) : (
                <div style={{ position: 'relative', paddingLeft: '28px' }}>
                    {/* Vertical line */}
                    <div style={{
                        position: 'absolute', left: '11px', top: '8px',
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
                                    position: 'absolute', left: '-28px', top: '2px',
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
                                            <span title={new Date(activity.created_at).toLocaleString()}>
                                                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Message */}
                                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: '600', lineHeight: '1.5' }}>
                                        {activity.formatted_message}
                                    </div>

                                    {/* Exact date stamp */}
                                    <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '6px' }}>
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
                        Load Older Activities
                    </button>
                </div>
            )}
            {loading && activities.length > 0 && (
                <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                    Loading more…
                </div>
            )}
        </div>
    );
};

export default ActivityTimeline;
