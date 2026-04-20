import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Users, AlertTriangle, 
  CheckCircle, Zap, ShieldAlert, BarChart3, 
  ArrowUpRight, ArrowDownRight, Globe, Mail,
  ExternalLink, MousePointer2, CreditCard,
  Activity, ZapOff, Fingerprint, Cpu
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
        toast.success(`Protocol Initiated: ${action}`);
    };

    if (loading) return (
        <div className="animate-pulse flex flex-col space-y-4 p-8 bg-slate-900/40 rounded-[2rem] border border-white/5">
            <div className="h-8 bg-slate-800 w-1/4 rounded-lg mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[1,2,3,4].map(i => <div key={i} className="h-40 bg-slate-800/50 rounded-3xl"></div>)}
            </div>
        </div>
    );

    if (!insights || !insights.metrics) return null;
    const { metrics = {}, alerts = [], topPlans = [] } = insights;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <style>{`
                .hud-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .hud-card:hover {
                    transform: translateY(-8px);
                    border-color: rgba(99, 102, 241, 0.3);
                    box-shadow: 0 30px 60px -15px rgba(99, 102, 241, 0.2);
                }
                .text-gradient {
                    background: linear-gradient(to right, #818cf8, #c084fc, #fb7185);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .glossy-badge {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(5px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    text-shadow: 0 0 15px rgba(255,255,255,0.2);
                }
                @keyframes scanline {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100%); }
                }
                .scanline-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to bottom, transparent, rgba(99, 102, 241, 0.05), transparent);
                    animation: scanline 8s linear infinite;
                    pointer-events: none;
                }
            `}</style>

            {/* PLATFORM COCKPIT HEADER */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-2">
                <div className="relative">
                    <div className="absolute -left-4 top-0 bottom-0 w-1 bg-indigo-600 rounded-full blur-[2px]" />
                    <h2 className="text-3xl font-black tracking-tight text-white flex items-center gap-4">
                        <Cpu className="text-indigo-400 animate-pulse" size={28} />
                        Platform Decision Center
                    </h2>
                    <p className="text-slate-500 text-sm font-semibold mt-1 tracking-wide uppercase opacity-70">
                        Operational Intelligence & Revenue Velocity
                    </p>
                </div>

                <div className="flex items-center gap-8 bg-slate-900/50 p-4 px-6 rounded-3xl border border-white/5 backdrop-blur-md">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Status: Operational</span>
                        <div className="flex items-center gap-2">
                            <span className="text-3xl font-black text-white">{metrics.healthScore}%</span>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-500 uppercase leading-none">System</span>
                                <span className="text-[9px] font-bold text-slate-500 uppercase leading-none">Health</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-10 w-[2px] bg-white/5" />
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-800" />
                            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="125.6" strokeDashoffset={125.6 - (125.6 * metrics.healthScore / 100)} className={`${metrics.healthScore > 80 ? 'text-emerald-500' : 'text-amber-500'} transition-all duration-1000`} />
                        </svg>
                        <Activity className="absolute text-white opacity-40 animate-pulse" size={14} />
                    </div>
                </div>
            </div>

            {/* INTEL LOGS (ANOMALY DETECTION & ALERTS) */}
            {alerts?.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {alerts.map((alert, idx) => (
                        <div key={idx} className={`relative group hud-card p-6 rounded-[2rem] overflow-hidden`}>
                           <div className="scanline-overlay opacity-0 group-hover:opacity-100 transition-opacity" />
                           <div className="flex items-start justify-between mb-4">
                                <div className={`p-3 rounded-2xl ${alert.level === 'high' ? 'bg-rose-500/20 text-rose-400' : alert.level === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'} border border-white/5 shadow-inner`}>
                                    {alert.level === 'high' ? <ShieldAlert size={20} /> : alert.level === 'medium' ? <ZapOff size={20} /> : <Zap size={20} />}
                                </div>
                                <span className="glossy-badge px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400">{alert.level} PRIORITY</span>
                           </div>
                           <h4 className="text-white font-bold text-lg mb-2">{alert.message}</h4>
                           <p className="text-slate-400 text-sm leading-relaxed mb-6 font-medium">{alert.suggestion}</p>
                           <button 
                                onClick={() => handleAction(alert.action, alert.message)}
                                className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all ${
                                    alert.level === 'high' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20 hover:bg-rose-500' : 
                                    alert.level === 'medium' ? 'bg-amber-500 text-black hover:bg-amber-400' : 
                                    'bg-indigo-600 text-white hover:bg-indigo-500'
                                }`}
                           >
                                <Fingerprint size={16} />
                                {alert.action}
                           </button>
                        </div>
                    ))}
                </div>
            )}

            {/* STRATEGIC METRICS HUD */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricHUD 
                    title="Economic Uptime" 
                    value={`${((metrics.activeTenants || 0) / (metrics.totalTenants || 1) * 100).toFixed(0)}%`}
                    desc="Workspace Activity Rate"
                    icon={<Activity className="text-emerald-400" />}
                    accent="emerald"
                />
                <MetricHUD 
                    title="Conv. Velocity" 
                    value={`${metrics.conversionRate}%`}
                    desc="Lead to Expansion"
                    icon={<Zap className="text-amber-400" />}
                    accent="amber"
                />
                <MetricHUD 
                    title="Growth Vector" 
                    value={`${metrics.growthVelocity > 0 ? '+' : ''}${metrics.growthVelocity}%`}
                    desc="Net Momentum (7d)"
                    icon={<TrendingUp className="text-indigo-400" />}
                    accent="indigo"
                />
                <MetricHUD 
                    title="Global Reach" 
                    value={metrics.totalTenants}
                    desc="Authenticated Workspaces"
                    icon={<Globe className="text-violet-400" />}
                    accent="violet"
                />
            </div>

            {/* PLAN INTELLIGENCE CROSS-SECTION */}
            <div className="hud-card p-10 rounded-[2.5rem] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <BarChart3 size={120} />
                </div>
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                    <div>
                        <h3 className="text-2xl font-black text-white tracking-tight">Market Composition</h3>
                        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Tenant distribution by Subscription tier</p>
                    </div>
                    <div className="flex gap-4">
                        {['Enterprise', 'Pro', 'Basic'].map(tier => (
                            <div key={tier} className="flex items-center gap-2 glossy-badge px-4 py-2 rounded-xl text-[10px] font-black text-slate-300 uppercase">
                                <div className={`w-2 h-2 rounded-full ${tier === 'Enterprise' ? 'bg-indigo-500' : tier === 'Pro' ? 'bg-amber-500' : 'bg-slate-500'} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                                {tier}
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                    {topPlans?.map(plan => (
                        <div key={plan.plan} className="group">
                            <div className="flex items-end justify-between mb-4">
                                <span className="text-sm font-black text-white uppercase group-hover:text-indigo-400 transition-colors">{plan.plan}</span>
                                <span className="text-2xl font-black text-white/50 group-hover:text-white transition-colors">{plan.count}</span>
                            </div>
                            <div className="relative h-2 w-full bg-slate-800/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                <div 
                                    className={`h-full relative overflow-hidden ${
                                        plan.plan === 'enterprise' ? 'bg-gradient-to-r from-indigo-600 to-indigo-400' : 
                                        plan.plan === 'pro' ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 
                                        'bg-slate-600'
                                    }`}
                                    style={{ width: `${(plan.count / (metrics.totalTenants || 1) * 100)}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MetricHUD = ({ title, value, desc, icon, accent }) => {
    const accents = {
        emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5 shadow-emerald-500/10',
        amber: 'text-amber-400 border-amber-500/20 bg-amber-500/5 shadow-amber-500/10',
        indigo: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5 shadow-indigo-500/10',
        violet: 'text-violet-400 border-violet-500/20 bg-violet-500/5 shadow-violet-500/10'
    };

    return (
        <div className="hud-card p-8 rounded-[2rem] group relative overflow-hidden">
            <div className={`p-4 rounded-2xl border ${accents[accent]} w-fit mb-6 shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                {React.cloneElement(icon, { size: 24 })}
            </div>
            <div className="relative z-10">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{title}</p>
                <h3 className="text-4xl font-black text-white tracking-tighter mb-1 leading-none">
                    {value}
                </h3>
                <p className="text-xs font-bold text-slate-400/60 leading-tight uppercase tracking-wide">{desc}</p>
            </div>
            {/* Visual HUD Decoration */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 border-white/5 border-[1px] rounded-full group-hover:scale-150 transition-transform duration-1000" />
        </div>
    );
};

export default InsightsPanel;
