import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Rocket, ShoppingCart, Utensils, LayoutGrid, ArrowRight, Zap, ShieldCheck, CheckCircle2 } from 'lucide-react';

const DemoAccess = () => {
    const { lang } = useLanguage();
    const { login } = useAuth(); // We'll assume AuthContext handles our demo-login or we call API
    const navigate = useNavigate();
    const [loading, setLoading] = React.useState(false);

    const handleDemoLogin = async () => {
        setLoading(true);
        try {
            // We use the new demo-login endpoint
            const res = await fetch('/api/auth/demo-login', { method: 'POST' });
            const data = await res.json();
            
            if (data.status === 'success') {
                localStorage.setItem('token', data.token);
                // Trigger page reload or context update
                window.location.href = '/dashboard';
            } else {
                alert(lang === 'en' ? 'Demo account is being refreshed. Try again in 1 minute.' : 'جاري تحديث حساب الديمو، يرجى المحاولة بعد دقيقة.');
            }
        } catch (err) {
            console.error('Demo Login Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const content = {
        en: {
            title: "Experience the Power of Itqan Solutions",
            subtitle: "Dive into a fully-configured business environment. No registration required.",
            cta: "⚡ Start Instant Demo",
            loading: "Preparing Sandbox...",
            blocks: [
                {
                    title: "Retail & Inventory",
                    desc: "Explore multi-branch stock tracking and smart reporting.",
                    icon: <ShoppingCart />,
                    color: "#10b981"
                },
                {
                    title: "Restaurant & F&B",
                    desc: "Test order automation and kitchen display workflows.",
                    icon: <Utensils />,
                    color: "#f59e0b"
                },
                {
                    title: "Enterprise ERP",
                    desc: "Manage HR, Finance, and Workflows in one place.",
                    icon: <LayoutGrid />,
                    color: "#3b82f6"
                }
            ],
            why: "Why try the Demo?",
            reasons: [
                "Real pre-loaded data (Customers, Deals, Invoices)",
                "Full access to all Enterprise features",
                "See how easy it is to manage your team",
                "Mobile-responsive dashboard preview"
            ]
        },
        ar: {
            title: "اختبر قوة حلول إتقان الآن",
            subtitle: "ادخل مباشرة إلى بيئة عمل مجهزة بالكامل. لا يتطلب التسجيل.",
            cta: "⚡ ابدأ الديمو الآن",
            loading: "جاري تجهيز النظام...",
            blocks: [
                {
                    title: "التجزئة والمخازن",
                    desc: "استكشف تتبع المخزون متعدد الفروع والتقارير الذكية.",
                    icon: <ShoppingCart />,
                    color: "#10b981"
                },
                {
                    title: "المطاعم والكافيهات",
                    desc: "اختبر أتمتة الطلبات وسير العمل في المطبخ.",
                    icon: <Utensils />,
                    color: "#f59e0b"
                },
                {
                    title: "أنظمة الشركات ERP",
                    desc: "إدارة الموارد البشرية والمالية والأتمتة في مكان واحد.",
                    icon: <LayoutGrid />,
                    color: "#3b82f6"
                }
            ],
            why: "بماذا يتميز الديمو؟",
            reasons: [
                "بيانات حقيقية جاهزة (عملاء، صفقات، فواتير)",
                "دخول كامل لجميع ميزات نسخة الـ Enterprise",
                "شاهد مدى سهولة إدارة فريق عملك",
                "معاينة لوحة التحكم على جميع الأجهزة"
            ]
        }
    }[lang];

    return (
        <div style={containerStyle}>
            <div style={headerStyle} className="wow-reveal">
                <div style={badgeStyle}><Rocket size={18} /> {lang === 'en' ? 'Instant Access' : 'دخول فوري'}</div>
                <h1 style={titleStyle}>{content.title}</h1>
                <p style={subtitleStyle}>{content.subtitle}</p>
                
                <button 
                    onClick={handleDemoLogin} 
                    disabled={loading}
                    style={mainCtaStyle}
                    className="wow-float"
                >
                    {loading ? content.loading : content.cta}
                </button>
            </div>

            <div style={gridStyle}>
                {content.blocks.map((block, i) => (
                    <div key={i} style={cardStyle} className={`wow-reveal delay-${i+1}`}>
                        <div style={{ ...iconCircleStyle, backgroundColor: `${block.color}15`, color: block.color }}>
                            {block.icon}
                        </div>
                        <h3 style={cardTitleStyle}>{block.title}</h3>
                        <p style={cardDescStyle}>{block.desc}</p>
                    </div>
                ))}
            </div>

            <div style={whySectionStyle} className="wow-reveal delay-4">
                <h2 style={{ textAlign: 'center', marginBottom: '32px' }}>{content.why}</h2>
                <div style={reasonsGridStyle}>
                    {content.reasons.map((reason, i) => (
                        <div key={i} style={reasonItemStyle}>
                            <CheckCircle2 color="var(--success)" size={20} />
                            <span>{reason}</span>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
                .wow-float { animation: float 3s ease-in-out infinite; }
                button:hover { opacity: 0.9; transform: scale(1.02); }
                button:disabled { opacity: 0.7; cursor: not-allowed; }
            `}</style>
        </div>
    );
};

// Styles
const containerStyle = {
    padding: '80px 5%',
    maxWidth: '1200px',
    margin: '0 auto',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '64px'
};

const headerStyle = {
    textAlign: 'center',
    maxWidth: '800px',
    margin: '0 auto'
};

const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    padding: '8px 16px',
    borderRadius: '100px',
    fontSize: '14px',
    fontWeight: '700',
    marginBottom: '24px'
};

const titleStyle = {
    fontSize: '56px',
    fontWeight: '800',
    lineHeight: '1.1',
    marginBottom: '24px',
    background: 'linear-gradient(135deg, var(--text-main) 0%, #6366f1 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
};

const subtitleStyle = {
    fontSize: '20px',
    color: 'var(--text-muted)',
    marginBottom: '48px'
};

const mainCtaStyle = {
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    padding: '24px 48px',
    borderRadius: '20px',
    fontSize: '24px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 20px 40px -10px rgba(79, 70, 229, 0.5)',
    transition: 'all 0.3s'
};

const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '32px'
};

const cardStyle = {
    background: 'white',
    padding: '40px',
    borderRadius: '32px',
    border: '1px solid var(--border)',
    textAlign: 'center',
    transition: 'all 0.3s',
    boxShadow: 'var(--shadow-sm)'
};

const iconCircleStyle = {
    width: '80px',
    height: '80px',
    borderRadius: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px auto'
};

const cardTitleStyle = {
    fontSize: '22px',
    fontWeight: '800',
    marginBottom: '16px'
};

const cardDescStyle = {
    color: 'var(--text-muted)',
    lineHeight: '1.6'
};

const whySectionStyle = {
    background: '#f8fafc',
    padding: '64px',
    borderRadius: '40px',
    border: '1px solid var(--border)'
};

const reasonsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px'
};

const reasonItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '16px',
    fontWeight: '600'
};

export default DemoAccess;
