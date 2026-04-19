import React, { useState, useEffect } from 'react';
import { Building2, Plus, Search, Filter, Home, Layers, Maximize, UserCheck, Trash2, CheckCircle2, XCircle, Clock, MapPin, X } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { safeArray } from '../../utils/dataUtils';

const UnitsRegistry = () => {
    const { user } = useAuth();
    const { users, customers, fetchCustomers, fetchUsers } = useData();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);

    // Security Gate: Redirect if not in Real Estate template
    if (user && user.template_name !== 'real_estate') {
        return <Navigate to="/dashboard" />;
    }

    const [formData, setFormData] = useState({
        project_name: '', unit_number: '', name: '', type: 'Apartment', floor: '', 
        area_sqm: '', price: '', vendor_id: '', responsible_person_id: '', 
        transaction_type: 'sale', rooms: 1, location: ''
    });

    const vendors = safeArray(customers).filter(c => c.entity_type === 'vendor');

    const fetchUnits = async () => {
        try {
            const res = await api.get('/re-units');
            setUnits(res.data.data);
        } catch (err) {
            toast.error('Failed to load units inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchUnits();
        if (users.length === 0) fetchUsers();
        if (customers.length === 0) fetchCustomers();
    }, []);

    const handleAddUnit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/re-units', formData);
            toast.success('Unit added successfully to your premium registry!');
            setShowAddModal(false);
            setFormData({ 
                project_name: '', unit_number: '', name: '', type: 'Apartment', floor: '', 
                area_sqm: '', price: '', vendor_id: '', responsible_person_id: '', 
                transaction_type: 'sale', rooms: 1, location: '' 
            });
            fetchUnits();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add unit');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to remove this property from the inventory? This action is permanent.')) return;
        try {
            await api.delete(`/re-units/${id}`);
            toast.success('Property removed from registry');
            fetchUnits();
        } catch (err) {
            toast.error('Delete failed');
        }
    };

    const getStatusConfig = (status) => {
        const s = status?.toLowerCase() || 'unknown';
        switch (s) {
            case 'available': return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', icon: <CheckCircle2 size={13}/>, glow: 'status-glow-success' };
            case 'reserved': return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', icon: <Clock size={13}/>, glow: 'status-glow-warning' };
            case 'sold': return { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', icon: <XCircle size={13}/>, glow: 'status-glow-danger' };
            default: return { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', icon: null, glow: '' };
        }
    };

    const filteredUnits = safeArray(units).filter(u => {
        const matchesFilter = filter === 'All' || u.status?.toLowerCase() === filter.toLowerCase();
        const matchesSearch = (u.project_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                             (u.unit_number?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    return (
        <div className="wow-reveal" style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
            {/* Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--grad-premium)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 8px 16px rgba(79, 70, 229, 0.2)' }}>
                            <Building2 size={28} />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
                            Property Registry
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginLeft: '72px' }}>
                        Real Estate Inventory • <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{units.length} Units Tracked</span>
                    </p>
                </div>
                <button onClick={() => setShowAddModal(true)} className="btn-primary-premium">
                    <Plus size={20} strokeWidth={3} />
                    Register New Unit
                </button>
            </div>

            {/* Controls Bar */}
            <div className="ap-card" style={{ padding: '12px 16px', marginBottom: '32px', display: 'flex', gap: '24px', alignItems: 'center', background: 'var(--glass-bg)' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                    <input 
                        className="ap-input" 
                        placeholder="Search projects, buildings or unit codes..." 
                        style={{ paddingLeft: '48px', border: 'none', background: 'transparent' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.03)', padding: '5px', borderRadius: '12px' }}>
                    {['All', 'Available', 'Reserved', 'Sold'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setFilter(tab)}
                            style={{ 
                                padding: '8px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 800,
                                background: filter === tab ? 'white' : 'transparent',
                                color: filter === tab ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: filter === tab ? 'var(--shadow-md)' : 'none',
                                transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>
                    <div className="wow-float" style={{ marginBottom: '16px' }}><Building2 size={48} opacity={0.3}/></div>
                    <p style={{ fontWeight: 600 }}>Syncing Property Inventory...</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '28px' }}>
                    {filteredUnits.length > 0 ? filteredUnits.map((u, i) => {
                        const config = getStatusConfig(u.status);
                        return (
                            <div key={u.id} className={`ap-card delay-${(i % 4) + 1} wow-reveal`} style={{ padding: '0', overflow: 'hidden' }}>
                                {/* Card Header with Glow */}
                                <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)', position: 'relative' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                                                {u.project_name || 'Individual Property'}
                                            </div>
                                            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: 'var(--text-main)' }}>
                                                Unit {u.unit_number}
                                            </h3>
                                        </div>
                                        <div className={config.glow} style={{ ...config, background: config.bg, color: config.color, padding: '6px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                            {config.icon} {u.status || 'Available'}
                                        </div>
                                    </div>
                                </div>

                                {/* Main Details */}
                                <div style={{ padding: '24px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(79, 70, 229, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                                <Home size={16}/>
                                            </div>
                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{u.type}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(79, 70, 229, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                                <Maximize size={16}/>
                                            </div>
                                            <div style={{ fontSize: '13px', fontWeight: 800 }}>{u.area_sqm} m²</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(79, 70, 229, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                                <Layers size={16}/>
                                            </div>
                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>Floor {u.floor} • {u.rooms} R</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(79, 70, 229, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                                <MapPin size={16}/>
                                            </div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.location}>
                                                {u.location || 'Location N/A'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Footnote */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Market Value</div>
                                            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>
                                                <span style={{ fontSize: '14px', marginRight: '4px' }}>EGP</span>
                                                {Number(u.price).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {(u.status?.toLowerCase() === 'available' || !u.status) && (
                                                <button 
                                                    onClick={() => handleDelete(u.id)}
                                                    style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.05)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }) : (
                        <div style={{ gridColumn: '1 / -1', padding: '80px', textAlign: 'center' }}>
                           <div className="ap-card" style={{ padding: '60px', background: 'rgba(0,0,0,0.01)', borderStyle: 'dashed', borderWidth: '2px' }}>
                                <div className="wow-float" style={{ marginBottom: '20px' }}>
                                    <Building2 size={64} opacity={0.1}/>
                                </div>
                                <h3 style={{ fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>No Properties Registered</h3>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Your inventory is currently empty. Start adding premium units to your registry.</p>
                                <button onClick={() => setShowAddModal(true)} className="btn-primary-premium" style={{ margin: '0 auto' }}>
                                    <Plus size={20} />
                                    Register First Unit
                                </button>
                           </div>
                        </div>
                    )}
                </div>
            )}

            {/* Redesigned Add Unit Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.4)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '650px', padding: '40px', background: 'white', position: 'relative' }}>
                        <button 
                            onClick={() => setShowAddModal(false)}
                            style={{ position: 'absolute', top: '24px', right: '24px', padding: '8px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <X size={18}/>
                        </button>

                        <div style={{ marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '26px', fontWeight: 900, marginBottom: '8px' }}>New Property Record</h2>
                            <p style={{ color: 'var(--text-muted)' }}>Enter the specification of the luxury unit for the inventory.</p>
                        </div>

                        <form onSubmit={handleAddUnit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                                {/* Core Identity */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Identity & Project</h4>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Project Name</label>
                                    <input className="ap-input" required value={formData.project_name} onChange={e => setFormData({...formData, project_name: e.target.value})} placeholder="e.g. Palm Residences" />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Unit Number / Code</label>
                                    <input className="ap-input" required value={formData.unit_number} onChange={e => setFormData({...formData, unit_number: e.target.value})} placeholder="e.g. PH-402" />
                                </div>

                                {/* Specifications */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px', marginTop: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Technical Specifications</h4>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Property Type</label>
                                    <select className="ap-input" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                        <option value="Apartment">Luxury Apartment</option>
                                        <option value="Villa">Premium Villa</option>
                                        <option value="Commercial">Commercial/Retail</option>
                                        <option value="Office">Business Unit</option>
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Area Size (sqm)</label>
                                    <input className="ap-input" type="number" required value={formData.area_sqm} onChange={e => setFormData({...formData, area_sqm: e.target.value})} placeholder="e.g. 150" />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Total Rooms</label>
                                    <input className="ap-input" type="number" required value={formData.rooms} onChange={e => setFormData({...formData, rooms: e.target.value})} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Floor Level</label>
                                    <input className="ap-input" type="number" required value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} />
                                </div>

                                {/* Commercials */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px', marginTop: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pricing & Ownership</h4>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Target Price (EGP)</label>
                                    <input className="ap-input" type="number" required value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="0.00" />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Transaction Type</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {['sale', 'rent'].map(type => (
                                            <button 
                                                key={type}
                                                type="button"
                                                onClick={() => setFormData({...formData, transaction_type: type})}
                                                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid', borderColor: formData.transaction_type === type ? 'var(--primary)' : 'var(--border)', background: formData.transaction_type === type ? 'rgba(79, 70, 229, 0.05)' : 'transparent', color: formData.transaction_type === type ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 800, textTransform: 'capitalize' }}
                                            >
                                                For {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="ap-form-group" style={{ gridColumn: 'span 2' }}>
                                    <label className="ap-label">Precise Location Info</label>
                                    <input className="ap-input" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="Enter full address or detailed coordinates..." />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <button type="submit" className="btn-primary-premium" style={{ flex: 1, justifyContent: 'center', height: '56px' }}>Confirm Registration</button>
                                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '0 32px', borderRadius: '12px', border: '2px solid var(--border)', fontWeight: 800, color: 'var(--text-muted)' }}>Discard</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnitsRegistry;
