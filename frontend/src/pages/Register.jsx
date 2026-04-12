import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Building2, ArrowRight, ArrowLeft, Check, Zap, Loader2, Star } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

// Static plan data (also fetched from API, displayed here for immediate UX)
const PLANS_DISPLAY = [
    {
        name: 'basic',
        label: 'Basic',
        price: '$29',
        period: '/mo',
        color: '#6b7280',
        highlight: false,
        badge: null,
        features: ['Up to 10 users', '1 branch', 'CRM & Finance', 'Email support'],
        modules: { crm: true, finance: true, hr: false, inventory: false, automation: false }
    },
    {
        name: 'pro',
        label: 'Pro',
        price: '$79',
        period: '/mo',
        color: '#4f46e5',
        highlight: true,
        badge: 'Most Popular ⭐',
        features: ['Up to 50 users', '5 branches', 'CRM, Finance, HR & Inventory', 'Priority support'],
        modules: { crm: true, finance: true, hr: true, inventory: true, automation: false }
    },
    {
        name: 'enterprise',
        label: 'Enterprise',
        price: '$199',
        period: '/mo',
        color: '#7c3aed',
        highlight: false,
        badge: null,
        features: ['Unlimited users', 'Unlimited branches', 'All modules + Automation', 'Dedicated support'],
        modules: { crm: true, finance: true, hr: true, inventory: true, automation: true }
    }
];

const LOADING_STEPS = [
    { text: 'Setting up your company...', icon: '🏢' },
    { text: 'Creating your admin workspace...', icon: '⚙️' },
    { text: 'Seeding departments & data...', icon: '📊' },
    { text: 'Activating your 14-day trial...', icon: '🚀' },
    { text: 'Almost ready...', icon: '✨' }
];

const Register = () => {
    const [step, setStep] = useState(1); // 1: Account Info, 2: Plan Selection, 3: Loading
    const [formData, setFormData] = useState({ name: '', email: '', password: '', companyName: '' });
    const [selectedPlan, setSelectedPlan] = useState('pro'); // Pro highlighted by default
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    // Loading animation ticker
    useEffect(() => {
        let interval;
        if (loading && loadingStep < LOADING_STEPS.length - 1) {
            interval = setInterval(() => setLoadingStep(p => p + 1), 1400);
        }
        return () => clearInterval(interval);
    }, [loading, loadingStep]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const validateStep1 = () => {
        if (!formData.companyName.trim() || !formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
            setError('Please fill in all fields.'); return false;
        }
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(formData.password)) {
            setError('Password: min 8 chars, 1 uppercase, 1 number.'); return false;
        }
        setError(''); return true;
    };

    const handleNext = () => {
        if (validateStep1()) setStep(2);
    };

    const handleSubmit = async () => {
        setLoading(true);
        setStep(3);
        setLoadingStep(0);
        setError('');

        try {
            const res = await api.post('/auth/register', { ...formData, selectedPlan });
            if (res.data.token) {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                if (res.data.subscription) {
                    localStorage.setItem('subscription', JSON.stringify(res.data.subscription));
                }
                toast.success(`🚀 Workspace created! Welcome to Tashgheel.`);
                setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
            setLoading(false);
            setStep(1);
        }
    };

    // ── LOADING SCREEN ──────────────────────────────────────────
    if (step === 3) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes pulse { 0%,100% { opacity:0.6; transform: scale(1); } 50% { opacity:1; transform: scale(1.05); } }
                    @keyframes floatUp { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }
                `}</style>
                <div style={{ textAlign: 'center', animation: 'floatUp 0.5s ease' }}>
                    <div style={{ fontSize: 72, marginBottom: 16, animation: 'pulse 2s infinite' }}>
                        {LOADING_STEPS[loadingStep]?.icon}
                    </div>
                    <div style={{ width: 64, height: 64, border: '3px solid rgba(99,102,241,0.3)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 28px' }}/>
                    <div style={{ color: 'white', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                        {LOADING_STEPS[loadingStep]?.text}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                        {LOADING_STEPS.map((_, i) => (
                            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= loadingStep ? '#6366f1' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s' }}/>
                        ))}
                    </div>
                    <div style={{ marginTop: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                        Activating your <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}</strong> trial...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top right, #4f46e5 0%, #1e1b4b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
            <style>{`
                @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
                .reg-card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); padding: 40px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); width: 100%; max-width: ${step === 2 ? '860px' : '520px'}; border: 1px solid rgba(255,255,255,0.1); animation: slideUp 0.5s cubic-bezier(0.4,0,0.2,1); transition: max-width 0.3s ease; }
                .reg-input { width: 100%; padding: 12px 12px 12px 42px; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 14px; font-weight: 500; background: rgba(255,255,255,0.06); color: white; transition: all 0.3s; box-sizing: border-box; }
                .reg-input:focus { border-color: #6366f1; background: rgba(255,255,255,0.1); box-shadow: 0 0 0 4px rgba(99,102,241,0.2); outline: none; }
                .reg-input::placeholder { color: rgba(255,255,255,0.35); }
                .reg-label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); letter-spacing: 0.02em; }
                .reg-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: all 0.3s; margin-top: 8px; }
                .reg-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(79,70,229,0.5); }
                .reg-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                .reg-btn.secondary { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); }
                .reg-btn.secondary:hover { background: rgba(255,255,255,0.15); box-shadow: none; }
                .err-box { background: rgba(239,68,68,0.12); color: #f87171; padding: 12px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; border: 1px solid rgba(239,68,68,0.25); text-align: center; }

                /* Plan Cards */
                .plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                @media (max-width: 700px) { .plan-grid { grid-template-columns: 1fr; } }
                .plan-card { border-radius: 16px; padding: 28px; cursor: pointer; transition: all 0.2s; border: 2px solid transparent; position: relative; background: rgba(255,255,255,0.04); }
                .plan-card:hover { transform: translateY(-4px); }
                .plan-card.selected { border-color: #6366f1; background: rgba(99,102,241,0.12); }
                .plan-card.highlighted { border-color: rgba(99,102,241,0.5); }
                .plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 4px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap; }
                .plan-price { font-size: 36px; font-weight: 900; color: white; }
                .plan-period { font-size: 14px; color: rgba(255,255,255,0.5); }
                .plan-feature { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 10px; }

                /* Step Indicator */
                .steps { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; }
                .step-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; transition: all 0.3s; }
                .step-dot.done { background: #10b981; color: white; }
                .step-dot.active { background: #4f46e5; color: white; border: 2px solid rgba(99,102,241,0.5); }
                .step-dot.pending { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); }
                .step-line { flex: 1; height: 2px; background: rgba(255,255,255,0.1); border-radius: 1px; }
                .step-line.done { background: #10b981; }
            `}</style>

            {/* Background blob */}
            <div style={{ position: 'absolute', width: 400, height: 400, background: 'rgba(99,102,241,0.15)', filter: 'blur(80px)', top: '-100px', left: '-100px', borderRadius: '50%', pointerEvents: 'none' }}/>

            <div className="reg-card">
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <h1 style={{ color: 'white', fontSize: 30, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em' }}>
                        {step === 1 ? 'Create Your Workspace' : 'Choose Your Plan'}
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: 14 }}>
                        {step === 1 ? 'Launch your organization in minutes' : 'All plans include a 14-day free trial'}
                    </p>
                </div>

                {/* Step Indicator */}
                <div className="steps">
                    {['Account Info', 'Plan', 'Done'].map((label, i) => (
                        <React.Fragment key={i}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <div className={`step-dot ${i + 1 < step ? 'done' : i + 1 === step ? 'active' : 'pending'}`}>
                                    {i + 1 < step ? <Check size={14}/> : i + 1}
                                </div>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{label}</span>
                            </div>
                            {i < 2 && <div className={`step-line ${i + 1 < step ? 'done' : ''}`}/>}
                        </React.Fragment>
                    ))}
                </div>

                {error && <div className="err-box">{error}</div>}

                {/* STEP 1 — Account Info */}
                {step === 1 && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        {[
                            { name: 'companyName', label: 'Organization Name', placeholder: 'e.g. Acme Corp', type: 'text', Icon: Building2 },
                            { name: 'name', label: 'Your Full Name', placeholder: 'John Doe', type: 'text', Icon: User },
                            { name: 'email', label: 'Work Email', placeholder: 'john@company.com', type: 'email', Icon: Mail },
                            { name: 'password', label: 'Password', placeholder: 'Min 8 chars, 1 upper, 1 number', type: 'password', Icon: Lock },
                        ].map(({ name, label, placeholder, type, Icon }) => (
                            <div key={name} style={{ marginBottom: 20 }}>
                                <label className="reg-label">{label}</label>
                                <div style={{ position: 'relative' }}>
                                    <Icon size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}/>
                                    <input className="reg-input" type={type} name={name} placeholder={placeholder} value={formData[name]} onChange={handleChange} required/>
                                </div>
                            </div>
                        ))}
                        <button className="reg-btn" onClick={handleNext}>
                            Continue <ArrowRight size={18}/>
                        </button>
                        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                            Already have a workspace? <Link to="/login" style={{ color: 'white', fontWeight: 700 }}>Sign In</Link>
                        </div>
                    </div>
                )}

                {/* STEP 2 — Plan Selection */}
                {step === 2 && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <div className="plan-grid">
                            {PLANS_DISPLAY.map(plan => (
                                <div
                                    key={plan.name}
                                    className={`plan-card ${selectedPlan === plan.name ? 'selected' : ''} ${plan.highlight ? 'highlighted' : ''}`}
                                    onClick={() => setSelectedPlan(plan.name)}
                                    style={{ marginTop: plan.highlight ? 0 : 0 }}
                                >
                                    {plan.badge && <div className="plan-badge">{plan.badge}</div>}

                                    <div style={{ marginBottom: 16, marginTop: plan.badge ? 8 : 0 }}>
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{plan.label}</div>
                                        <span className="plan-price">{plan.price}</span>
                                        <span className="plan-period">{plan.period}</span>
                                    </div>

                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 16 }}>
                                        {plan.features.map((f, i) => (
                                            <div key={i} className="plan-feature">
                                                <Check size={13} style={{ color: plan.color, flexShrink: 0 }}/> {f}
                                            </div>
                                        ))}
                                    </div>

                                    {selectedPlan === plan.name && (
                                        <div style={{ background: plan.color, color: 'white', padding: '8px 0', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                                            ✓ Selected
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                            <button className="reg-btn secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>
                                <ArrowLeft size={16}/> Back
                            </button>
                            <button className="reg-btn" style={{ flex: 2 }} onClick={handleSubmit} disabled={loading}>
                                <Zap size={16}/> Start 14-Day Free Trial
                            </button>
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                            No credit card required. Cancel anytime.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Register;
