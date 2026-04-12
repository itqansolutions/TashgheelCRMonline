import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Utensils, Zap, Clock, Users, CheckCircle2, ArrowRight, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';

const ProductRestaurant = () => {
  const { lang } = useLanguage();

  const t = {
    en: {
      headline: "From Order to Kitchen in Seconds.",
      sub: "Eliminate order delays, sync your servers with the kitchen, and give your guests the experience they deserve.",
      painSection: {
        title: "No more chaos.",
        q1: "Orders taking too long?",
        a1: "Direct sync between tables and KDS (Kitchen Display System).",
        q2: "Lost or wrong orders?",
        a2: "Digital order tracking from entry to delivery with zero paper waste.",
        q3: "Servers overwhelmed?",
        a3: "Automated status updates. Servers know exactly when food is ready.",
      },
      features: [
        { title: "Smart KDS Interface", desc: "Digital kitchen display that organizes orders by priority." },
        { title: "Floor & Table Management", desc: "Visual map of your dining area with real-time occupancy status." },
        { title: "Mobile Ordering", desc: "Servers take orders on any device, sent instantly to the kitchen." },
      ],
      cta: "Book Restaurant Demo"
    },
    ar: {
      headline: "من الطلب إلى المطبخ في ثوانٍ معدودة.",
      sub: "تخلص من تأخير الطلبات، وحقق التزامن بين النوادل والمطبخ، وامنح ضيوفك التجربة التي يستحقونها.",
      painSection: {
        title: "لا مزيد من الفوضى.",
        q1: "هل الطلبات تأخذ وقتاً طويلاً؟",
        a1: "مزامنة مباشرة بين الطاولات ونظام عرض المطبخ (KDS).",
        q2: "طلبات مفقودة أو خاطئة؟",
        a2: "تتبع رقمي للطلب من الدخول حتى التسليم مع صفر ورق ضائع.",
        q3: "النوادل في حالة ضغط دائم؟",
        a3: "تحديثات تلقائية للحالة. النوادل يعرفون بالضبط متى يكون الطعام جاهزاً.",
      },
      features: [
        { title: "واجهة KDS ذكية", desc: "عرض رقمي للمطبخ ينظم الطلبات حسب الأولوية." },
        { title: "إدارة الطاولات والصالات", desc: "خريطة مرئية لمنطقة الطعام مع حالة الإشغال في الوقت الفعلي." },
        { title: "الطلب عبر الجوال", desc: "النوادل يأخذون الطلبات على أي جهاز، وترسل فوراً للمطبخ." },
      ],
      cta: "احجز ديمو للمطاعم"
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
        <div style={{ background: '#fff7ed', padding: '40px', borderRadius: '32px', border: '1px solid #ffedd5' }}>
          <h2 style={{ color: '#ea580c', fontSize: '32px', fontWeight: '800', marginBottom: '32px' }}>{t.painSection.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h4 style={{ color: '#ea580c', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q1}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a1}</p>
            </div>
            <div>
              <h4 style={{ color: '#ea580c', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q2}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a2}</p>
            </div>
            <div>
              <h4 style={{ color: '#ea580c', fontWeight: '700', marginBottom: '8px' }}>❌ {t.painSection.q3}</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>✅ {t.painSection.a3}</p>
            </div>
          </div>
        </div>

        <div style={{ 
          background: '#f97316', 
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
              <Monitor color="rgba(255,255,255,0.8)" size={32} />
              <div>
                <h4 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>{f.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.7)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
          <Link to="/demo" style={{ 
            marginTop: '20px', 
            background: 'white', 
            color: '#f97316', 
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

export default ProductRestaurant;
