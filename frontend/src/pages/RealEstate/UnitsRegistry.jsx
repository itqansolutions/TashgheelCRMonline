import React, { useState, useEffect } from 'react';
import { Building2, Plus, Search, Filter, Home, Layers, Maximize, UserCheck, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const UnitsRegistry = () => {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({
        project_name: '', unit_number: '', type: 'Apartment', floor: '', area: '', price: ''
    });

    const fetchUnits = async () => {
        try {
            const res = await api.get('/api/re-units');
            setUnits(res.data.data);
        } catch (err) {
            toast.error('Failed to load units inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUnits(); }, []);

    const handleAddUnit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/re-units', formData);
            toast.success('Unit added to registry');
            setShowAddModal(false);
            setFormData({ project_name: '', unit_number: '', type: 'Apartment', floor: '', area: '', price: '' });
            fetchUnits();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add unit');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Remove this unit from inventory?')) return;
        try {
            await api.delete(`/api/re-units/${id}`);
            toast.success('Unit removed');
            fetchUnits();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Delete failed');
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Available': return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', icon: <CheckCircle2 size={14}/> };
            case 'Reserved': return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', icon: <Clock size={14}/> };
            case 'Sold': return { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', icon: <XCircle size={14}/> };
            default: return { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', icon: null };
        }
    };

    const filteredUnits = units.filter(u => {
        const matchesFilter = filter === 'All' || u.status === filter;
        const matchesSearch = u.project_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             u.unit_number.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    return (
        <div style={{ padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Building2 size={32} color="var(--primary)"/> Units Inventory
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Manage your real estate stock and availability</p>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                    <Plus size={18}/> Add New Unit
                </button>
            </div>

            {/* Filters Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, position: 'relative', minWidth: '250px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                    <input 
                        className="ap-input" 
                        placeholder="Search project or unit number..." 
                        style={{ paddingLeft: '40px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', padding: '4px', borderRadius: '10px' }}>
                    {['All', 'Available', 'Reserved', 'Sold'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setFilter(tab)}
                            style={{ 
                                padding: '8px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                                background: filter === tab ? 'white' : 'transparent',
                                color: filter === tab ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: filter === tab ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                                transition: '0.2s'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px' }}>Loading inventory...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {filteredUnits.length > 0 ? filteredUnits.map(u => {
                        const style = getStatusStyle(u.status);
                        return (
                            <div key={u.id} className="ap-card" style={{ padding: '20px', transition: '0.2s', position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{u.project_name}</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900 }}>Unit {u.unit_number}</div>
                                    </div>
                                    <div style={{ ...style, background: style.bg, color: style.color, padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', height: 'fit-content' }}>
                                        {style.icon} {u.status}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                        <Home size={14}/> {u.type}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                        <Layers size={14}/> Floor {u.floor}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                        <Maximize size={14}/> {u.area} m²
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                                        EGP {Number(u.price).toLocaleString()}
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Added {new Date(u.created_at).toLocaleDateString()}</div>
                                    {u.status === 'Available' && (
                                        <button 
                                            onClick={() => handleDelete(u.id)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                            title="Remove Unit"
                                        >
                                            <Trash2 size={16}/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    }) : (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px', background: 'rgba(0,0,0,0.02)', borderRadius: '14px', border: '2px dashed var(--glass-border)' }}>
                            <Building2 size={40} color="var(--glass-border)" style={{ marginBottom: '12px' }}/>
                            <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>No units found matching your criteria.</div>
                        </div>
                    )}
                </div>
            )}

            {/* Add Unit Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="ap-card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
                        <h3 style={{ marginTop: 0, fontWeight: 900, marginBottom: '24px' }}>Register New Unit</h3>
                        <form onSubmit={handleAddUnit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div className="ap-form-group">
                                    <label className="ap-label">Project Name</label>
                                    <input className="ap-input" required value={formData.project_name} onChange={e => setFormData({...formData, project_name: e.target.value})} placeholder="e.g. New Cairo" />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Unit Number</label>
                                    <input className="ap-input" required value={formData.unit_number} onChange={e => setFormData({...formData, unit_number: e.target.value})} placeholder="e.g. 302" />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Type</label>
                                    <select className="ap-input" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                        <option value="Apartment">Apartment</option>
                                        <option value="Villa">Villa</option>
                                        <option value="Commercial">Commercial</option>
                                        <option value="Office">Office</option>
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Price (EGP)</label>
                                    <input className="ap-input" type="number" required value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Floor</label>
                                    <input className="ap-input" type="number" required value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Area (m²)</label>
                                    <input className="ap-input" type="number" required value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" className="btn-save" style={{ flex: 1, justifyContent: 'center' }}>Save Unit</button>
                                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'none', border: '1px solid var(--glass-border)', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnitsRegistry;
