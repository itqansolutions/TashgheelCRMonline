import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, LogIn } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password');
    }
  };

  return (
    <div className="login-container">
      <style>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: radial-gradient(circle at top right, #4f46e5 0%, #1e1b4b 100%);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .login-container::before {
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
        .login-card {
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
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .login-header h1 {
          color: white;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.04em;
          margin-bottom: 12px;
        }
        .login-header p {
          color: rgba(255, 255, 255, 0.6);
          font-size: 15px;
          font-weight: 500;
        }
        .form-group {
          margin-bottom: 20px;
          position: relative;
        }
        .form-group label {
          display: block;
          margin-bottom: 10px;
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          letter-spacing: 0.02em;
        }
        .input-wrapper {
          position: relative;
        }
        .input-wrapper svg {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
          width: 18px;
          transition: all 0.3s;
        }
        .form-group input {
          width: 100%;
          padding: 14px 14px 14px 48px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.3s;
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }
        .form-group input:focus {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--secondary);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
          outline: none;
        }
        .form-group input:focus + svg {
          color: white;
        }
        .btn-login {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          transition: all 0.3s;
          margin-top: 16px;
          box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4);
        }
        .btn-login:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.6);
        }
        .btn-login:active {
          transform: translateY(0);
        }
        .error-message {
          background-color: #fee2e2;
          color: var(--danger);
          padding: 10px;
          border-radius: 6px;
          font-size: 13px;
          margin-bottom: 20px;
          text-align: center;
          border: 1px solid #fecaca;
        }
        .forgot-password {
          text-align: right;
          margin-top: 12px;
        }
        .forgot-password a {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 600;
          transition: color 0.2s;
        }
        .forgot-password a:hover {
          color: white;
        }
      `}</style>
      
      <div className="login-card">
        <div className="login-header">
          <h1>Tashgheel CRM</h1>
          <p>Login to your account</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <div className="input-wrapper">
              <Mail />
              <input 
                type="email" 
                placeholder="yours@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-wrapper">
              <Lock />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
          </div>

          <button type="submit" className="btn-login">
            <LogIn size={20} />
            Sign In
          </button>

          <div className="forgot-password">
            <a href="#">Forgot Password?</a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
