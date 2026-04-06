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
          background-color: var(--bg-main);
          padding: 20px;
        }
        .login-card {
          background: var(--bg-card);
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 400px;
          border: 1px solid var(--border);
        }
        .login-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .login-header h1 {
          color: var(--primary);
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .login-header p {
          color: var(--text-muted);
          font-size: 14px;
        }
        .form-group {
          margin-bottom: 20px;
          position: relative;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-main);
        }
        .input-wrapper {
          position: relative;
        }
        .input-wrapper svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          width: 18px;
        }
        .form-group input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
          background-color: var(--bg-main);
          color: var(--text-main);
        }
        .form-group input:focus {
          border-color: var(--primary);
          outline: none;
        }
        .btn-login {
          width: 100%;
          padding: 12px;
          background-color: var(--primary);
          color: white;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          transition: background-color 0.2s;
          margin-top: 10px;
        }
        .btn-login:hover {
          background-color: var(--primary-hover);
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
          color: var(--primary);
          font-weight: 500;
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
