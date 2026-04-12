import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Zap, ArrowRight, Shield, Clock, Star } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../hooks/useModule';
import { useLanguage } from '../../context/LanguageContext';
import { safeArray } from '../../utils/dataUtils';
import toast from 'react-hot-toast';

const PLAN_FEATURES = {
    basic: {
        color: '#6b7280',
        gradient: 'linear-gradient(135deg, #374151, #6b7280)',
        highlight: false,
        badge: null,
        features: [
            { label: 'Up to 10 users',           included: true },
            { label: '1 branch',                  included: true },
            { label: 'CRM & Lead Management',     included: true },
            { label: 'Finance & Invoicing',       included: true },
            { label: 'Tasks & Projects',          included: true },
            { label: 'HR & Attendance',           included: false },
            { label: 'Inventory Management',      included: false },
            { label: 'Workflow Automation',       included: false },
            { label: 'Multi-branch Support',      included: false },
            { label: 'Advanced Reports',          included: false },
        ]
    },
    pro: {
        color: '#4f46e5',
        gradient: 'linear-gradient(135deg, #4f46e5, #6366f1)',
        highlight: true,
        badge: '⭐ Most Popular',
        features: [
            { label: 'Up to 50 users',            included: true },
            { label: '5 branches',                included: true },
            { label: 'CRM & Lead Management',     included: true },
            { label: 'Finance & Invoicing',       included: true },
            { label: 'Tasks & Projects',          included: true },
            { label: 'HR & Attendance',           included: true },
            { label: 'Inventory Management',      included: true },
            { label: 'Workflow Automation',       included: false },
            { label: 'Multi-branch Support',      included: true },
            { label: 'Advanced Reports',          included: true },
        ]
    },
    enterprise: {
        color: '#7c3aed',
        gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        highlight: false,
        badge: '👑 Full Power',
        features: [
            { label: 'Unlimited users',           included: true },
            { label: 'Unlimited branches',        included: true },
            { label: 'CRM & Lead Management',     included: true },
            { label: 'Finance & Invoicing',       included: true },
            { label: 'Tasks & Projects',          included: true },
            { label: 'HR & Attendance',           included: true },
            { label: 'Inventory Management',      included: true },
            { label: 'Workflow Automation',       included: true },
            { label: 'Multi-branch Support',      included: true },
            { label: 'Dedicated Support',         included: true },
        ]
    }
};

const Pricing = () => {
    const { lang } = useLanguage();
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState(null);
    const { planName: currentPlan, trialDaysLeft, status } = useModule();
    const navigate = useNavigate();

    const t = {
        en: {
            headline: "Simple, Transparent Pricing",
            sub: "Choose the plan that fits your business. Upgrade or downgrade anytime.",
            trialLeft: (days) => `⏳ ${days} day${days !== 1 ? 's' : ''} left in your free trial — Upgrade anytime`,
            trialExpired: '⚠️ Your trial has expired. Upgrade to restore access.',
            billedMonthly: "per month · billed monthly",
            currentPlan: "Current Plan",
            startPlan: "Start with this Plan",
            upgradeTo: (name) => `Upgrade to ${name}`,
            upgrading: "Upgrading...",
            trust: [
                "No credit card required",
                "14-day free trial",
                "Cancel anytime",
                "All plans include free onboarding"
            ],
            loading: "Loading plans...",
            features: {
                users: (n) => `Up to ${n} users`,
                unlimitedUsers: "Unlimited users",
                branches: (n) => `${n} ${n === 1 ? 'branch' : 'branches'}`,
                unlimitedBranches: "Unlimited branches",
                crm: "CRM & Lead Management",
                finance: "Finance & Invoicing",
                tasks: "Tasks & Projects",
                hr: "HR & Attendance",
                inventory: "Inventory Management",
                automation: "Workflow Automation",
                multibranch: "Multi-branch Support",
                reports: "Advanced Reports",
                support: "Dedicated Support"
            }
        },
        ar: {
            headline: "أسعار بسيطة وشفافة",
            sub: "اختر الخطة التي تناسب عملك. يمكنك الترقية أو التخفيض في أي وقت.",
            trialLeft: (days) => `⏳ متبقى ${days} ${days > 10 ? 'يوم' : 'أيام'} في فترتك التجريبية — رقّي حسابك في أي وقت`,
            trialExpired: '⚠️ انتهت فترتك التجريبية. قم بالترقية لاستعادة الوصول.',
            billedMonthly: "شهرياً · يتم الدفع شهرياً",
            currentPlan: "خطتك الحالية",
            startPlan: "ابدأ بهذه الخطة",
            upgradeTo: (name) => `الترقية إلى ${name}`,
            upgrading: "جاري الترقية...",
            trust: [
                "لا يتطلب بطاقة ائتمان",
                "تجربة مجانية لمدة 14 يوماً",
                "إلغاء في أي وقت",
                "جميع الخطط تشمل تدريباً مجانياً"
            ],
            loading: "جاري تحميل الخطط...",
            features: {
                users: (n) => `حتى ${n} مستخدم`,
                unlimitedUsers: "مستخدمين غير محدودين",
                branches: (n) => `${n} ${n === 1 ? 'فرع' : 'فروع'}`,
                unlimitedBranches: "فروع غير محدودة",
                crm: "إدارة العملاء والفرص",
                finance: "المالية والفواتير",
                tasks: "المهام والمشاريع",
                hr: "الموارد البشرية والحضور",
                inventory: "إدارة المخزون",
                automation: "أتمتة سير العمل",
                multibranch: "دعم الفروع المتعددة",
                reports: "تقارير متقدمة",
                support: "دعم فني مخصص"
            }
        }
    }[lang];

    // Map dynamic labels to translations
    const translateFeature = (label) => {
        if (label.includes('user')) {
            const n = label.match(/\d+/);
            return n ? t.features.users(n[0]) : t.features.unlimitedUsers;
        }
        if (label.includes('branch')) {
            const n = label.match(/\d+/);
            return n ? t.features.branches(n[0]) : t.features.unlimitedBranches;
        }
        const mapping = {
            'CRM & Lead Management': t.features.crm,
            'Finance & Invoicing': t.features.finance,
            'Tasks & Projects': t.features.tasks,
            'HR & Attendance': t.features.hr,
            'Inventory Management': t.features.inventory,
            'Workflow Automation': t.features.automation,
            'Multi-branch Support': t.features.multibranch,
            'Advanced Reports': t.features.reports,
            'Dedicated Support': t.features.support
        };
        return mapping[label] || label;
    };

    useEffect(() => {
        api.get('/plans').then(res => {
            setPlans(res.data.data || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const handleUpgrade = async (planName) => {
        if (planName === currentPlan) return;
        setUpgrading(planName);

        // TODO: Wire Stripe/Paymob here
        // For now: mock upgrade with optimistic UI
        toast.success(`🚀 Upgraded to ${planName.charAt(0).toUpperCase() + planName.slice(1)}! (Billing integration coming soon)`, { duration: 4000 });
        setTimeout(() => {
            setUpgrading(null);
            navigate('/dashboard');
        }, 1500);
    };

    const urgencyColor = trialDaysLeft !== null
        ? trialDaysLeft <= 3 ? '#ef4444' : trialDaysLeft <= 7 ? '#f59e0b' : '#10b981'
        : null;

    return (
        <div className="pricing-page">
            <style>{`
                @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
                @keyframes shine { from { left:-100%; } to { left:200%; } }

                .pricing-page { min-height: 100vh; padding: 48px 24px; background: var(--bg-main); }
                .pricing-hero { text-align: center; margin-bottom: 56px; }
                .pricing-hero h1 { font-size: 48px; font-weight: 900; margin: 0 0 12px; letter-spacing: -0.03em; background: linear-gradient(135deg, var(--text-main), var(--primary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .pricing-hero p { font-size: 18px; color: var(--text-muted); margin: 0 0 24px; }

                .trial-notice { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: 700; margin-bottom: 8px; }

                .plans-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1100px; margin: 0 auto; }
                @media (max-width: 900px) { .plans-grid { grid-template-columns: 1fr; max-width: 480px; } }

                .plan-card {
                    background: var(--bg-card); border-radius: 24px; padding: 32px;
                    position: relative; transition: all 0.3s;
                    border: 2px solid var(--glass-border);
                    display: flex; flex-direction: column;
                }
                .plan-card:hover { transform: translateY(-6px); box-shadow: 0 24px 48px rgba(0,0,0,0.1); }
                .plan-card.popular {
                    border-color: #4f46e5; 
                    box-shadow: 0 0 0 4px rgba(79,70,229,0.12), 0 24px 48px rgba(79,70,229,0.15);
                    transform: scale(1.03);
                }
                .plan-card.popular:hover { transform: scale(1.03) translateY(-6px); }
                .plan-card.current { border-color: #10b981; }

                .plan-badge-top {
                    position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
                    padding: 5px 18px; border-radius: 20px; font-size: 12px; font-weight: 800;
                    white-space: nowrap; color: white;
                }
                .plan-name { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 8px; }
                .plan-price-main { font-size: 52px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; margin-bottom: 4px; }
                .plan-period { font-size: 14px; color: var(--text-muted); margin-bottom: 24px; }
                .plan-divider { height: 1px; background: var(--glass-border); margin: 20px 0; }

                .feature-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; font-weight: 500; }
                .feat-yes { color: #10b981; flex-shrink: 0; }
                .feat-no  { color: var(--text-muted); flex-shrink: 0; opacity: 0.4; }
                .feat-text-no { color: var(--text-muted); text-decoration: line-through; opacity: 0.5; }

                .plan-cta {
                    width: 100%; padding: 14px; border-radius: 12px; border: none;
                    font-weight: 800; font-size: 16px; cursor: pointer; margin-top: auto;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: all 0.25s; position: relative; overflow: hidden;
                }
                .plan-cta::after {
                    content: ''; position: absolute; top: 0; left: -100%;
                    width: 60%; height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
                    transition: 0.4s;
                }
                .plan-cta:hover::after { animation: shine 0.6s ease; }
                .plan-cta:hover { transform: translateY(-2px); }
                .plan-cta.primary { color: white; }
                .plan-cta.current-btn { background: rgba(16,185,129,0.1); color: #10b981; border: 2px solid rgba(16,185,129,0.3); cursor: default; }
                .plan-cta.current-btn:hover { transform: none; }
                .plan-cta:disabled { opacity: 0.6; cursor: wait; }

                .trust-bar { display: flex; justify-content: center; gap: 32px; margin-top: 48px; flex-wrap: wrap; }
                .trust-item { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-muted); font-weight: 600; }
            `}</style>

            <div className="pricing-hero">
                <h1>{t.headline}</h1>
                <p>{t.sub}</p>

                {trialDaysLeft !== null && (
                    <div className="trial-notice" style={{ background: `${urgencyColor}18`, color: urgencyColor, border: `1px solid ${urgencyColor}40` }}>
                        <Clock size={16}/>
                        {trialDaysLeft > 0
                            ? t.trialLeft(trialDaysLeft)
                            : t.trialExpired
                        }
                    </div>
                )}
            </div>

            {/* Plans Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>{t.loading}</div>
            ) : (
                <div className="plans-grid">
                    {safeArray(plans).map(plan => {
                        const meta = PLAN_FEATURES[plan.name] || PLAN_FEATURES.basic;
                        const isCurrent = currentPlan === plan.name;
                        const isHighlight = meta.highlight;

                        return (
                            <div key={plan.id} className={`plan-card ${isHighlight ? 'popular' : ''} ${isCurrent ? 'current' : ''}`}>
                                {meta.badge && (
                                    <div className="plan-badge-top" style={{ background: meta.gradient }}>{meta.badge}</div>
                                )}
                                {isCurrent && !meta.badge && (
                                    <div className="plan-badge-top" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>✓ Current Plan</div>
                                )}

                                <div style={{ marginTop: meta.badge || isCurrent ? 16 : 0 }}>
                                    <div className="plan-name">{plan.display_name}</div>
                                    <div className="plan-price-main" style={{ color: meta.color }}>${plan.price_monthly}</div>
                                    <div className="plan-period">per month · billed monthly</div>
                                </div>

                                <div className="plan-divider"/>

                                {/* Features */}
                                <div style={{ flex: 1 }}>
                                    {(meta.features || []).map((f, i) => (
                                        <div key={i} className="feature-row">
                                            {f.included
                                                ? <Check size={16} className="feat-yes" style={{ color: meta.color }}/>
                                                : <X size={16} className="feat-no"/>
                                            }
                                            <span className={f.included ? '' : 'feat-text-no'}>{translateFeature(f.label)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="plan-divider"/>

                                {isCurrent ? (
                                    <button className="plan-cta current-btn">
                                        <Check size={16}/> {t.currentPlan}
                                    </button>
                                ) : (
                                    <button
                                        className="plan-cta primary"
                                        style={{ background: meta.gradient }}
                                        onClick={() => handleUpgrade(plan.name)}
                                        disabled={upgrading === plan.name}
                                    >
                                        {upgrading === plan.name
                                            ? t.upgrading
                                            : <>
                                                <Zap size={16}/>
                                                {status === 'trial' ? t.startPlan : t.upgradeTo(plan.display_name)}
                                                <ArrowRight size={16}/>
                                              </>
                                        }
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Trust Bar */}
            <div className="trust-bar">
                <div className="trust-item"><Shield size={16}/> {t.trust[0]}</div>
                <div className="trust-item"><Clock size={16}/> {t.trust[1]}</div>
                <div className="trust-item"><Star size={16}/> {t.trust[2]}</div>
                <div className="trust-item"><Check size={16}/> {t.trust[3]}</div>
            </div>
        </div>
    );
};

export default Pricing;
