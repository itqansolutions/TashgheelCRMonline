import React, { useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShoppingCart, Utensils, Briefcase, Zap, ShieldCheck, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

const Home = () => {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const t = {
    en: {
      hero: {
        headline: "Build Your Business, Not Just Software.",
        sub: "CRM, POS & ERP systems designed for real business growth — fully bilingual and offline-ready.",
        ctaPrimary: "Try Live Demo",
        ctaSecondary: "Get a Free Consultation",
      },
      why: {
        title: "Why Itqan Solutions?",
        offline: "Offline-first (works without internet)",
        bilingual: "Arabic + English fully supported",
        robust: "Built for real businesses (not templates)",
      },
      pains: [
        {
          pain: "Losing stock every month?",
          solution: "Track everything in real-time with Tashgheel Retail.",
          icon: <ShoppingCart size={40} />,
          link: "/retail",
          color: "#10b981"
        },
        {
          pain: "Delayed orders in the kitchen?",
          solution: "Automate your restaurant flow with Tashgheel F&B.",
          icon: <Utensils size={40} />,
          link: "/restaurants",
          color: "#f59e0b"
        },
        {
          pain: "Don't know your customers?",
          solution: "Connect personally with Tashgheel CRM & Services.",
          icon: <Briefcase size={40} />,
          link: "/services",
          color: "#3b82f6"
        }
      ]
    },
    ar: {
      hero: {
        headline: "ابنِ عملك، ليس فقط برنامجك.",
        sub: "أنظمة CRM و POS و ERP مصممة لنمو الأعمال الحقيقي - ثنائية اللغة بالكامل وجاهزة للعمل بدون إنترنت.",
        ctaPrimary: "جرب الديمو الآن",
        ctaSecondary: "احصل على استشارة مجانية",
      },
      why: {
        title: "لماذا إتقان؟",
        offline: "أولوية العمل بدون إنترنت",
        bilingual: "دعم كامل للعربية والإنجليزية",
        robust: "مصمم للأعمال الحقيقية وليس مجرد قوالب",
      },
      pains: [
        {
          pain: "هل تفقد مخزونك كل شهر؟",
          solution: "تتبع كل شيء في الوقت الفعلي مع تشغيل Retail.",
          icon: <ShoppingCart size={40} />,
          link: "/retail",
          color: "#10b981"
        },
        {
          pain: "تأخير في طلبات المطبخ؟",
          solution: "أتمت تعاملات مطعمك مع تشغيل F&B.",
          icon: <Utensils size={40} />,
          link: "/restaurants",
          color: "#f59e0b"
        },
        {
          pain: "لا تعرف عملائك جيداً؟",
          solution: "تواصل معهم بذكاء مع تشغيل CRM والخدمات.",
          icon: <Briefcase size={40} />,
          link: "/services",
          color: "#3b82f6"
        }
      ]
    }
  }[lang];

  return (
    <div className="home-container" style={{ overflowX: 'hidden' }}>
      {/* Hero Section */}
      <section className="hero" style={heroStyle}>
        <div style={heroContentStyle} className="wow-reveal">
          <h1 style={headlineStyle}>{t.hero.headline}</h1>
          <p style={subStyle} className="wow-reveal delay-1">{t.hero.sub}</p>
          <div style={ctaGroupStyle} className="wow-reveal delay-2">
            <Link to="/demo" className="btn-primary" style={btnPrimaryStyle}>
              {t.hero.ctaPrimary} <ArrowRight size={20} />
            </Link>
            <Link to="/contact" className="btn-secondary" style={btnSecondaryStyle}>
              {t.hero.ctaSecondary}
            </Link>
          </div>
        </div>
        
        <div style={heroImageWrapperStyle} className="wow-reveal delay-3">
          <div style={heroImagePlaceholderStyle}>
            <img 
              src={`/itqan_solutions_hero_1775993564650.png`} 
              alt="Itqan Hero" 
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
            />
            <div style={floatingCardStyle} className="wow-float">
              <BarChart3 color="var(--primary)" size={32} />
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Growth Rate</div>
                <div style={{ fontWeight: '800', fontSize: '20px' }}>+124%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Itqan */}
      <section className="why-itqan" style={sectionStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '48px', fontSize: '42px', fontWeight: '800' }} className="wow-reveal">{t.why.title}</h2>
        <div style={whyGridStyle}>
          {[t.why.offline, t.why.bilingual, t.why.robust].map((item, i) => (
            <div key={i} style={whyCardStyle} className={`wow-reveal delay-${i+1}`}>
              <CheckCircle2 color="var(--success)" size={32} />
              <span style={{ fontSize: '18px', fontWeight: '600' }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pain-Solution Section */}
      <section className="solutions" style={{ padding: '80px 5%', backgroundColor: '#f8fafc' }}>
        <div style={solutionGridStyle}>
          {t.pains.map((item, i) => (
            <div key={i} className={`solution-card wow-reveal delay-${i+1}`} style={solutionCardStyle}>
              <div style={{ 
                color: item.color, 
                backgroundColor: `${item.color}15`, 
                width: '80px', 
                height: '80px', 
                borderRadius: '20px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '24px'
              }}>
                {item.icon}
              </div>
              <h3 style={{ color: 'var(--danger)', fontSize: '20px', marginBottom: '8px', fontWeight: '700' }}>
                {item.pain}
              </h3>
              <p style={{ fontSize: '24px', fontWeight: '800', marginBottom: '24px', lineHeight: '1.2' }}>
                {item.solution}
              </p>
              <Link to={item.link} style={{ 
                color: 'var(--primary)', 
                fontWeight: '700', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px' 
              }}>
                Learn More <ArrowRight size={18} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .btn-primary:hover { opacity: 0.9; transform: translateY(-2px); }
        .solution-card:hover { transform: scale(1.02); background: white; border-color: var(--border); box-shadow: var(--shadow-xl); }
      `}</style>
    </div>
  );
};

// Styles
const heroStyle = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '100px 5%',
  minHeight: '80vh',
  gap: '40px',
  overflow: 'hidden'
};

const heroContentStyle = {
  flex: 1,
  maxWidth: '650px'
};

const headlineStyle = {
  fontSize: '72px',
  fontWeight: '800',
  lineHeight: '1.05',
  letterSpacing: '-0.04em',
  marginBottom: '24px',
  color: 'var(--text-main)'
};

const subStyle = {
  fontSize: '22px',
  color: 'var(--text-muted)',
  marginBottom: '40px',
  maxWidth: '500px'
};

const ctaGroupStyle = {
  display: 'flex',
  gap: '20px',
  flexWrap: 'wrap'
};

const btnPrimaryStyle = {
  background: 'var(--primary)',
  color: 'white',
  padding: '18px 36px',
  borderRadius: '16px',
  fontWeight: '800',
  fontSize: '18px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.4)',
  transition: 'all 0.2s'
};

const btnSecondaryStyle = {
  background: 'white',
  color: 'var(--text-main)',
  padding: '18px 36px',
  borderRadius: '16px',
  fontWeight: '800',
  fontSize: '18px',
  border: '1px solid var(--border)',
  transition: 'all 0.2s'
};

const heroImageWrapperStyle = {
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
  position: 'relative'
};

const heroImagePlaceholderStyle = {
  width: '100%',
  maxWidth: '550px',
  aspectRatio: '1',
  background: 'linear-gradient(135deg, #e0e7ff 0%, #ffffff 100%)',
  borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
  position: 'relative',
  border: '1px solid var(--border)',
  overflow: 'hidden'
};

const floatingCardStyle = {
  position: 'absolute',
  top: '20%',
  left: '40px',
  background: 'white',
  padding: '20px',
  borderRadius: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  boxShadow: 'var(--shadow-xl)',
  border: '1px solid var(--border)',
};

const sectionStyle = {
  padding: '100px 5%'
};

const whyGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '30px'
};

const whyCardStyle = {
  background: 'var(--bg-card)',
  padding: '30px',
  borderRadius: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)'
};

const solutionGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
  gap: '40px'
};

const solutionCardStyle = {
  background: 'transparent',
  padding: '40px',
  borderRadius: '32px',
};

export default Home;
