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
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/30 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px] animate-pulse delay-700" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
        </div>

        <div className="w-full max-w-md relative z-10 text-center space-y-8 animate-in zoom-in-95 duration-500">
            <div className="inline-flex p-5 bg-gradient-to-br from-indigo-600 to-indigo-400 rounded-[2.5rem] shadow-2xl shadow-indigo-600/40 relative">
                <ShieldAlert size={40} className="text-white" />
                <div className="absolute -inset-2 bg-indigo-500/20 rounded-[3rem] blur-xl animate-pulse" />
            </div>

            <div className="space-y-2">
                <h1 className="text-3xl font-black text-white tracking-tight uppercase">ITQAN Core Intelligence</h1>
                <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.3em] opacity-80">Restricted Platform Genesis Layer</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-slate-900/50 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/10 shadow-2xl space-y-6 relative group">
                {/* HUD Scanline */}
                <div className="absolute inset-x-0 h-1 bg-indigo-500/10 top-0 animate-scanline-fast pointer-events-none" />
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                            <Lock size={12} /> Key Authorization
                        </label>
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">AES-256 Encrypted</span>
                    </div>
                    <div className="relative group">
                        <Fingerprint className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20} />
                        <input 
                            type="password" 
                            autoFocus
                            placeholder="Enter Security Passphrase..." 
                            className="w-full pl-14 pr-6 py-5 bg-black/40 border border-white/5 rounded-2xl text-white font-black tracking-widest outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-800 placeholder:tracking-normal placeholder:font-bold"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                        />
                    </div>
                </div>

                <button 
                    type="submit"
                    className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 hover:shadow-indigo-600/40 active:scale-95"
                >
                    Authorize Execution
                    <ArrowRight size={18} />
                </button>

                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                    Unauthorized access to ITQAN Dynamics core infrastructure is strictly monitored.
                </p>
            </form>

            <button 
                onClick={() => window.location.href = '/dashboard'}
                className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-400 font-black text-[10px] uppercase tracking-widest transition-colors"
            >
                <XCircle size={14} />
                Return to Surface Layer
            </button>
        </div>

        <style>{`
            @keyframes scanline-fast {
                0% { top: 0%; opacity: 0; }
                5% { opacity: 1; }
                95% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
            }
            .animate-scanline-fast {
                animation: scanline-fast 4s linear infinite;
            }
        `}</style>
    </div>
  );
};

export default SecretPortalGate;
