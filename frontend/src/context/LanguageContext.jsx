import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import enTranslations from '../locales/en.json';
import arTranslations from '../locales/ar.json';

const translations = {
  en: enTranslations,
  ar: arTranslations
};

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  // Read initial language, default to 'ar' for Arab market if not set, or 'en' if preferred.
  // We respect existing localStorage or default to 'ar'
  const [lang, setLangState] = useState(() => {
    return localStorage.getItem('itqan_lang') || localStorage.getItem('lang') || 'ar';
  });

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const isRTL = lang === 'ar';

  const setLanguage = useCallback((newLang) => {
    const validLang = newLang === 'en' ? 'en' : 'ar';
    setLangState(validLang);
    localStorage.setItem('itqan_lang', validLang);
    localStorage.setItem('lang', validLang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLanguage]);

  // Synchronize HTML & document attributes whenever lang changes
  useEffect(() => {
    const currentDir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', currentDir);
    document.documentElement.setAttribute('lang', lang);
    if (document.body) {
      document.body.setAttribute('dir', currentDir);
    }
  }, [lang]);

  /**
   * Helper function to translate keys with dot notation (e.g., 'common.save', 'sidebar.dashboard')
   * Supports:
   * 1. t('key')
   * 2. t('key', 'Default text')
   * 3. t('key', { name: 'John' })
   * 4. t('key', 'Default text with {name}', { name: 'John' })
   */
  const t = useCallback((keyPath, fallbackOrParams = {}, maybeParams = {}) => {
    if (!keyPath || typeof keyPath !== 'string') return '';

    let fallback = null;
    let params = {};

    if (typeof fallbackOrParams === 'string') {
      fallback = fallbackOrParams;
      if (maybeParams && typeof maybeParams === 'object') {
        params = maybeParams;
      }
    } else if (fallbackOrParams && typeof fallbackOrParams === 'object') {
      params = fallbackOrParams;
      if (typeof maybeParams === 'string') {
        fallback = maybeParams;
      }
    }

    const keys = keyPath.split('.');
    
    // 1. Try current language
    let result = keys.reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : null), translations[lang]);

    // 2. Fallback to English if missing in current language
    if (result === null && lang !== 'en') {
      result = keys.reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : null), translations.en);
    }

    // 3. Fallback to Arabic if missing in English
    if (result === null && lang === 'en') {
      result = keys.reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : null), translations.ar);
    }

    // 4. If still not found, return fallback string if provided, else the last segment of keyPath or keyPath itself
    if (result === null || typeof result !== 'string') {
      result = fallback !== null ? fallback : (keys[keys.length - 1] || keyPath);
    }

    // 5. Interpolate params: {{count}}, {count} or :count
    if (params && typeof params === 'object') {
      Object.keys(params).forEach((paramKey) => {
        const rawVal = params[paramKey];
        const val = rawVal !== undefined && rawVal !== null ? rawVal : '';
        result = result.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), val);
        result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), val);
        result = result.replace(new RegExp(`:${paramKey}\\b`, 'g'), val);
      });
    }

    return result;
  }, [lang]);

  const contextValue = useMemo(() => ({
    lang,
    dir,
    isRTL,
    toggleLanguage,
    setLanguage,
    t
  }), [lang, dir, isRTL, toggleLanguage, setLanguage, t]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
export const useTranslation = () => {
  const ctx = useContext(LanguageContext);
  return { t: ctx.t, i18n: { language: ctx.lang, changeLanguage: ctx.setLanguage } };
};

export default LanguageContext;
