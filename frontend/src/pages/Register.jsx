import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Building2, UserPlus, CheckCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    companyName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await api.post('/auth/register', formData);
      toast.success('Registration successful! Welcome to Tashgheel.');
      // After registration, we redirect to login or automatically log them in
      // In our authController, register returns a token, but the frontend usually handles login state via context.
      // For simplicity, let's redirect to login for now or we could call a login function.
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
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
          padding: 40px;
          border-radius: 24px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          width: 100%;
          max-width: 480px;
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
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .form-group {
          margin-bottom: 20px;
          position: relative;
        }
        .form-group.full { grid-column: span 2; }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          letter-spacing: 0.02em;
        }
        .input-wrapper {
          position: relative;
        }
        .input-wrapper svg {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
          width: 16px;
          transition: all 0.3s;
        }
        .form-group input {
          width: 100%;
          padding: 12px 12px 12px 42px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s;
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }
        .form-group input:focus {
          background: rgba(255, 255, 255, 0.1);
          border-color: #6366f1;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
          outline: none;
        }
        .btn-register {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          transition: all 0.3s;
          margin-top: 10px;
          cursor: pointer;
        }
        .btn-register:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.5);
        }
        .error-message {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          padding: 12px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 20px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          text-align: center;
        }
        .card-footer {
          margin-top: 24px;
          text-align: center;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.5);
        }
        .card-footer a {
          color: white;
          font-weight: 700;
          text-decoration: none;
        }
        .card-footer a:hover {
          text-decoration: underline;
        }
      `}</style>

      <div className="login-card">
        <div className="login-header">
          <h1>Join Tashgheel</h1>
          <p>Create your organization workspace</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Company / Organization Name</label>
            <div className="input-wrapper">
              <Building2 />
              <input 
                type="text" 
                name="companyName"
                placeholder="e.g. Acme Corporation" 
                value={formData.companyName}
                onChange={handleChange}
                required 
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Full Name</label>
              <div className="input-wrapper">
                <User />
                <input 
                  type="text" 
                  name="name"
                  placeholder="John Doe" 
                  value={formData.name}
                  onChange={handleChange}
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label>Work Email</label>
              <div className="input-wrapper">
                <Mail />
                <input 
                  type="email" 
                  name="email"
                  placeholder="john@company.com" 
                  value={formData.email}
                  onChange={handleChange}
                  required 
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-wrapper">
              <Lock />
              <input 
                type="password" 
                name="password"
                placeholder="Min. 8 characters" 
                value={formData.password}
                onChange={handleChange}
                required 
              />
            </div>
          </div>

          <button type="submit" className="btn-register" disabled={loading}>
            {loading ? 'Setting up workspace...' : <><UserPlus size={18} /> Create Workspace</>}
          </button>

          <div className="card-footer">
            Already have a workspace? <Link to="/login">Sign In</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
