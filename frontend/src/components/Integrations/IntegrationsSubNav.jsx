import React from 'react';
import { NavLink } from 'react-router-dom';
import { FileCheck, Share2, MessageCircle, Send, MessageSquare, Bot } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const IntegrationsSubNav = () => {
  const { t, isRTL } = useLanguage();
  const links = [
    { path: '/whatsapp-chat', label: t('subNav.integrations.whatsappChat'), icon: <MessageSquare size={16} /> },
    { path: '/marketing/whatsapp-chatbots', label: t('subNav.integrations.chatbots'), icon: <Bot size={16} /> },
    { path: '/marketing/whatsapp-campaigns', label: t('subNav.integrations.whatsappCampaigns'), icon: <Send size={16} /> },
    { path: '/integrations/whatsapp', label: t('subNav.integrations.whatsappSettings'), icon: <MessageCircle size={16} /> },
    { path: '/integrations/meta-forms', label: t('subNav.integrations.metaForms'), icon: <Share2 size={16} /> },
    { path: '/integrations/einvoice', label: t('subNav.integrations.einvoice'), icon: <FileCheck size={16} /> },
  ];

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        display: 'flex', gap: '6px', overflowX: 'auto', padding: '12px 24px',
        background: 'white', borderBottom: '1px solid #e2e8f0', marginBottom: '16px'
      }}
    >
      {links.map((link) => (
        <NavLink
          key={link.path}
          to={link.path}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
            borderRadius: '10px', fontSize: '13px', fontWeight: 800, textDecoration: 'none',
            whiteSpace: 'nowrap', transition: 'all 0.2s',
            background: isActive ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : '#f8fafc',
            color: isActive ? 'white' : '#64748b',
            boxShadow: isActive ? '0 4px 12px rgba(14,165,233,0.25)' : 'none',
          })}
        >
          {link.icon} {link.label}
        </NavLink>
      ))}
    </div>
  );
};

export default IntegrationsSubNav;
