import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Globe, Menu, X, Rocket } from 'lucide-react';

const CorporateNavbar = () => {
  const { lang, toggleLanguage } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const t = {
    en: {
      solutions: 'Solutions',
      about: 'About',
      portfolio: 'Portfolio',
      contact: 'Contact',
      demo: 'Try Live Demo',
      login: 'Login',
    },
    ar: {
      solutions: 'حلولنا',
      about: 'عن إتقان',
      portfolio: 'أعمالنا',
      contact: 'اتصل بنا',
      demo: 'جرب الديمو',
      login: 'دخول',
    }
  }[lang];

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '80px',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 5%',
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
      transition: 'all 0.3s ease'
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          background: 'var(--primary)',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white'
        }}>
          <Rocket size={24} />
        </div>
        <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
          Itqan <span style={{ color: 'var(--primary)' }}>Solutions</span>
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        {/* Desktop Links */}
        <div className="desktop-links" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link to="/solutions" style={linkStyle}>{t.solutions}</Link>
          <Link to="/about" style={linkStyle}>{t.about}</Link>
          <Link to="/portfolio" style={linkStyle}>{t.portfolio}</Link>
          <Link to="/contact" style={linkStyle}>{t.contact}</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={toggleLanguage} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            color: 'var(--text-main)',
            fontWeight: '600'
          }}>
            <Globe size={20} />
            {lang.toUpperCase()}
          </button>

          <Link to="/login" style={{ color: 'var(--text-main)', fontWeight: '600' }}>
            {t.login}
          </Link>

          <Link to="/demo" style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '12px',
            fontWeight: '700',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
            transition: 'transform 0.2s',
          }} onMouseEnter={e => e.target.style.transform = 'translateY(-2px)'}
             onMouseLeave={e => e.target.style.transform = 'translateY(0)'}>
            {t.demo}
          </Link>
        </div>
      </div>

      <style>{`
        @media (max-width: 992px) {
          .desktop-links { display: none !important; }
        }
      `}</style>
    </nav>
  );
};

const linkStyle = {
  color: 'var(--text-muted)',
  fontWeight: '600',
  transition: 'color 0.2s',
};

export default CorporateNavbar;
