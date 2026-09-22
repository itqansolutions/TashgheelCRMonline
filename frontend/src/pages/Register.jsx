import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Building2, ArrowRight, Check, Loader2, Phone, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

const Register = () => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', companyName: '', phone: '' });
    const [templateName, setTemplateName] = useState('general');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const validateStep1 = () => {
        if (!formData.companyName.trim() || !formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
            setError('Please fill in all required fields.'); return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email.trim())) {
            setError('Please enter a valid email address.'); return false;
        }
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(formData.password)) {
            setError('Password: min 8 chars, 1 uppercase, 1 number.'); return false;
        }
        setError(''); return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateStep1()) return;
        setLoading(true);
        setError('');
        try {
            await api.post('/auth/register-request', {
                name: formData.name.trim(),
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                companyName: formData.companyName.trim(),
                phone: formData.phone.trim() || undefined,
                templateName
            });
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top right, #4f46e5 0%, #1e1b4b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
            <style>{`
                @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
                @keyframes pulseCheck { 0%,100% { transform:scale(1); } 50% { transform:scale(1.1); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                .reg-card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); padding: 40px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); width: 100%; max-width: 520px; border: 1px solid rgba(255,255,255,0.1); animation: slideUp 0.5s cubic-bezier(0.4,0,0.2,1); }
                .reg-input { width: 100%; padding: 12px 12px 12px 42px; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 14px; font-weight: 500; background: rgba(255,255,255,0.06); color: white; transition: all 0.3s; box-sizing: border-box; }
                .reg-input:focus { border-color: #6366f1; background: rgba(255,255,255,0.1); box-shadow: 0 0 0 4px rgba(99,102,241,0.2); outline: none; }
                .reg-input::placeholder { color: rgba(255,255,255,0.35); }
                .reg-label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); letter-spacing: 0.02em; }
                .reg-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: all 0.3s; margin-top: 8px; }
                .reg-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(79,70,229,0.5); }
                .reg-btn:disabled { opacity: 0.6; cursor: not-allowed; }
                .err-box { background: rgba(239,68,68,0.12); color: #f87171; padding: 12px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; border: 1px solid rgba(239,68,68,0.25); text-align: center; }
                .step-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; transition: all 0.3s; }
                .step-dot.done { background: #10b981; color: white; }
                .step-dot.active { background: #4f46e5; color: white; }
                .step-dot.pending { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); }
                .step-line { flex: 1; height: 2px; background: rgba(255,255,255,0.1); border-radius: 1px; }
                .step-line.done { background: #10b981; }
            `}</style>

            <div style={{ position: 'absolute', width: 400, height: 400, background: 'rgba(99,102,241,0.15)', filter: 'blur(80px)', top: '-100px', left: '-100px', borderRadius: '50%', pointerEvents: 'none' }}/>

            <div className="reg-card">
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <h1 style={{ color: 'white', fontSize: 30, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em' }}>
                        {step === 1 ? 'Create Your Workspace' : 'Request Received!'}
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: 14 }}>
                        {step === 1 ? 'Launch your organization in minutes' : "We'll be in touch shortly"}
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                    {['Account Info', 'Done'].map((label, i) => (
                        <React.Fragment key={i}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <div className={`step-dot ${i + 1 < step ? 'done' : i + 1 === step ? 'active' : 'pending'}`}>
                                    {i + 1 < step ? <Check size={14}/> : i + 1}
                                </div>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{label}</span>
                            </div>
                            {i < 1 && <div className={`step-line ${i + 1 < step ? 'done' : ''}`}/>}
                        </React.Fragment>
                    ))}
                </div>

                {step === 1 && (
                    <form onSubmit={handleSubmit} style={{ animation: 'fadeIn 0.3s ease' }}>
                        {error && <div className="err-box">{error}</div>}
                        {[
                            { name: 'companyName', label: 'Organization Name', placeholder: 'e.g. Acme Corp',                  type: 'text',     Icon: Building2 },
                            { name: 'name',        label: 'Your Full Name',    placeholder: 'John Doe',                        type: 'text',     Icon: User },
                            { name: 'email',       label: 'Work Email',        placeholder: 'john@company.com',                type: 'email',    Icon: Mail },
                            { name: 'phone',       label: 'Phone Number',      placeholder: '+201...',                         type: 'text',     Icon: Phone },
                            { name: 'password',    label: 'Password',          placeholder: 'Min 8 chars, 1 upper, 1 number',  type: 'password', Icon: Lock },
                        ].map(({ name, label, placeholder, type, Icon }) => (
                            <div key={name} style={{ marginBottom: 20 }}>
                                <label className="reg-label">{label}</label>
                                <div style={{ position: 'relative' }}>
                                    <Icon size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}/>
                                    <input className="reg-input" type={type} name={name} placeholder={placeholder} value={formData[name]} onChange={handleChange} required={name !== 'phone'}/>
                                </div>
                            </div>
                        ))}

                        <div style={{ marginBottom: 24 }}>
                            <label className="reg-label">Industry Focus</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div onClick={() => setTemplateName('general')} style={{ padding: '12px', border: `2px solid ${templateName === 'general' ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, background: templateName === 'general' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'all 0.3s', textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, color: 'white', fontSize: 13 }}>General CRM</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Standard features</div>
                                </div>
                                <div onClick={() => setTemplateName('real_estate')} style={{ padding: '12px', border: `2px solid ${templateName === 'real_estate' ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, background: templateName === 'real_estate' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'all 0.3s', textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, color: 'white', fontSize: 13 }}>Real Estate</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Units &amp; Tracking</div>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="reg-btn" disabled={loading}>
                            {loading
                                ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }}/> Submitting...</>
                                : <>Submit Request <ArrowRight size={18}/></>
                            }
                        </button>
                        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                            Already have a workspace? <Link to="/login" style={{ color: 'white', fontWeight: 700 }}>Sign In</Link>
                        </div>
                    </form>
                )}

                {step === 2 && (
                    <div style={{ animation: 'fadeIn 0.4s ease', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulseCheck 2s ease-in-out infinite' }}>
                                <CheckCircle2 size={40} color="#10b981"/>
                            </div>
                        </div>
                        <h2 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>We received your request!</h2>
                        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 1.7, margin: '0 0 28px' }}>
                            Thank you! We've received your signup request. Our team will call you soon to get you started.
                        </p>
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 28, border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Registered email</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{formData.email}</div>
                        </div>
                        <button className="reg-btn" onClick={() => navigate('/', { replace: true })}>Back to Home</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Register;
