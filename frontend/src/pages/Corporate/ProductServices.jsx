import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Briefcase, Calendar, MessageSquare, Star, CheckCircle2, ArrowRight, HeartHandshake } from 'lucide-react';
import { Link } from 'react-router-dom';

const ProductServices = () => {
  const { lang } = useLanguage();

  const t = {
    en: {
      headline: "Know Every Customer Personally.",
      sub: "Master your customer relationships, automate appointments, and grow your service business with professional tools.",
      painSection: {
        title: "Build real loyalty.",
        q1: "Forgetting customer details?",
        a1: "Automated CRM that remembers every interaction and preference.",
        q2: "Missed appointments?",
        a2: "Smart booking system with automated reminders for you and your clients.",
        q3: "Service quality inconsistent?",
        a3: "Track service history and feedback to ensure high standards every time.",
      },
      features: [
        { title: "Smart Appointment Booking", desc: "Let customers book online, synced perfectly with your availability." },
        { title: "Unified Customer Profiles", desc: "A 360-degree view of every client's history and preferences." },
        { title: "Automated Follow-ups", desc: "Increase retention with automated personal messages and offers." },
      ],
      cta: "See Services Demo"
    },
    ar: {
      headline: "اعرف كل عملاءك بشكل شخصي.",
      sub: "أتقن علاقاتك مع عملائك، وأتمت مواعيدك، وطور عملك الخدمي باستخدام أدوات احترافية.",
      painSection: {
        title: "ابنِ ولاءً حقيقياً.",
        q1: "هل تنسى تفاصيل العملاء؟",
        a1: "نظام CRM آلي يتذكر كل تفاعل وتفضيل لكل عميل.",
        q2: "هل تضيع المواعيد؟",
        a2: "نظام حجز ذكي مع تذكيرات تلقائية لك ولعملائك.",
        q3: "جودة الخدمة غير متسقة؟",
        a3: "تتبع تاريخ الخدمة والآراء لضمان معايير عالية في كل مرة.",
      },
      features: [
        { title: "حجز مواعيد ذكي", desc: "دع العملاء يحجزون عبر الإنترنت، مع مزامنة كاملة لجدولك." },
        { title: "ملفات عملاء موحدة", desc: "رؤية شاملة (360 درجة) لتاريخ وتفضيلات كل عميل." },
        { title: "متابعات تلقائية", desc: "زد من ولاء العملاء برسائل وعروض شخصية تلقائية." },
      ],
      cta: "جرب ديمو الخدمات"
    }
  }[lang];

  return (
    <div style={{ padding: '60px 5%' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: '900px', margin: '0 auto 80px' }}>
        <h1 style={{ fontSize: '64px', fontWeight: '800', lineHeight: 1.1, marginBottom: '24px' }}>{t.headline}</h1>
        <p style={{ fontSize: '20px', color: 'var(--text-muted)' }}>{t.sub}</p>
      </div>

      {/* Pain-Solution Blocks */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px', marginBottom: '100px' }}>
        <div style={{ background: '#eff6ff', padding: '40px', borderRadius: '32px', border: '1px solid #dbeafe' }}>
          <h2 style={{ color: '#2563eb', fontSize: '32px', fontWeight: '800', marginBottom: '32px' }}>{t.painSection.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h4 style={{ color: '#2563eb', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q1}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a1}</p>
            </div>
            <div>
              <h4 style={{ color: '#2563eb', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q2}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a2}</p>
            </div>
            <div>
              <h4 style={{ color: '#2563eb', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q3}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a3}</p>
            </div>
          </div>
        </div>

        <div style={{ 
          background: '#3b82f6', 
          padding: '40px', 
          borderRadius: '32px', 
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '30px'
        }}>
          {t.features.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: '20px' }}>
              <HeartHandshake color="rgba(255,255,255,0.8)" size={32} />
              <div>
                <h4 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>{f.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
          <Link to="/demo" style={{ 
            marginTop: '20px', 
            background: 'white', 
            color: '#3b82f6', 
            padding: '16px 32px', 
            borderRadius: '16px', 
            fontWeight: '800', 
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}>
            {t.cta} <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ProductServices;
