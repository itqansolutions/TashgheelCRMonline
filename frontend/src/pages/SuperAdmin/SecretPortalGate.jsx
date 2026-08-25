import React, { useState } from 'react';
import { ShieldAlert, Lock, Fingerprint, Cpu, ArrowRight, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const SecretPortalGate = ({ onAuthorized }) => {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const SECRET_PIN = 'T@shgheelYasmina89';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === SECRET_PIN) {
      toast.success('Protocol Authorized. Accessing Genesis Hub.');
      sessionStorage.setItem('ITQAN_CORE_AUTHORIZED', 'true');
      onAuthorized();
    } else {
      setAttempts(prev => prev + 1);
      toast.error(`Invalid Authorization Key. Attempt ${attempts + 1}`);
      setPin('');
      if (attempts >= 4) {
        window.location.href = '/dashboard';
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-md relative z-10 text-center space-y-6">
            <div className="inline-flex p-4 bg-indigo-50 border border-indigo-100 rounded-3xl shadow-md text-indigo-600">
                <ShieldAlert size={36} />
            </div>

            <div className="space-y-1">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">ITQAN Platform HUD</h1>
                <p className="text-slate-500 font-semibold text-xs">Super-Admin Authorization Protocol</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
                <div className="space-y-3 text-left">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Lock size={13} className="text-indigo-600" /> Security Passphrase
                    </label>
                    <div className="relative">
                        <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="password" 
                            autoFocus
                            placeholder="Enter Security Passphrase..." 
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400 placeholder:font-normal text-sm"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                        />
                    </div>
                </div>

                <button 
                    type="submit"
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20"
                >
                    Unlock Super-Admin Access
                    <ArrowRight size={16} />
                </button>

                <p className="text-[11px] text-slate-400">
                    Restricted multi-tenant management cockpit.
                </p>
            </form>

            <button 
                onClick={() => window.location.href = '/dashboard'}
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-semibold text-xs transition-colors"
            >
                <XCircle size={14} />
                Return to App Dashboard
            </button>
        </div>
    </div>
  );
};

export default SecretPortalGate;
