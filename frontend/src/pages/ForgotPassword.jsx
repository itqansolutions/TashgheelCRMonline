import React, { useState } from 'react';
import { Mail, ArrowLeft, Send, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';

const ForgotPassword = () => {
  const { t, isRTL } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
      toast.success(t('auth.toastResetSent', 'Reset link sent!'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.errorOccurred', 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: radial-gradient(circle at top right, #4f46e5 0%, #1e1b4b 100%);
          padding: 24px;
        }
        .login-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          padding: 48px;
          border-radius: 24px;
          width: 100%;
          max-width: 440px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: slideUp 0.6s ease-out;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        h1 { color: white; font-size: 28px; font-weight: 800; margin-bottom: 12px; text-align: center; }
        p { color: rgba(255, 255, 255, 0.6); text-align: center; margin-bottom: 30px; line-height: 1.5; }
        .form-group { margin-bottom: 24px; }
        .form-group label { display: block; color: white; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
        .input-wrapper { position: relative; }
        .input-wrapper svg { position: absolute; ${isRTL ? 'right: 16px;' : 'left: 16px;'} top: 50%; transform: translateY(-50%); color: rgba(255, 255, 255, 0.4); width: 18px; }
        input { width: 100%; ${isRTL ? 'padding: 14px 48px 14px 14px;' : 'padding: 14px 14px 14px 48px;'} background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; color: white; transition: all 0.3s; box-sizing: border-box; }
        input:focus { outline: none; border-color: #6366f1; background: rgba(255, 255, 255, 0.1); }
        .btn-submit { width: 100%; padding: 14px; background: #6366f1; color: white; border: none; border-radius: 12px; font-weight: 700; display: flex; justify-content: center; align-items: center; gap: 10px; cursor: pointer; transition: all 0.3s; }
        .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(99, 102, 241, 0.4); }
        .back-to-login { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 24px; color: rgba(255, 255, 255, 0.5); font-size: 14px; text-decoration: none; transition: color 0.3s; }
        .back-to-login:hover { color: white; }
        .success-state { text-align: center; color: white; }
        .success-icon { width: 64px; height: 64px; color: #10b981; margin: 0 auto 20px; }
      `}</style>
      
      <div className="login-card">
        {!submitted ? (
          <>
            <h1>{t('auth.forgotPassword')}</h1>
            <p>{t('auth.resetSubtitle')}</p>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>{t('auth.lblEmail')}</label>
                <div className="input-wrapper">
                  <Mail />
                  <input 
                    type="email" 
                    placeholder={t('auth.placeholderEmail')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                  />
                </div>
              </div>
              
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? t('common.loading', 'Sending...') : <><Send size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /> {t('auth.btnSendReset')}</>}
              </button>
            </form>
          </>
        ) : (
          <div className="success-state">
            <CheckCircle className="success-icon" />
            <h1>Email Sent!</h1>
            <p>We've sent a password reset link to <strong className="num-en">{email}</strong>. Please check your inbox (and spam folder).</p>
            <p style={{fontSize: '13px'}}>Link expires in 15 minutes.</p>
          </div>
        )}
        
        <Link to="/login" className="back-to-login">
          <ArrowLeft size={16} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /> {t('auth.backToLogin')}
        </Link>
      </div>
    </div>
  );
};

export default ForgotPassword;
