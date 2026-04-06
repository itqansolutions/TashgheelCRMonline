import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Handshake, DollarSign, Calendar, Target, User } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';

const Deals = () => {
  const { deals, fetchDeals, customers, fetchCustomers, loading } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    value: 0,
    pipeline_stage: 'discovery',
    client_id: '',
    assigned_to: ''
  });

  useEffect(() => {
    fetchDeals();
    if (customers.length === 0) fetchCustomers();
  }, []);

  const handleOpenModal = (deal = null) => {
    if (deal) {
      setEditingDeal(deal);
      setFormData({
        title: deal.title || '',
        value: deal.value || 0,
        pipeline_stage: deal.pipeline_stage || 'discovery',
        client_id: deal.client_id || '',
        assigned_to: deal.assigned_to || ''
      });
    } else {
      setEditingDeal(null);
      setFormData({ title: '', value: 0, pipeline_stage: 'discovery', client_id: '', assigned_to: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.client_id) return toast.error('Please select a customer');

    try {
      if (editingDeal) {
        await api.put(`/deals/${editingDeal.id}`, formData);
        toast.success('Deal updated');
      } else {
        await api.post('/deals', formData);
        toast.success('Deal created');
      }
      fetchDeals(false);
      setIsModalOpen(false);
    } catch (err) {
      toast.error('Failed to save deal');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this deal?')) {
      try {
        await api.delete(`/deals/${id}`);
        toast.success('Deal deleted');
        fetchDeals(false);
      } catch (err) {
        toast.error('Failed to delete');
      }
    }
  };

  const columns = [
    { 
      key: 'title', 
      label: 'Deal Title',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: '#fff7ed', color: '#f59e0b' }}>
            <Handshake size={16} />
          </div>
          <span style={{ fontWeight: '600' }}>{val}</span>
        </div>
      )
    },
    { 
      key: 'value', 
      label: 'Value',
      render: (val) => <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{val} EGP</span>
    },
    { 
      key: 'pipeline_stage', 
      label: 'Stage',
      render: (val) => {
        const colors = {
          discovery: '#eff6ff', 
          proposal: '#fdf4ff', 
          negotiation: '#fff7ed', 
          won: '#f0fdf4', 
          lost: '#fef2f2'
        };
        const textColors = {
          discovery: '#2563eb', 
          proposal: '#a21caf', 
          negotiation: '#d97706', 
          won: '#16a34a', 
          lost: '#dc2626'
        };
        return (
          <span className="status-badge" style={{ background: colors[val], color: textColors[val] }}>
            {val}
          </span>
        );
      }
    },
    { 
      key: 'client_name', 
      label: 'Customer',
      render: (val, item) => item.client_name || 'Unassigned'
    }
  ];

  return (
    <div className="deals-page">
      <style>{`
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; transition: background 0.2s; }
        .btn-add:hover { background-color: var(--primary-hover); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg-main); outline: none; }
        .btn-cancel { background: #f1f5f9; color: var(--text-muted); padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .btn-save { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; }
      `}</style>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Sales Pipeline</h2>
          <p style={{ color: 'var(--text-muted)' }}>Track your deals from discovery to closing.</p>
        </div>
        <button label="add deal control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          Create Deal
        </button>
      </div>

      <DataTable 
        title="Active Deals"
        columns={columns}
        data={deals}
        loading={loading}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingDeal ? 'Update Deal' : 'New Sales Deal'}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit}>
              {editingDeal ? 'Update Deal' : 'Create Deal'}
            </button>
          </>
        }
      >
        <form className="form-grid">
          <div className="form-group full">
            <label>Deal Title</label>
            <input 
              type="text" 
              placeholder="e.g. Website Overhaul Project"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Select Customer</label>
            <select 
              value={formData.client_id}
              onChange={(e) => setFormData({...formData, client_id: e.target.value})}
              required
            >
              <option value="">-- Select Customer --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.company_name ? `(${c.company_name})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Deal Value (EGP)</label>
            <input 
              type="number" 
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Pipeline Stage</label>
            <select 
              value={formData.pipeline_stage}
              onChange={(e) => setFormData({...formData, pipeline_stage: e.target.value})}
            >
              <option value="discovery">Discovery</option>
              <option value="proposal">Proposal</option>
              <option value="negotiation">Negotiation</option>
              <option value="won">Won (Closed)</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div className="form-group">
            <label>Deal Owner</label>
            <select 
              value={formData.assigned_to}
              onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
            >
              <option value="">Unassigned</option>
              {/* This would ideally map to a users list fetched via DataContext */}
              <option value="1">Me (Current User)</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Deals;
