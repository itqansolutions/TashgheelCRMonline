import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Users, AlertTriangle, 
  CheckCircle, Zap, ShieldAlert, BarChart3, 
  ArrowUpRight, ArrowDownRight, Globe, Mail,
  ExternalLink, MousePointer2, CreditCard
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeArray, safeObject } from '../../utils/dataUtils';

const InsightsPanel = () => {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInsights = async () => {
            try {
                const res = await api.get('/super-admin/insights');
                setInsights(res.data.data);
            } catch (err) {
                console.error('Failed to load system intelligence');
            } finally {
                setLoading(false);
            }
        };
        fetchInsights();
    }, []);

    const handleAction = (action, message) => {
        toast.success(`Action Triggered: ${action} for "${message}"`);
        // In a real app, this would open a modal or trigger a specific flow
    };

    if (loading) return (
        <div className="animate-pulse flex flex-col space-y-4 p-8 bg-slate-900/40 rounded-3xl border border-white/5">
            <div className="h-8 bg-slate-800 w-1/4 rounded-lg mb-4"></div>
            <div className="grid grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-800 rounded-2xl"></div>)}
            </div>
        </div>
    );

    if (!insights || !insights.metrics) return null;
    const { metrics = {}, alerts = [], topPlans = [] } = insights;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-1000">
            <style>{`
                .glass-panel {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.4) 100%);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 28px;
                    padding: 24px;
                }
                .business-health-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 24px;
                }
                .health-score-container {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    background: rgba(99, 102, 241, 0.1);
                    padding: 12px 24px;
                    border-radius: 20px;
                    border: 1px solid rgba(99, 102, 241, 0.2);
                }
                .health-score-value {
                    font-size: 32px;
                    font-weight: 900;
                    background: linear-gradient(to right, #818cf8, #c084fc);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .decision-alert {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 20px;
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    transition: all 0.3s ease;
                }
                .alert-high { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.2); }
                .alert-medium { background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.2); }
                .alert-low { background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.2); }
                
                .cta-button {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    border-radius: 10px;
                    font-size: 12px;
                    font-weight: 700;
                    margin-top: 8px;
                    transition: 0.2s;
                    width: fit-content;
                }
                .cta-high { background: #ef4444; color: white; }
                .cta-medium { background: #f59e0b; color: white; }
                .cta-low { background: #6366f1; color: white; }
                .cta-button:hover { opacity: 0.9; transform: scale(1.02); }
            `}</style>

            {/* Business Health Operating Header */}
            <div className="business-health-header">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <BarChart3 className="text-indigo-500" /> Platform Decision Center
                    </h2>
                    <p className="text-slate-500 text-sm font-medium">Real-time SaaS Momentum & Unit Economics</p>
                </div>
                <div className="health-score-container">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Health</span>
                        <span className="health-score-value">{metrics.healthScore}%</span>
                    </div>
                    <div className={`w-3 h-12 rounded-full ${metrics.healthScore > 80 ? 'bg-emerald-500' : metrics.healthScore > 50 ? 'bg-amber-500' : 'bg-red-500'} opacity-20`} />
                </div>
            </div>

            {/* Strategic Decision Alerts */}
            {alerts?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {alerts.map((alert, idx) => (
                        <div key={idx} className={`decision-alert alert-${alert.level}`}>
                            <div className="flex items-start justify-between">
                                <span className={`p-2 rounded-lg ${alert.level === 'high' ? 'bg-red-500/20 text-red-500' : alert.level === 'medium' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                                    {alert.level === 'high' ? <ShieldAlert size={18} /> : alert.level === 'medium' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{alert.level} Priority</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-sm mb-1">{alert.message}</h4>
                                <p className="text-xs text-slate-400 leading-relaxed font-medium">{alert.suggestion}</p>
                            </div>
                            <button 
                                onClick={() => handleAction(alert.action, alert.message)}
                                className={`cta-button cta-${alert.level}`}
                            >
                                <MousePointer2 size={13} />
                                {alert.action}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Unit Economics & Momentum Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <MetricBlock 
                    title="Platform Health" 
                    value={`${((metrics.activeTenants || 0) / (metrics.totalTenants || 1) * 100).toFixed(0)}%`}
                    subtitle="Uptime & Usage"
                    icon={<CheckCircle size={20} className="text-emerald-500" />}
                    trend="up"
                />
                <MetricBlock 
                    title="Conversion" 
                    value={`${metrics.conversionRate}%`}
                    subtitle="SaaS Conversion Rate"
                    icon={<Zap size={20} className="text-amber-400" />}
                    trend={metrics.conversionRate > 15 ? 'Healthy' : 'Low'}
                    isWarning={metrics.conversionRate < 10}
                />
                <MetricBlock 
                    title="Growth Velocity" 
                    value={`${metrics.growthVelocity > 0 ? '+' : ''}${metrics.growthVelocity}%`}
                    subtitle="Signup Momentum (7d)"
                    icon={<TrendingUp size={20} className="text-indigo-400" />}
                    trend="Viral"
                />
                <MetricBlock 
                    title="Workspaces" 
                    value={metrics.totalTenants}
                    subtitle="Global Tenant Count"
                    icon={<Globe size={20} className="text-slate-400" />}
                />
            </div>

            {/* Plan Intelligence Footer */}
            <div className="glass-panel">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-white">Plan Market Share</h3>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div> Enterprise
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div> Pro
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                    {topPlans?.map(plan => (
                        <div key={plan.plan}>
                            <div className="flex items-end justify-between mb-2">
                                <span className="text-xs font-black text-white uppercase">{plan.plan}</span>
                                <span className="text-xs font-bold text-slate-500">{plan.count} Workspaces</span>
                            </div>
                            <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${plan.plan === 'enterprise' ? 'bg-indigo-500' : plan.plan === 'pro' ? 'bg-amber-500' : 'bg-slate-500'}`}
                                    style={{ width: `${(plan.count / (metrics.totalTenants || 1) * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MetricBlock = ({ title, value, subtitle, icon, trend, isWarning }) => (
    <div className="glass-panel">
        <div className="flex justify-between items-start mb-4">
            <div className="p-2.5 bg-slate-800/80 rounded-xl border border-white/5">
                {icon}
            </div>
            {trend && (
                <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${isWarning ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {trend}
                </div>
            )}
        </div>
        <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</div>
            <div className="text-3xl font-black text-white tracking-tight">{value}</div>
            <div className="text-[11px] font-medium text-slate-400">{subtitle}</div>
        </div>
    </div>
);

export default InsightsPanel;
