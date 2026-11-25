import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, LogIn, Globe } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { t, isRTL, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const loggedInUser = await login(email, password);
      const requestedPath = location.state?.from?.pathname;
      const allowed = Array.isArray(loggedInUser?.allowedPages) ? loggedInUser.allowedPages : [];
      const isAdmin = loggedInUser?.role === 'admin' || loggedInUser?.role === 'super_admin';

      let target;
      if (requestedPath && requestedPath !== '/login') {
        target = requestedPath;
      } else {
        // Landing chain (Ali 2026-11-25: "تمام يتحول على الصفقات"):
        // Deals when permitted, else the first permitted work page, else /my-profile.
        const isLandingAllowed = (p) => isAdmin || allowed.includes(p) || (p === '/deals' && allowed.includes('/my-deals'));
        target = ['/deals', '/customers', '/tasks', '/dashboard'].find(isLandingAllowed) || '/my-profile';
      }

      navigate(target, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || t('auth.toastInvalidCredentials'));
    }
  };

  return (
    <div className="login-container auth-entry-page auth-login-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .auth-entry-page.login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: radial-gradient(circle at top right, #4f46e5 0%, #1e1b4b 100%);
          padding: 24px;
          position: relative;
          overflow: hidden;
          font-family: inherit;
        }
        .auth-entry-page.login-container::before {
          content: "";
          position: absolute;
          width: 500px;
          height: 500px;
          background: rgba(99, 102, 241, 0.2);
          filter: blur(100px);
          top: -100px;
          left: -100px;
          border-radius: 50%;
        }
        .auth-entry-page .login-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 48px;
          border-radius: 24px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          width: 100%;
          max-width: 440px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-entry-page .login-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .auth-entry-page .login-header h1 {
          color: white;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.04em;
          margin-bottom: 8px;
        }
        .auth-entry-page .login-header p {
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          font-weight: 500;
        }
        .auth-entry-page .lang-toggle-btn {
          position: absolute;
          top: 20px;
          ${isRTL ? 'left: 20px;' : 'right: 20px;'}
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .auth-entry-page .lang-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .auth-entry-page .form-group {
          margin-bottom: 20px;
          position: relative;
        }
        .auth-entry-page .form-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          letter-spacing: 0.02em;
        }
        .auth-entry-page .input-wrapper {
          position: relative;
        }
        .auth-entry-page .input-wrapper svg {
          position: absolute;
          ${isRTL ? 'right: 16px;' : 'left: 16px;'}
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
          width: 18px;
          transition: all 0.3s;
        }
        .auth-entry-page .form-group input {
          width: 100%;
          ${isRTL ? 'padding: 14px 48px 14px 14px;' : 'padding: 14px 14px 14px 48px;'}
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.3s;
          background: rgba(255, 255, 255, 0.05);
          color: white;
          box-sizing: border-box;
        }
        .auth-entry-page .form-group input:focus {
          background: rgba(255, 255, 255, 0.1);
          border-color: #6366f1;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
          outline: none;
        }
        .auth-entry-page .btn-login {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          border: none;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 16px;
          box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4);
        }
        .auth-entry-page .btn-login:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.6);
        }
        .auth-entry-page .error-message {
          background-color: #fee2e2;
          color: #dc2626;
          padding: 10px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 20px;
          text-align: center;
          border: 1px solid #fecaca;
        }
        .auth-entry-page .forgot-password {
          text-align: ${isRTL ? 'left' : 'right'};
          margin-top: 12px;
        }
        .auth-entry-page .forgot-password a {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s;
        }
        .auth-entry-page .forgot-password a:hover {
          color: white;
        }
        .auth-entry-page .register-link {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: center;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
        }
        .auth-entry-page .register-link a {
          color: white;
          font-weight: 700;
          text-decoration: none;
          margin-left: 4px;
        }
        .auth-entry-page .register-link a:hover {
          text-decoration: underline;
        }
      `}</style>
      
      <div className="login-card">
        <button
          type="button"
          className="lang-toggle-btn"
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          title="Toggle Language"
        >
          <Globe size={13} />
          {language === 'ar' ? 'English' : 'العربية'}
        </button>

        <div className="login-header">
          <h1>Tashgheel CRM</h1>
          <p>{t('auth.loginSubtitle')}</p>
        </div>

        {error && <div className="error-message">{error}</div>}

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

          <div className="form-group">
            <label>{t('auth.lblPassword')}</label>
            <div className="input-wrapper">
              <Lock />
              <input 
                type="password" 
                placeholder={t('auth.placeholderPassword')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
          </div>

          <button type="submit" className="btn-login">
            <LogIn size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
            {t('auth.btnLogin')}
          </button>

          <div className="forgot-password">
            <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
          </div>

          <div className="register-link">
            {t('auth.dontHaveAccount')} <Link to="/register">{t('auth.registerLink')}</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
