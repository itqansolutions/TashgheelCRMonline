import React, { useState, useEffect } from 'react';
import { Building2, Plus, Search, UserCheck, Trash2, CheckCircle2, XCircle, Clock, X, LayoutGrid, List, Map } from 'lucide-react';
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
    const [assignedFilter, setAssignedFilter] = useState('all');
    const [budgetMin, setBudgetMin] = useState('');
    const [budgetMax, setBudgetMax] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [viewMode, setViewMode] = useState('map'); // 'map' | 'cards' | 'list'
    const [assigningEmployee, setAssigningEmployee] = useState('');

    // Security Gate: Redirect if not in Real Estate template
    if (user && user.template_name !== 'real_estate') {
        return <Navigate to="/dashboard" />;
    }

    const [formData, setFormData] = useState({
        project_name: '', unit_number: '', name: '', type: 'Apartment', floor: '', 
        area_sqm: '', price: '', vendor_id: '', assigned_to: '', responsible_person_id: '', 
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
                area_sqm: '', price: '', vendor_id: '', assigned_to: '', responsible_person_id: '', 
                transaction_type: 'sale', rooms: 1, location: '' 
            });
            fetchUnits();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add unit');
        }
    };

    const handleAssignEmployee = async (unitId, employeeId) => {
        try {
            await api.put(`/re-units/${unitId}`, { assigned_to: employeeId || null });
            toast.success(employeeId ? 'Employee assigned successfully!' : 'Assignment cleared.');
            fetchUnits();
            // Update selected unit in-place so modal shows new name immediately
            setSelectedUnit(prev => ({ ...prev, assigned_to: employeeId || null }));
        } catch(err) {
            toast.error('Failed to update assignment.');
        }
    };

    const handleDelete = async (id) => {
        const targetUnit = units.find(u => u.id === id);
        if (targetUnit && (targetUnit.vendor_id || targetUnit.status?.toLowerCase() !== 'available')) {
            toast.error('Asset Locked: Cannot delete a unit linked to a Vendor or an Active Deal.');
            return;
        }
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
        const matchesAssigned = assignedFilter === 'all' || u.assigned_to === assignedFilter;
        const matchesMin = !budgetMin || Number(u.price) >= Number(budgetMin);
        const matchesMax = !budgetMax || Number(u.price) <= Number(budgetMax);

        return matchesFilter && matchesSearch && matchesAssigned && matchesMin && matchesMax;
    });

    const groupedUnits = filteredUnits.reduce((acc, u) => {
        const proj = u.project_name || 'Individual Properties';
        if (!acc[proj]) acc[proj] = {};
        const floor = u.floor || 'G';
        if (!acc[proj][floor]) acc[proj][floor] = [];
        acc[proj][floor].push(u);
        return acc;
    }, {});

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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {/* View Mode Toggle */}
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', padding: '4px', borderRadius: '12px', gap: '2px' }}>
                        {[{ key: 'map', icon: <Map size={15}/>, label: 'Map' }, { key: 'cards', icon: <LayoutGrid size={15}/>, label: 'Cards' }, { key: 'list', icon: <List size={15}/>, label: 'List' }].map(v => (
                            <button key={v.key} onClick={() => setViewMode(v.key)} style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: viewMode === v.key ? 'white' : 'transparent', color: viewMode === v.key ? 'var(--primary)' : 'var(--text-muted)', boxShadow: viewMode === v.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: '0.2s' }}>
                                {v.icon} {v.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setShowAddModal(true)} className="btn-primary-premium">
                        <Plus size={20} strokeWidth={3} />
                        Register New Unit
                    </button>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="ap-card" style={{ padding: '12px 16px', marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--glass-bg)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                    <input 
                        className="ap-input" 
                        placeholder="Search projects or codes..." 
                        style={{ paddingLeft: '48px', border: 'none', background: 'transparent', height: '40px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" placeholder="Min EGP" className="ap-input" style={{ width: '110px', height: '40px' }} value={budgetMin} onChange={e => setBudgetMin(e.target.value)} />
                    <input type="number" placeholder="Max EGP" className="ap-input" style={{ width: '110px', height: '40px' }} value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
                </div>
                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                
                <select className="ap-input" style={{ width: '180px', height: '40px' }} value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}>
                    <option value="all">All Employees</option>
                    {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>

                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.03)', padding: '5px', borderRadius: '12px' }}>
                    {['All', 'Available', 'Reserved', 'Sold'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setFilter(tab)}
                            style={{ 
                                padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 800,
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
            ) : filteredUnits.length === 0 ? (
                <div style={{ padding: '80px', textAlign: 'center' }}>
                   <div className="ap-card" style={{ padding: '60px', background: 'rgba(0,0,0,0.01)', borderStyle: 'dashed', borderWidth: '2px' }}>
                        <div className="wow-float" style={{ marginBottom: '20px' }}>
                            <Building2 size={64} opacity={0.1}/>
                        </div>
                        <h3 style={{ fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>No Properties Found</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Try adjusting your filters or register new units.</p>
                        <button onClick={() => setShowAddModal(true)} className="btn-primary-premium" style={{ margin: '0 auto' }}>
                            <Plus size={20} />
                            Register First Unit
                        </button>
                   </div>
                </div>
            ) : viewMode === 'map' ? (
                /* ─── MAP VIEW ─── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {Object.entries(groupedUnits).map(([project, floors]) => (
                        <div key={project} className="ap-card delay-1 wow-reveal" style={{ padding: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border)', paddingBottom: '16px', marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '24px', margin: 0, fontWeight: 900, display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-main)' }}>
                                    <Building2 size={24} color="var(--primary)" /> {project}
                                </h3>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '6px 12px', borderRadius: '8px' }}>
                                    {Object.values(floors).flat().length} Units
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {Object.entries(floors).sort(([a],[b]) => parseInt(b || 0) - parseInt(a || 0)).map(([floor, sortedUnits]) => (
                                    <div key={floor} style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
                                        <div style={{ width: '80px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Floor</span>
                                            <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-main)' }}>{floor}</span>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.01)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            {sortedUnits.map(u => {
                                                const config = getStatusConfig(u.status);
                                                return (
                                                    <div key={u.id} title="Click to View Full Details" onClick={() => setSelectedUnit(u)}
                                                        style={{ padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', background: config.bg, color: config.color, border: `1px solid ${config.color}40`, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '110px' }}
                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 6px 12px ${config.bg}`; }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontWeight: 900, fontSize: '16px' }}>{u.unit_number}</span>
                                                            {config.icon}
                                                        </div>
                                                        <div style={{ fontSize: '10px', fontWeight: 800, opacity: 0.9, textTransform: 'uppercase' }}>
                                                            {u.type === 'Apartment' ? 'APT' : u.type === 'Commercial' ? 'COM' : u.type === 'Villa' ? 'VIL' : 'UNT'} • {u.area_sqm}m²
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : viewMode === 'cards' ? (
                /* ─── CARDS VIEW ─── */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
                    {filteredUnits.map(u => {
                        const config = getStatusConfig(u.status);
                        return (
                            <div key={u.id} onClick={() => setSelectedUnit(u)} className="ap-card"
                                style={{ padding: '0', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s', borderTop: `3px solid ${config.color}` }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ''; }}>
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{u.project_name || 'Individual'}</div>
                                            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>Unit {u.unit_number}</div>
                                        </div>
                                        <span style={{ background: config.bg, color: config.color, padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 900 }}>{u.status}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>TYPE</div>
                                            <div style={{ fontSize: '13px', fontWeight: 800 }}>{u.type}</div>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>AREA</div>
                                            <div style={{ fontSize: '13px', fontWeight: 800 }}>{u.area_sqm} m²</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)', marginBottom: '8px' }}>{Number(u.price).toLocaleString()} EGP</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Floor {u.floor} • {u.rooms} Rooms
                                        {u.assigned_to && <span style={{ marginLeft: '8px', color: '#16a34a' }}>• {users.find(em => em.id === u.assigned_to)?.name}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* ─── LIST VIEW ─── */
                <div className="ap-card" style={{ padding: '0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                                {['Unit', 'Project', 'Type', 'Area', 'Price (EGP)', 'Status', 'Employee', ''].map(h => (
                                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUnits.map((u, i) => {
                                const config = getStatusConfig(u.status);
                                return (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}>
                                        <td style={{ padding: '14px 16px', fontWeight: 900, fontSize: '15px', color: 'var(--text-main)' }}>{u.unit_number}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{u.project_name || '—'}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>{u.type}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>{u.area_sqm} m²</td>
                                        <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--primary)' }}>{Number(u.price).toLocaleString()}</td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ background: config.bg, color: config.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 900 }}>{u.status}</span>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            {users.find(em => em.id === u.assigned_to)?.name || <span style={{ fontStyle: 'italic' }}>Unassigned</span>}
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <button onClick={() => setSelectedUnit(u)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', color: 'var(--primary)', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}


            {/* Redesigned Add Unit Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.4)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '650px', padding: '40px', background: 'white', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
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

                                {/* Linkages */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px', marginTop: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Responsibility & Ownership</h4>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Assigned Employee (Target List)</label>
                                    <select className="ap-input" value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}>
                                        <option value="">-- Let System Decide --</option>
                                        {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">Original Vendor (Owner)</label>
                                    <select className="ap-input" value={formData.vendor_id} onChange={e => setFormData({...formData, vendor_id: e.target.value})}>
                                        <option value="">-- Independent --</option>
                                        {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
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
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pricing</h4>
                                </div>
                                <div className="ap-form-group" style={{ gridColumn: 'span 2' }}>
                                    <label className="ap-label">Target Price (EGP)</label>
                                    <input className="ap-input" type="number" required value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="0.00" />
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

            {/* Read-Only Unit Details Modal */}
            {selectedUnit && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '500px', padding: '0', background: 'white', position: 'relative', overflow: 'hidden' }}>
                        {(() => {
                            const config = getStatusConfig(selectedUnit.status);
                            return (
                                <>
                                    <div style={{ padding: '24px 32px', background: config.bg, borderBottom: `1px solid ${config.color}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 900, color: config.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                                                {selectedUnit.project_name || 'Individual'}
                                            </div>
                                            <h2 style={{ fontSize: '28px', margin: 0, fontWeight: 900, color: 'var(--text-main)' }}>Unit {selectedUnit.unit_number}</h2>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                            <button onClick={() => setSelectedUnit(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}><X size={24}/></button>
                                            <div style={{ background: 'white', color: config.color, padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                {selectedUnit.status || 'Available'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div style={{ padding: '32px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Property Type</div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedUnit.type}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Market Value</div>
                                                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>{Number(selectedUnit.price).toLocaleString()} EGP</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Area Size</div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedUnit.area_sqm} m²</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Layout</div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Floor {selectedUnit.floor} • {selectedUnit.rooms} Rooms</div>
                                            </div>
                                        </div>

                                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <UserCheck size={13}/> Employee Assignment
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    defaultValue={selectedUnit.assigned_to || ''}
                                                    onChange={e => setAssigningEmployee(e.target.value)}
                                                    style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, background: 'white', cursor: 'pointer' }}
                                                >
                                                    <option value="">— Unassigned / Open —</option>
                                                    {(users || []).map(u => (
                                                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={() => handleAssignEmployee(selectedUnit.id, assigningEmployee)}
                                                    style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 800, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    Save
                                                </button>
                                            </div>
                                            {selectedUnit.assigned_to && (
                                                <div style={{ marginTop: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                                                    ✓ Currently: {users.find(u => u.id === selectedUnit.assigned_to)?.name || 'Assigned'}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button 
                                                onClick={() => {
                                                    handleDelete(selectedUnit.id);
                                                    setSelectedUnit(null);
                                                }}
                                                className="btn-primary-premium"
                                                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }}
                                            >
                                                <Trash2 size={16} /> Disable & Delete Unit
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnitsRegistry;
