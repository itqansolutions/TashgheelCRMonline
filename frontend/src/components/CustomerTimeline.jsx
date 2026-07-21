import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle, 
  Calendar, 
  DollarSign, 
  FileText, 
  User, 
  Clock, 
  Building, 
  PhoneCall, 
  MessageSquare,
  AlertCircle
} from 'lucide-react';

import api from '../services/api';

export default function CustomerTimeline({ entityType = 'Customer', entityId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!entityId) return;
    fetchActivities();
  }, [entityType, entityId]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/activities/${entityType}/${entityId}`);
      if (response.data && response.data.status === 'success') {
        setActivities(response.data.data || []);
      } else {
        setActivities([]);
      }
    } catch (err) {
      console.error('Failed to load timeline:', err);
      setError('Could not load activity timeline.');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type) => {
    const t = String(type).toLowerCase();
    if (t.includes('reservation')) return <Building className="w-4 h-4 text-amber-500" />;
    if (t.includes('payment') || t.includes('invoice')) return <DollarSign className="w-4 h-4 text-emerald-500" />;
    if (t.includes('deal')) return <CheckCircle className="w-4 h-4 text-blue-500" />;
    if (t.includes('call')) return <PhoneCall className="w-4 h-4 text-purple-500" />;
    if (t.includes('note') || t.includes('comment')) return <MessageSquare className="w-4 h-4 text-cyan-500" />;
    return <Activity className="w-4 h-4 text-indigo-500" />;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-amber-500" />
          Activity & Interaction Timeline
        </h3>
        <span className="text-xs bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20 font-medium">
          HubSpot Style Stream
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
          <Clock className="w-4 h-4 animate-spin text-amber-500" />
          Loading activity stream...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          No activity recorded for this entity yet. Actions & domain events will appear here automatically.
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {activities.map((act) => (
            <div key={act.id} className="relative group">
              {/* Timeline Bullet Node */}
              <div className="absolute -left-[31px] top-0.5 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-md">
                {getIcon(act.action || act.entity_type)}
              </div>

              {/* Event Content Card */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3.5 hover:border-slate-600 transition-all">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-slate-300">
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    {act.user_name || 'System Automator'}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3 h-3" />
                    {new Date(act.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="text-sm font-semibold text-slate-100 mb-1">
                  {act.formatted_message}
                </div>

                {act.meta && Object.keys(act.meta).length > 0 && (
                  <pre className="mt-2 p-2 bg-slate-950 rounded border border-slate-800/80 text-[11px] text-slate-300 overflow-x-auto font-mono">
                    {JSON.stringify(act.meta, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
