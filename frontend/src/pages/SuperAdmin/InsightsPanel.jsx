import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Users, AlertTriangle, 
  CheckCircle, Zap, ShieldAlert, BarChart3, 
  ArrowUpRight, ArrowDownRight, Globe
} from 'lucide-react';
import api from '../../services/api';

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

    if (loading) return (
        <div className="animate-pulse flex space-x-4 p-8 bg-slate-900/50 rounded-3xl border border-white/5">
            <div className="flex-1 space-y-6 py-1">
                <div className="h-2 bg-slate-700 rounded"></div>
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-2 bg-slate-700 rounded col-span-2"></div>
                        <div className="h-2 bg-slate-700 rounded col-span-1"></div>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!insights) return null;

    const { metrics, alerts, topPlans } = insights;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-700">
            <style>{`
                .insight-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.4) 100%);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 24px;
                    padding: 24px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .insight-card:hover {
                    border-color: rgba(99, 102, 241, 0.3);
                    transform: translateY(-4px);
                    box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.5);
                }
                .alert-pill {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 20px;
                    border-radius: 16px;
                    font-size: 13px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    animation: slideInLeft 0.5s ease-out;
                }
                @keyframes slideInLeft {
                    from { opacity: 0; transform: translateX(-20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .alert-success { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
                .alert-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }
                .alert-critical { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
                .alert-info { background: rgba(99, 102, 241, 0.1); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.2); }
            `}</style>

            {/* Strategic Alert Center */}
            {alerts?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {alerts.map((alert, idx) => (
                        <div key={idx} className={`alert-pill alert-${alert.type}`}>
                            {alert.type === 'success' && <Zap size={18} />}
                            {alert.type === 'warning' && <AlertTriangle size={18} />}
                            {alert.type === 'critical' && <ShieldAlert size={18} />}
                            {alert.type === 'info' && <Globe size={18} />}
                            <span>{alert.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* High-Level Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <MetricCard 
                    title="Conversion Rate" 
                    value={`${metrics.conversionRate}%`}
                    subtitle="Trial to Paid Logic"
                    icon={<Zap size={20} className="text-amber-500" />}
                    trend={metrics.conversionRate > 15 ? 'up' : 'down'}
                    trendValue={metrics.conversionRate > 15 ? 'Healthy' : 'Low'}
                />
                <MetricCard 
                    title="Growth Velocity" 
                    value={`${metrics.signupGrowth}%`}
                    subtitle="Last 7 Days vs Prev"
                    icon={<TrendingUp size={20} className="text-indigo-500" />}
                    trend={metrics.signupGrowth >= 0 ? 'up' : 'down'}
                />
                <MetricCard 
                    title="Churn Exposure" 
                    value={metrics.churnRiskCount}
                    subtitle="Expiring in 7 Days"
                    icon={<AlertTriangle size={20} className="text-rose-500" />}
                    trend={metrics.churnRiskCount > 0 ? 'down' : 'up'}
                />
                <MetricCard 
                    title="Platform Health" 
                    value={`${((metrics.activeTenants / metrics.totalTenants) * 100).toFixed(0)}%`}
                    subtitle="Uptime & Usage"
                    icon={<CheckCircle size={20} className="text-emerald-500" />}
                    trend="up"
                />
            </div>

            {/* Insights Footer: Plan Distribution */}
            <div className="insight-card">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <BarChart3 className="text-indigo-500" /> Plan Distribution Intelligence
                    </h3>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Market Share</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {topPlans?.map(plan => (
                        <div key={plan.plan} className="relative">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-1">{plan.plan}</div>
                            <div className="text-2xl font-black text-white">{plan.count}</div>
                            <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${plan.plan === 'enterprise' ? 'bg-indigo-500' : plan.plan === 'pro' ? 'bg-amber-500' : 'bg-slate-500'}`}
                                    style={{ width: `${(plan.count / metrics.totalTenants * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MetricCard = ({ title, value, subtitle, icon, trend, trendValue }) => (
    <div className="insight-card">
        <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 bg-slate-800/50 rounded-xl border border-white/5">
                {icon}
            </div>
            {trend && (
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${trend === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {trend === 'up' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {trendValue || (trend === 'up' ? 'Improving' : 'Attention')}
                </div>
            )}
        </div>
        <div className="text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">{title}</div>
        <div className="text-3xl font-black text-white mb-2">{value}</div>
        <div className="text-[11px] text-slate-400 font-medium">{subtitle}</div>
    </div>
);

export default InsightsPanel;
