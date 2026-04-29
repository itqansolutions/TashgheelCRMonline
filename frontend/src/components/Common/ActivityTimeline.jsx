import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import { Filter } from 'lucide-react';

const ActivityTimeline = ({ entityType, entityId }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 20;

    const fetchActivities = async (currentOffset = 0, append = false) => {
        try {
            if (!append) setLoading(true);
            const response = await api.get(`/api/activities/${entityType}/${entityId}?limit=${LIMIT}&offset=${currentOffset}`);
            if (response.data.status === 'success') {
                const newData = response.data.data;
                if (newData.length < LIMIT) {
                    setHasMore(false);
                }
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

    const getActionIcon = (action) => {
        switch (action) {
            case 'created':
                return (
                    <span className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center ring-8 ring-white">
                        <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    </span>
                );
            case 'updated':
            case 'status_changed':
            case 'stage_changed':
                return (
                    <span className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                        <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                    </span>
                );
            case 'assigned':
                return (
                    <span className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center ring-8 ring-white">
                        <svg className="h-5 w-5 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                    </span>
                );
            default:
                return (
                    <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white">
                        <span className="h-2.5 w-2.5 rounded-full bg-gray-400"></span>
                    </span>
                );
        }
    };

    const filteredActivities = activities.filter(a => {
        if (filter === 'all') return true;
        if (filter === 'status' && (a.action === 'status_changed' || a.action === 'stage_changed')) return true;
        if (filter === 'assigned' && a.action === 'assigned') return true;
        if (filter === 'created' && a.action === 'created') return true;
        return false;
    });

    return (
        <div>
            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
                <Filter size={14} color="#64748b" />
                <select 
                    value={filter} 
                    onChange={e => setFilter(e.target.value)}
                    style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none' }}
                >
                    <option value="all">All Activities</option>
                    <option value="created">Created</option>
                    <option value="status">Status / Stage Changes</option>
                    <option value="assigned">Assignments</option>
                </select>
            </div>

            {loading && activities.length === 0 ? (
                <div className="text-sm text-gray-500 animate-pulse">Loading timeline...</div>
            ) : filteredActivities.length === 0 ? (
                <div className="text-sm text-gray-500">No activities match your filter.</div>
            ) : (
                <div className="flow-root">
                    <ul className="-mb-8">
                        {filteredActivities.map((activity, activityIdx) => (
                            <li key={activity.id}>
                                <div className="relative pb-8">
                                    {activityIdx !== filteredActivities.length - 1 ? (
                                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                                    ) : null}
                                    <div className="relative flex space-x-3">
                                        <div>
                                            {getActionIcon(activity.action)}
                                        </div>
                                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                            <div>
                                                <p className="text-sm text-gray-500">
                                                    {activity.formatted_message} by <span className="font-medium text-gray-900">{activity.user_name}</span>
                                                </p>
                                            </div>
                                            <div className="whitespace-nowrap text-right text-xs text-gray-500">
                                                <time dateTime={activity.created_at} title={new Date(activity.created_at).toLocaleString()}>
                                                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                                </time>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Pagination / Load More */}
            {hasMore && activities.length > 0 && !loading && (
                <div style={{ marginTop: '32px', textAlign: 'center' }}>
                    <button 
                        onClick={handleLoadMore}
                        style={{ padding: '6px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Load Older Activities
                    </button>
                </div>
            )}
            {loading && activities.length > 0 && (
                <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>Loading more...</div>
            )}
        </div>
    );
};

export default ActivityTimeline;
