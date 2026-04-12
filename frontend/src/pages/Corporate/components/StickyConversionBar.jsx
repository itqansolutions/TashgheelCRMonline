import React from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { Rocket, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const StickyConversionBar = () => {
  const { lang } = useLanguage();
  const [isVisible, setIsVisible] = React.useState(true);

  const t = {
    en: {
      text: "🚀 Start Your Free Trial Today — No Credit Card Required.",
      cta: "Join Now"
    },
    ar: {
      text: "🚀 ابدأ تجربتك المجانية اليوم — لا يتطلب بطاقة ائتمان.",
      cta: "اشترك الآن"
    }
  }[lang];

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '40px',
      backgroundColor: 'var(--text-main)',
      color: 'white',
      zIndex: 1100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
      fontSize: '14px',
      fontWeight: '600',
      padding: '0 5%'
    }}>
      <span>{t.text}</span>
      <Link to="/register" style={{
        backgroundColor: 'var(--primary)',
        color: 'white',
        padding: '4px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '800'
      }}>
        {t.cta}
      </Link>
      <button 
        onClick={() => setIsVisible(false)}
        style={{ background: 'none', color: 'rgba(255,255,255,0.5)', position: 'absolute', right: '20px' }}>
        <X size={16} />
      </button>
    </div>
  );
};

export default StickyConversionBar;
