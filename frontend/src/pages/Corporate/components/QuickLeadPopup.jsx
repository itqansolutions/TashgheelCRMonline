import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { MessageSquare, X, Send } from 'lucide-react';

const QuickLeadPopup = () => {
  const { lang } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ businessType: '', whatsapp: '' });

  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 15000); // Show after 15s
    return () => clearTimeout(timer);
  }, []);

  const t = {
    en: {
      title: "Talk to an Expert",
      sub: "Tell us your business type and we'll contact you.",
      placeholderType: "Business Type (Retail, Restaurant, etc.)",
      placeholderWa: "WhatsApp Number",
      cta: "Send Request",
      thanks: "Thank you! We'll contact you soon."
    },
    ar: {
      title: "تحدث مع خبير",
      sub: "أخبرنا بنوع نشاطك وسنتواصل معك.",
      placeholderType: "نوع النشاط (تجارة، مطعم، إلخ)",
      placeholderWa: "رقم الواتساب",
      cta: "إرسال الطلب",
      thanks: "شكراً لك! سنتواصل معك قريباً."
    }
  }[lang];

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Lead Captured:', formData);
    // Ideally send to backend here
    alert(t.thanks);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '30px',
      right: '30px',
      width: '350px',
      backgroundColor: 'white',
      borderRadius: '24px',
      boxShadow: 'var(--shadow-xl)',
      border: '1px solid var(--border)',
      zIndex: 2000,
      padding: '24px',
      animation: 'slideUp 0.5s ease'
    }}>
      <button 
        onClick={() => setIsOpen(false)}
        style={{ background: 'none', color: 'var(--text-muted)', position: 'absolute', top: '15px', right: '15px' }}>
        <X size={20} />
      </button>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ backgroundColor: 'rgba(37, 211, 102, 0.1)', width: '50px', height: '50px', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyCenter: 'center', marginBottom: '15px' }}>
          <MessageSquare color="#25D366" size={28} style={{margin: 'auto'}} />
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>{t.title}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t.sub}</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input 
          type="text" 
          placeholder={t.placeholderType} 
          required
          style={inputStyle}
          onChange={e => setFormData({ ...formData, businessType: e.target.value })}
        />
        <input 
          type="tel" 
          placeholder={t.placeholderWa} 
          required
          style={inputStyle}
          onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
        />
        <button type="submit" style={{
          backgroundColor: '#25D366',
          color: 'white',
          padding: '14px',
          borderRadius: '12px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginTop: '8px'
        }}>
          {t.cta} <Send size={18} />
        </button>
      </form>

      <style>{`
        @keyframes slideUp { from { transform: translateY(100px); opacity:0; } to { transform: translateY(0); opacity:1; } }
      `}</style>
    </div>
  );
};

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s',
  focus: { borderColor: 'var(--primary)' }
};

export default QuickLeadPopup;
