import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/context/LanguageContext';
import { Globe, Menu, X, ArrowRight } from 'lucide-react';

const CorporateNavbar = () => {
  const { lang, toggleLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const t = {
    en: {
      brandSub: 'Powered by ITQAN Solutions',
      nav: [
        { label: 'Home', href: '#hero' },
        { label: 'Solutions', href: '#solutions' },
        { label: 'General CRM', href: '#general-crm' },
        { label: 'Real Estate CRM', href: '#real-estate-crm' },
        { label: 'Features', href: '#features' },
        { label: 'About', href: '#about' },
        { label: 'Contact', href: '#contact' },
      ],
      login: 'Login',
      tryDemo: 'Try Live Demo',
    },
    ar: {
      brandSub: 'بواسطة إتقان للحلول الذكية',
      nav: [
        { label: 'الرئيسية', href: '#hero' },
        { label: 'الحلول', href: '#solutions' },
        { label: 'الـ CRM العام', href: '#general-crm' },
        { label: 'CRM العقارات', href: '#real-estate-crm' },
        { label: 'المميزات', href: '#features' },
        { label: 'عن إتقان', href: '#about' },
        { label: 'اتصل بنا', href: '#contact' },
      ],
      login: 'تسجيل الدخول',
      tryDemo: 'تجربة الديمو الحي',
    },
  }[lang];

  const handleNavClick = (e, href) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const targetElement = document.querySelector(href);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo and Name */}
        <a href="#hero" onClick={(e) => handleNavClick(e, '#hero')} className="flex items-center gap-3 group">
          <img
            src="/favicon.png"
            alt="ITQAN Solutions Logo"
            className="w-10 h-10 object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
              TASHGHEEL <span className="text-indigo-600">CRM</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">
              {t.brandSub}
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6">
          {t.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors py-1"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right Side Actions: Language + Auth CTAs */}
        <div className="hidden lg:flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all"
            title="Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-slate-600" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>

          {/* Login CTA: Existing /login route */}
          <Link
            to="/login"
            className="text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors px-3 py-2"
          >
            {t.login}
          </Link>

          {/* Try Live Demo CTA: Existing /register route */}
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 transition-all duration-200"
          >
            <span>{t.tryDemo}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            onClick={toggleLanguage}
            type="button"
            className="p-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg"
          >
            {lang === 'en' ? 'AR' : 'EN'}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-700 hover:text-indigo-600 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-6 space-y-3 shadow-xl">
          <div className="flex flex-col space-y-2">
            {t.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="text-base font-semibold text-slate-700 hover:text-indigo-600 py-2 border-b border-slate-100"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              {t.login}
            </Link>
            <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              <span>{t.tryDemo}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default CorporateNavbar;
