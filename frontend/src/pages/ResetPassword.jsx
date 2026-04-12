import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token.');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    // Password strength check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError('Password must be at least 8 characters, include uppercase, lowercase, and a number.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Token expired or invalid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <style>{`
        .login-container {
          display: flex; justify-content: center; align-items: center; min-height: 100vh;
          background: radial-gradient(circle at top right, #4f46e5 0%, #1e1b4b 100%); padding: 24px;
        }
        .login-card {
          background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px);
          padding: 48px; border-radius: 24px; width: 100%; max-width: 440px;
          border: 1px solid rgba(255, 255, 255, 0.1); animation: slideUp 0.6s ease-out;
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        h1 { color: white; font-size: 28px; font-weight: 800; margin-bottom: 12px; text-align: center; }
        p { color: rgba(255, 255, 255, 0.6); text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; color: white; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
        .input-wrapper { position: relative; }
        .input-wrapper svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: rgba(255, 255, 255, 0.4); width: 18px; }
        input { width: 100%; padding: 14px 14px 14px 48px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; color: white; transition: all 0.3s; }
        input:focus { outline: none; border-color: #6366f1; background: rgba(255, 255, 255, 0.1); }
        .btn-submit { width: 100%; padding: 14px; background: #6366f1; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s; display: flex; justify-content: center; align-items: center; gap: 10px; }
        .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(99, 102, 241, 0.4); }
        .error-box { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 14px; border-radius: 12px; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; font-size: 14px; }
        .success-box { text-align: center; padding: 20px; }
        .success-icon { width: 48px; height: 48px; color: #10b981; margin: 0 auto 16px; }
      `}</style>

      <div className="login-card">
        {success ? (
          <div className="success-box">
            <CheckCircle className="success-icon" />
            <h1>Success!</h1>
            <p>Your password has been updated. Redirecting you to login...</p>
          </div>
        ) : (
          <>
            <h1>Reset Password</h1>
            <p>Enter your new password below.</p>

            {error && (
              <div className="error-box">
                <XCircle size={18} /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>New Password</label>
                <div className="input-wrapper">
                  <Lock />
                  <input 
                    type="password" 
                    placeholder="Min. 8 chars" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <div className="input-wrapper">
                  <Lock />
                  <input 
                    type="password" 
                    placeholder="Repeat password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <button type="submit" className="btn-submit" disabled={loading || !!error}>
                {loading ? <Loader2 className="animate-spin" /> : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
