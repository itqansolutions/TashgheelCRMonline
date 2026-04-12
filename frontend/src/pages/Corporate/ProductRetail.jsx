import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ShoppingCart, BarChart, HardDrive, LayoutGrid, CheckCircle2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const ProductRetail = () => {
  const { lang } = useLanguage();

  const t = {
    en: {
      headline: "Never Lose Track of Your Inventory Again.",
      sub: "Built for retail growth. Stop stock leakage, master multi-branch sales, and scale your business with ease.",
      painSection: {
        title: "Stop the bleeding.",
        q1: "Losing stock every month?",
        a1: "Automated real-time inventory tracking with zero errors.",
        q2: "Blind in multiple branches?",
        a2: "Centralized dashboard to see every sale, entry, and transfer instantly.",
        q3: "Difficult to scale?",
        a3: "One-click branch provisioning. From 1 to 100 locations seamlessly.",
      },
      features: [
        { title: "Live Stock Tracking", desc: "Know exactly what's on your shelves, even when you're abroad." },
        { title: "Smart Low-Stock Alerts", desc: "Automated notifications before you run out of best-sellers." },
        { title: "Multi-Branch Control", desc: "Manage transfers and pricing across all regions from one screen." },
      ],
      cta: "See Live Demo"
    },
    ar: {
      headline: "لا تفقد تتبع مخزونك أبداً بعد اليوم.",
      sub: "مصمم لنمو تجارة التجزئة. أوقف تسرب المخزون، وتحكم في مبيعات فروعك المتعددة، وطور عملك بسهولة.",
      painSection: {
        title: "أوقف الخسائر الآن.",
        q1: "هل تفقد مخزونك كل شهر؟",
        a1: "تتبع آلي للمخزون في الوقت الفعلي مع صفر أخطاء.",
        q2: "هل تفتقد الرؤية في فروعك المتعددة؟",
        a2: "لوحة تحكم مركزية لمتابعة كل عملية بيع ودخول وتحويل فوراً.",
        q3: "هل التوسع صعب؟",
        a3: "تفعيل الفروع بضغطة واحدة. من فرع إلى 100 فرع بسلاسة.",
      },
      features: [
        { title: "تتبع المخزون المباشر", desc: "اعرف بالضبط ما هو متاح على أرففك، حتى وأنت في الخارج." },
        { title: "تنبيهات نقص المخزون الذكية", desc: "إشعارات تلقائية قبل نفاذ المنتجات الأكثر مبيعاً." },
        { title: "التحكم في الفروع المتعددة", desc: "إدارة التحويلات والأسعار عبر جميع المناطق من شاشة واحدة." },
      ],
      cta: "جرب الديمو الحي"
    }
  }[lang];

  return (
    <div style={{ padding: '60px 5%', overflowX: 'hidden' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: '900px', margin: '0 auto 80px' }} className="wow-reveal">
        <h1 style={{ fontSize: '64px', fontWeight: '800', lineHeight: 1.1, marginBottom: '24px' }}>{t.headline}</h1>
        <p style={{ fontSize: '20px', color: 'var(--text-muted)' }} className="wow-reveal delay-1">{t.sub}</p>
      </div>

      {/* Pain-Solution Blocks */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px', marginBottom: '100px' }}>
        <div style={{ background: '#fef2f2', padding: '40px', borderRadius: '32px', border: '1px solid #fee2e2' }} className="wow-reveal delay-2">
          <h2 style={{ color: 'var(--danger)', fontSize: '32px', fontWeight: '800', marginBottom: '32px' }}>{t.painSection.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div className="wow-reveal delay-3">
              <h4 style={{ color: 'var(--danger)', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q1}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a1}</p>
            </div>
            <div className="wow-reveal delay-4">
              <h4 style={{ color: 'var(--danger)', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q2}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a2}</p>
            </div>
            <div className="wow-reveal delay-5">
              <h4 style={{ color: 'var(--danger)', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q3}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a3}</p>
            </div>
          </div>
        </div>

        <div style={{ 
          background: 'var(--primary)', 
          padding: '40px', 
          borderRadius: '32px', 
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '30px'
        }} className="wow-reveal delay-3">
          {t.features.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: '20px' }} className={`wow-reveal delay-${i+4}`}>
              <CheckCircle2 color="rgba(255,255,255,0.8)" size={32} />
              <div>
                <h4 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>{f.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
          <Link to="/demo" style={{ 
            marginTop: '20px', 
            background: 'white', 
            color: 'var(--primary)', 
            padding: '16px 32px', 
            borderRadius: '16px', 
            fontWeight: '800', 
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }} className="wow-reveal delay-5">
            {t.cta} <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ProductRetail;
