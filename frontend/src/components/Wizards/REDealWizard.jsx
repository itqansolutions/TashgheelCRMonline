import React, { useState, useEffect } from 'react';
import { 
  Building, 
  User, 
  Calendar, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  AlertCircle,
  FileText
} from 'lucide-react';

export default function REDealWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [cRes, uRes] = await Promise.all([
        fetch('/api/customers', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/re-units', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const cJson = await cRes.json();
      const uJson = await uRes.json();
      setCustomers(cJson.data || []);
      setUnits((uJson.data || []).filter(u => u.status?.toLowerCase() === 'available'));
    } catch (err) {
        console.error('Wizard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReserve = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v2/real-estate/reserve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          unitId: selectedUnit,
          customerId: selectedCustomer,
          durationDays: parseInt(durationDays),
          notes
        })
      });

      const json = await response.json();
      if (json.status === 'success') {
        setResult(json);
        setStep(4);
        if (onComplete) onComplete(json);
      } else {
        setError(json.message || 'Reservation failed.');
      }
    } catch (err) {
      setError(err.message || 'Server error during reservation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl max-w-3xl mx-auto">
      {/* Wizard Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Real Estate Sales & Reservation Wizard
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Guided task-oriented process: Match Client $\rightarrow$ Match Unit $\rightarrow$ Execute Reservation
          </p>
        </div>
        <div className="text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full">
          Step {step} of 4
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="grid grid-cols-4 gap-2 mb-8">
        {['Select Client', 'Select Unit', 'Terms & Days', 'Completed'].map((lbl, idx) => (
          <div 
            key={lbl} 
            className={`text-center py-2 border-b-2 text-xs font-medium transition-all ${
              step === idx + 1 
                ? 'border-amber-500 text-amber-400 font-bold' 
                : step > idx + 1 
                ? 'border-emerald-500 text-emerald-400' 
                : 'border-slate-800 text-slate-500'
            }`}
          >
            {lbl}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Select Client */}
      {step === 1 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            Choose Client / Lead
          </label>
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-amber-500 text-sm"
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
          >
            <option value="">-- Select Client --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
          <div className="flex justify-end pt-4">
            <button
              disabled={!selectedCustomer}
              onClick={() => setStep(2)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
            >
              Next: Select Property Unit <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Property Unit */}
      {step === 2 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            Choose Available Property Unit
          </label>
          {units.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-sm">
              No Available property units found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {units.map((u) => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUnit(u.id)}
                  className={`p-3.5 border rounded-xl cursor-pointer transition-all ${
                    selectedUnit === u.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-slate-100 text-sm">{u.name || `Unit #${u.unit_number}`}</div>
                  <div className="text-xs text-slate-400 mt-1">Project: {u.project_name || 'N/A'}</div>
                  <div className="text-xs font-semibold text-emerald-400 mt-2">
                    EGP {Number(u.price || 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              disabled={!selectedUnit}
              onClick={() => setStep(3)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
            >
              Next: Reservation Terms <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Terms & Days */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Reservation Hold Duration (Days)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-amber-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Notes & Payment Schedule Expectations
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter customer preferences or installment notes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-amber-500 text-sm"
            />
          </div>
          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              disabled={submitting}
              onClick={handleReserve}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20"
            >
              {submitting ? 'Executing Command...' : 'Execute Reservation Command'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Completed */}
      {step === 4 && result && (
        <div className="text-center py-6 space-y-4">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-100">
            Property Reservation Executed Successfully!
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Domain event <code className="text-amber-400 font-mono">reservation.created.v1</code> was emitted to the EventBus.
            Timeline entry logged & notifications queued automatically.
          </p>
          <div className="pt-4">
            <button
              onClick={() => {
                setStep(1);
                setSelectedCustomer('');
                setSelectedUnit('');
                setResult(null);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-5 py-2.5 rounded-xl text-sm"
            >
              Reserve Another Property
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
