import React, { useState, useEffect } from 'react';
import { Building2, Building, Plus, Search, UserCheck, Trash2, CheckCircle2, XCircle, Clock, X, LayoutGrid, List, Map, Sparkles, ArrowRight, ChevronDown, ChevronUp, Layers, Phone, Mail, User, MapPin } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { safeArray } from '../../utils/dataUtils';

export const formatN2 = (val) => {
    if (val === '' || val === null || val === undefined) return '';
    const num = Number(String(val).replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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

    const [showMatchBuyersModal, setShowMatchBuyersModal] = useState(false);
    const [matchedBuyersUnit, setMatchedBuyersUnit] = useState(null);
    const [matchedBuyersList, setMatchedBuyersList] = useState([]);
    const [loadingMatchedBuyers, setLoadingMatchedBuyers] = useState(false);
    const [expandedBuyerId, setExpandedBuyerId] = useState(null);

    const [hierarchyTree, setHierarchyTree] = useState({ developers: [], projects: [] });
    const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
    const [selectedPhaseFilter, setSelectedPhaseFilter] = useState('all');
    const [selectedBuildingFilter, setSelectedBuildingFilter] = useState('all');

    // Hierarchy & Quick Modals State
    const [showManageHierarchyModal, setShowManageHierarchyModal] = useState(false);
    const [hierarchyTab, setHierarchyTab] = useState('projects'); // 'projects' | 'developers'
    const [showQuickDevModal, setShowQuickDevModal] = useState(false);
    const [showQuickProjModal, setShowQuickProjModal] = useState(false);
    const [showQuickPhaseModal, setShowQuickPhaseModal] = useState(false);
    const [showQuickBuildingModal, setShowQuickBuildingModal] = useState(false);
    const [expandedProjectId, setExpandedProjectId] = useState(null);

    const [newDevForm, setNewDevForm] = useState({ name: '', contact_person: '', phone: '', email: '' });
    const [newProjForm, setNewProjForm] = useState({ name: '', developer_id: '', location: '', description: '' });
    const [newPhaseForm, setNewPhaseForm] = useState({ project_id: '', name: '' });
    const [newBuildingForm, setNewBuildingForm] = useState({ project_id: '', phase_id: '', name: '', floors_count: 1 });

    const [creatingDev, setCreatingDev] = useState(false);
    const [creatingProj, setCreatingProj] = useState(false);
    const [creatingPhase, setCreatingPhase] = useState(false);
    const [creatingBuilding, setCreatingBuilding] = useState(false);

    // Form and N2 price state
    const [priceDisplay, setPriceDisplay] = useState('');

    // Sync the employee dropdown to the unit's current assignee when modal opens
    useEffect(() => {
        if (selectedUnit) {
            setAssigningEmployee(selectedUnit.assigned_to || '');
        }
    }, [selectedUnit?.id]);

    // Security Gate: Redirect if not in Real Estate template
    if (user && user.template_name !== 'real_estate') {
        return <Navigate to="/dashboard" />;
    }

    const [formData, setFormData] = useState({
        project_name: '', unit_number: '', name: '', type: 'Apartment', floor: '', 
        area_sqm: '', price: '', vendor_id: '', assigned_to: '', responsible_person_id: '', 
        transaction_type: 'sale', rooms: 1, location: '',
        developer_id: '', project_id: '', phase_id: '', building_id: ''
    });

    const vendors = safeArray(customers).filter(c => c.entity_type === 'vendor');

    const fetchHierarchy = async () => {
        try {
            const res = await api.get('/re-hierarchy/tree');
            if (res.data?.data) {
                setHierarchyTree(res.data.data);
            }
        } catch (e) {
            // Non-critical fallback
        }
    };

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

    const handleExtendReservation = async (unitId, hours) => {
        try {
            const res = await api.post(`/re-units/${unitId}/extend-reservation`, { extensionHours: hours });
            if (res.data?.success) {
                toast.success(`Reservation extended by ${hours}h`);
                if (res.data.data) {
                    setSelectedUnit(prev => prev ? { ...prev, ...res.data.data } : null);
                }
                fetchUnits();
            } else {
                toast.error(res.data?.message || 'Failed to extend reservation');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error extending reservation');
        }
    };

    const handleOpenMatchBuyers = async (unit) => {
        setMatchedBuyersUnit(unit);
        setShowMatchBuyersModal(true);
        setLoadingMatchedBuyers(true);
        setMatchedBuyersList([]);
        try {
            const res = await api.get(`/re-units/match-unit/${unit.id}`);
            setMatchedBuyersList(res.data?.data?.matches || []);
        } catch(err) {
            toast.error(err.response?.data?.message || 'Failed to match buyer leads');
        } finally {
            setLoadingMatchedBuyers(false);
        }
    };

    useEffect(() => { 
        fetchUnits();
        fetchHierarchy();
        if (users.length === 0) fetchUsers();
        if (customers.length === 0) fetchCustomers();
    }, []);

    const handlePriceChange = (e) => {
        const raw = e.target.value.replace(/,/g, '');
        if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
            setPriceDisplay(e.target.value);
            setFormData(prev => ({ ...prev, price: raw }));
        }
    };

    const handlePriceBlur = () => {
        if (formData.price) {
            const num = parseFloat(String(formData.price).replace(/,/g, ''));
            if (!isNaN(num)) {
                const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                setPriceDisplay(formatted);
                setFormData(prev => ({ ...prev, price: num.toFixed(2) }));
            }
        }
    };

    const openAddModal = () => {
        setPriceDisplay(formData.price ? formatN2(formData.price) : '');
        setShowAddModal(true);
    };

    const handleCreateDeveloper = async (e) => {
        e.preventDefault();
        if (!newDevForm.name.trim()) {
            toast.error('Developer name is required');
            return;
        }
        setCreatingDev(true);
        try {
            const res = await api.post('/re-hierarchy/developers', newDevForm);
            toast.success(`Developer "${newDevForm.name}" created!`);
            const createdDev = res.data?.data;
            await fetchHierarchy();
            if (createdDev && createdDev.id) {
                setFormData(prev => ({ ...prev, developer_id: createdDev.id }));
            }
            setNewDevForm({ name: '', contact_person: '', phone: '', email: '' });
            setShowQuickDevModal(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create developer');
        } finally {
            setCreatingDev(false);
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (!newProjForm.name.trim()) {
            toast.error('Project name is required');
            return;
        }
        setCreatingProj(true);
        try {
            const payload = {
                name: newProjForm.name,
                developer_id: newProjForm.developer_id || formData.developer_id || null,
                location: newProjForm.location || '',
                description: newProjForm.description || ''
            };
            const res = await api.post('/re-hierarchy/projects', payload);
            toast.success(`Project "${newProjForm.name}" created!`);
            const createdProj = res.data?.data;
            await fetchHierarchy();
            if (createdProj && createdProj.id) {
                setFormData(prev => ({ 
                    ...prev, 
                    project_id: createdProj.id,
                    project_name: createdProj.name,
                    developer_id: createdProj.developer_id || prev.developer_id
                }));
            }
            setNewProjForm({ name: '', developer_id: '', location: '', description: '' });
            setShowQuickProjModal(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create project');
        } finally {
            setCreatingProj(false);
        }
    };

    const handleDeleteDeveloper = async (id, name) => {
        if (!window.confirm(`Delete developer "${name}"? Existing projects will be unlinked.`)) return;
        try {
            await api.delete(`/re-hierarchy/developers/${id}`);
            toast.success('Developer deleted');
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete developer');
        }
    };

    const handleDeleteProject = async (id, name) => {
        if (!window.confirm(`Delete project "${name}"? Units linked to this project will be preserved.`)) return;
        try {
            await api.delete(`/re-hierarchy/projects/${id}`);
            toast.success('Project deleted');
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete project');
        }
    };

    const openAddPhaseModal = (projectId, projectName) => {
        setNewPhaseForm({ project_id: projectId || formData.project_id || '', name: '' });
        setShowQuickPhaseModal(true);
    };

    const openAddBuildingModal = (projectId, projectName, phaseId) => {
        setNewBuildingForm({ 
            project_id: projectId || formData.project_id || '', 
            phase_id: phaseId || formData.phase_id || '', 
            name: '', 
            floors_count: 1 
        });
        setShowQuickBuildingModal(true);
    };

    const handleCreatePhase = async (e) => {
        e.preventDefault();
        if (!newPhaseForm.project_id) {
            toast.error('Please select a project for this phase');
            return;
        }
        if (!newPhaseForm.name.trim()) {
            toast.error('Phase name is required');
            return;
        }
        setCreatingPhase(true);
        try {
            const res = await api.post('/re-hierarchy/phases', {
                project_id: newPhaseForm.project_id,
                name: newPhaseForm.name.trim()
            });
            toast.success(`Phase "${newPhaseForm.name}" created!`);
            const createdPhase = res.data?.data;
            await fetchHierarchy();
            if (createdPhase && createdPhase.id) {
                setFormData(prev => ({ 
                    ...prev, 
                    project_id: newPhaseForm.project_id,
                    phase_id: createdPhase.id 
                }));
            }
            setNewPhaseForm({ project_id: '', name: '' });
            setShowQuickPhaseModal(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create phase');
        } finally {
            setCreatingPhase(false);
        }
    };

    const handleCreateBuilding = async (e) => {
        e.preventDefault();
        if (!newBuildingForm.project_id) {
            toast.error('Please select a project for this building');
            return;
        }
        if (!newBuildingForm.name.trim()) {
            toast.error('Building name is required');
            return;
        }
        setCreatingBuilding(true);
        try {
            const res = await api.post('/re-hierarchy/buildings', {
                project_id: newBuildingForm.project_id,
                phase_id: newBuildingForm.phase_id || null,
                name: newBuildingForm.name.trim(),
                floors_count: parseInt(newBuildingForm.floors_count) || 1
            });
            toast.success(`Building "${newBuildingForm.name}" created!`);
            const createdBuilding = res.data?.data;
            await fetchHierarchy();
            if (createdBuilding && createdBuilding.id) {
                setFormData(prev => ({ 
                    ...prev, 
                    project_id: newBuildingForm.project_id,
                    building_id: createdBuilding.id 
                }));
            }
            setNewBuildingForm({ project_id: '', phase_id: '', name: '', floors_count: 1 });
            setShowQuickBuildingModal(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create building');
        } finally {
            setCreatingBuilding(false);
        }
    };

    const handleDeletePhase = async (id, name) => {
        if (!window.confirm(`Delete phase "${name}"?`)) return;
        try {
            await api.delete(`/re-hierarchy/phases/${id}`);
            toast.success(`Phase "${name}" deleted`);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete phase');
        }
    };

    const handleDeleteBuilding = async (id, name) => {
        if (!window.confirm(`Delete building "${name}"?`)) return;
        try {
            await api.delete(`/re-hierarchy/buildings/${id}`);
            toast.success(`Building "${name}" deleted`);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete building');
        }
    };

    const handleAddUnit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                price: formData.price ? parseFloat(String(formData.price).replace(/,/g, '')) : 0
            };
            await api.post('/re-units', payload);
            toast.success('Unit added successfully to your premium registry!');
            setShowAddModal(false);
            setFormData({ 
                project_name: '', unit_number: '', name: '', type: 'Apartment', floor: '', 
                area_sqm: '', price: '', vendor_id: '', assigned_to: '', responsible_person_id: '', 
                transaction_type: 'sale', rooms: 1, location: '',
                developer_id: '', project_id: '', phase_id: '', building_id: ''
            });
            setPriceDisplay('');
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

    const activeProjectPhases = selectedProjectFilter !== 'all' 
        ? (hierarchyTree.projects?.find(p => String(p.id) === String(selectedProjectFilter))?.phases || []) 
        : [];
    const activeProjectBuildings = selectedProjectFilter !== 'all'
        ? (hierarchyTree.projects?.find(p => String(p.id) === String(selectedProjectFilter))?.buildings || [])
        : [];

    const filteredUnits = safeArray(units).filter(u => {
        const matchesFilter = filter === 'All' || u.status?.toLowerCase() === filter.toLowerCase();
        const matchesSearch = (u.project_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                             (u.unit_number?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                             (u.building_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                             (u.phase_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                             (u.developer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const matchesAssigned = assignedFilter === 'all' || u.assigned_to === assignedFilter;
        const matchesMin = !budgetMin || Number(u.price) >= Number(budgetMin);
        const matchesMax = !budgetMax || Number(u.price) <= Number(budgetMax);

        const matchesProject = selectedProjectFilter === 'all' || 
                               String(u.project_id) === String(selectedProjectFilter) || 
                               String(u.project_name).toLowerCase() === String(selectedProjectFilter).toLowerCase();
        const matchesPhase = selectedPhaseFilter === 'all' || String(u.phase_id) === String(selectedPhaseFilter);
        const matchesBuilding = selectedBuildingFilter === 'all' || String(u.building_id) === String(selectedBuildingFilter);

        return matchesFilter && matchesSearch && matchesAssigned && matchesMin && matchesMax && matchesProject && matchesPhase && matchesBuilding;
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
                    <button 
                        onClick={() => setShowManageHierarchyModal(true)} 
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 18px',
                            borderRadius: '12px',
                            border: '1.5px solid var(--border)',
                            background: 'white',
                            color: 'var(--text-main)',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Building size={16} color="var(--primary)" />
                        Developers & Projects
                    </button>
                    <button onClick={openAddModal} className="btn-primary-premium">
                        <Plus size={20} strokeWidth={3} />
                        Register New Unit
                    </button>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="ap-card" style={{ padding: '12px 16px', marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--glass-bg)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                    <input 
                        className="ap-input" 
                        placeholder="Search projects, buildings, codes..." 
                        style={{ paddingLeft: '48px', border: 'none', background: 'transparent', height: '40px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>

                {/* Project Hierarchy Filters */}
                <select 
                    className="ap-input" 
                    style={{ width: '170px', height: '40px' }} 
                    value={selectedProjectFilter} 
                    onChange={e => {
                        setSelectedProjectFilter(e.target.value);
                        setSelectedPhaseFilter('all');
                        setSelectedBuildingFilter('all');
                    }}
                >
                    <option value="all">All Projects</option>
                    {(hierarchyTree.projects || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                {activeProjectPhases.length > 0 && (
                    <select 
                        className="ap-input" 
                        style={{ width: '140px', height: '40px' }} 
                        value={selectedPhaseFilter} 
                        onChange={e => setSelectedPhaseFilter(e.target.value)}
                    >
                        <option value="all">All Phases</option>
                        {activeProjectPhases.map(ph => (
                            <option key={ph.id} value={ph.id}>{ph.name}</option>
                        ))}
                    </select>
                )}

                {activeProjectBuildings.length > 0 && (
                    <select 
                        className="ap-input" 
                        style={{ width: '140px', height: '40px' }} 
                        value={selectedBuildingFilter} 
                        onChange={e => setSelectedBuildingFilter(e.target.value)}
                    >
                        <option value="all">All Buildings</option>
                        {activeProjectBuildings.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}

                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" placeholder="Min EGP" className="ap-input" style={{ width: '110px', height: '40px' }} value={budgetMin} onChange={e => setBudgetMin(e.target.value)} />
                    <input type="number" placeholder="Max EGP" className="ap-input" style={{ width: '110px', height: '40px' }} value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
                </div>
                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                
                <select className="ap-input" style={{ width: '160px', height: '40px' }} value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}>
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
                                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)', marginBottom: '8px' }}>{Number(u.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Floor {u.floor} • {u.rooms} Rooms
                                        {u.assigned_to && <span style={{ marginLeft: '8px', color: '#16a34a' }}>• {u.assigned_to_name || users.find(em => String(em.id) === String(u.assigned_to))?.name}</span>}
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
                                        <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--primary)' }}>{Number(u.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ background: config.bg, color: config.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 900 }}>{u.status}</span>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            {u.assigned_to_name || users.find(em => String(em.id) === String(u.assigned_to))?.name || <span style={{ fontStyle: 'italic' }}>Unassigned</span>}
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
                                {/* Core Identity & Project Hierarchy */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Project Hierarchy & Identity</h4>
                                </div>
                                <div className="ap-form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="ap-label" style={{ margin: 0 }}>Developer (Optional)</label>
                                        <button 
                                            type="button" 
                                            onClick={() => setShowQuickDevModal(true)}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={12} strokeWidth={3} /> Add Developer
                                        </button>
                                    </div>
                                    <select 
                                        className="ap-input" 
                                        value={formData.developer_id || ''} 
                                        onChange={e => setFormData({ ...formData, developer_id: e.target.value })}
                                    >
                                        <option value="">-- Independent / None --</option>
                                        {(hierarchyTree.developers || []).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="ap-label" style={{ margin: 0 }}>Project</label>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setNewProjForm(p => ({ ...p, developer_id: formData.developer_id || '' }));
                                                setShowQuickProjModal(true);
                                            }}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={12} strokeWidth={3} /> Add Project
                                        </button>
                                    </div>
                                    <select 
                                        className="ap-input" 
                                        value={formData.project_id || ''} 
                                        onChange={e => {
                                            const pid = e.target.value;
                                            const selectedP = hierarchyTree.projects?.find(p => String(p.id) === String(pid));
                                            setFormData({ 
                                                ...formData, 
                                                project_id: pid, 
                                                project_name: selectedP ? selectedP.name : formData.project_name,
                                                phase_id: '',
                                                building_id: ''
                                            });
                                        }}
                                    >
                                        <option value="">-- Custom / Direct Name --</option>
                                        {(hierarchyTree.projects || []).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}{p.developer_name ? ` (${p.developer_name})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                {!formData.project_id && (
                                    <div className="ap-form-group">
                                        <label className="ap-label">Project Name</label>
                                        <input className="ap-input" required value={formData.project_name} onChange={e => setFormData({...formData, project_name: e.target.value})} placeholder="e.g. Palm Residences" />
                                    </div>
                                )}
                                {formData.project_id && (
                                    <>
                                        <div className="ap-form-group">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label className="ap-label" style={{ margin: 0 }}>Phase (Optional)</label>
                                                <button 
                                                    type="button" 
                                                    onClick={() => openAddPhaseModal(formData.project_id)}
                                                    style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Plus size={12} strokeWidth={3} /> Add Phase
                                                </button>
                                            </div>
                                            <select 
                                                className="ap-input" 
                                                value={formData.phase_id || ''} 
                                                onChange={e => setFormData({ ...formData, phase_id: e.target.value })}
                                            >
                                                <option value="">-- Select Phase --</option>
                                                {(hierarchyTree.projects?.find(p => String(p.id) === String(formData.project_id))?.phases || []).map(ph => (
                                                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="ap-form-group">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label className="ap-label" style={{ margin: 0 }}>Building (Optional)</label>
                                                <button 
                                                    type="button" 
                                                    onClick={() => openAddBuildingModal(formData.project_id, '', formData.phase_id)}
                                                    style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Plus size={12} strokeWidth={3} /> Add Building
                                                </button>
                                            </div>
                                            <select 
                                                className="ap-input" 
                                                value={formData.building_id || ''} 
                                                onChange={e => setFormData({ ...formData, building_id: e.target.value })}
                                            >
                                                <option value="">-- Select Building --</option>
                                                {(hierarchyTree.projects?.find(p => String(p.id) === String(formData.project_id))?.buildings || []).map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}{b.floors_count ? ` (${b.floors_count} Floors)` : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="ap-label" style={{ margin: 0 }}>Target Price (EGP)</label>
                                        {formData.price && (
                                            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                                                N2 Format: {formatN2(formData.price)} EGP
                                            </span>
                                        )}
                                    </div>
                                    <input 
                                        className="ap-input" 
                                        type="text" 
                                        required 
                                        value={priceDisplay} 
                                        onChange={handlePriceChange}
                                        onBlur={handlePriceBlur}
                                        placeholder="0.00" 
                                        style={{ fontSize: '16px', fontWeight: 700 }}
                                    />
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Format: N2 (e.g. 1,500,000.00). Thousands separators are auto-applied on blur.
                                    </div>
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
                                                {selectedUnit.developer_name ? `${selectedUnit.developer_name} • ` : ''}
                                                {selectedUnit.project_name || 'Individual'}
                                                {selectedUnit.phase_name ? ` • ${selectedUnit.phase_name}` : ''}
                                                {selectedUnit.building_name ? ` • ${selectedUnit.building_name}` : ''}
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
                                                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>{Number(selectedUnit.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP</div>
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

                                        {/* Active Reservation & Extension */}
                                        {selectedUnit.status === 'Reserved' && (
                                            <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '16px' }}>
                                                <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Clock size={13}/> Active Reservation
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '10px' }}>
                                                    <strong>Expires:</strong> {selectedUnit.reservation_expires_at ? new Date(selectedUnit.reservation_expires_at).toLocaleString() : 'Not Set'}
                                                    {Number(selectedUnit.reservation_extension_count) > 0 && (
                                                        <span style={{ marginLeft: '8px', padding: '2px 6px', background: '#fef3c7', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: '#b45309' }}>
                                                            Extended {selectedUnit.reservation_extension_count}x
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleExtendReservation(selectedUnit.id, 24)}
                                                        style={{ flex: 1, padding: '8px 12px', background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                                    >
                                                        +24 Hours
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleExtendReservation(selectedUnit.id, 48)}
                                                        style={{ flex: 1, padding: '8px 12px', background: '#b45309', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                                    >
                                                        +48 Hours
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <UserCheck size={13}/> Employee Assignment
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={assigningEmployee}
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
                                                    ✓ Currently: {selectedUnit.assigned_to_name || users.find(u => String(u.id) === String(selectedUnit.assigned_to))?.name || 'Assigned'}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button 
                                                type="button"
                                                onClick={() => handleOpenMatchBuyers(selectedUnit)}
                                                className="btn-primary-premium"
                                                style={{ flex: 1, justifyContent: 'center', background: '#3b82f6', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }}
                                            >
                                                <Sparkles size={16} /> 🎯 Match Buyers
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    handleDelete(selectedUnit.id);
                                                    setSelectedUnit(null);
                                                }}
                                                className="btn-primary-premium"
                                                style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }}
                                            >
                                                <Trash2 size={16} /> Disable & Delete
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* 🎯 Matched Buyer Leads Modal */}
            {showMatchBuyersModal && matchedBuyersUnit && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
                    <div className="ap-card" style={{ width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', background: 'white', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Sparkles size={20} color="#eab308" /> 🎯 Matched Buyer Leads
                                </h3>
                                <div style={{ fontSize: '13px', color: '#64748b' }}>
                                    Matching registered buyer clients for <strong>Unit {matchedBuyersUnit.unit_number}</strong> ({matchedBuyersUnit.project_name || 'Individual'}) • {Number(matchedBuyersUnit.price).toLocaleString()} EGP • {matchedBuyersUnit.area_sqm} m² • {matchedBuyersUnit.rooms} Rooms
                                </div>
                            </div>
                            <button onClick={() => setShowMatchBuyersModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {loadingMatchedBuyers ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                                Analyzing registered buyer client requirements...
                            </div>
                        ) : matchedBuyersList.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b', fontSize: '14px' }}>
                                No registered buyer clients currently match this unit.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {matchedBuyersList.map(({ customer, match_score, match_grade, breakdown }) => {
                                    const isExpanded = expandedBuyerId === customer.id;
                                    const gradeColor = match_score >= 85 ? '#16a34a' : match_score >= 65 ? '#2563eb' : match_score >= 45 ? '#d97706' : '#64748b';
                                    const gradeBg = match_score >= 85 ? '#dcfce7' : match_score >= 65 ? '#dbeafe' : match_score >= 45 ? '#fef3c7' : '#f1f5f9';

                                    return (
                                        <div key={customer.id} style={{ border: `1px solid ${isExpanded ? gradeColor : '#e2e8f0'}`, borderRadius: '12px', background: 'white', overflow: 'hidden', transition: 'all 0.2s' }}>
                                            <div 
                                                onClick={() => setExpandedBuyerId(isExpanded ? null : customer.id)}
                                                style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExpanded ? `${gradeBg}30` : 'white' }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                    <div style={{ textAlign: 'center', minWidth: '55px', padding: '5px 8px', borderRadius: '8px', background: gradeBg, color: gradeColor, fontWeight: 900 }}>
                                                        <div style={{ fontSize: '16px', lineHeight: '1' }}>{match_score}%</div>
                                                        <div style={{ fontSize: '9px', textTransform: 'uppercase' }}>{match_grade}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-main)' }}>{customer.name}</div>
                                                        <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                            {customer.phone && <span>📞 {customer.phone}</span>}
                                                            {customer.preferred_location && <span>📍 {customer.preferred_location}</span>}
                                                            {customer.budget_max && <span>💰 Max: {Number(customer.budget_max).toLocaleString()} EGP</span>}
                                                            {customer.preferred_rooms && <span>🛏️ {customer.preferred_rooms} Rms</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <a 
                                                        href={`/deals?new=1&client_id=${customer.id}&unit_id=${matchedBuyersUnit.id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ padding: '7px 14px', borderRadius: '8px', background: 'var(--primary)', color: 'white', textDecoration: 'none', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        Create Deal <ArrowRight size={13} />
                                                    </a>
                                                    {isExpanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', background: '#fafafa', fontSize: '12px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>💰 Budget ({breakdown.budget.score}/{breakdown.budget.max} pts)</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.budget.reason}</div>
                                                        </div>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>📐 Area ({breakdown.area.score}/{breakdown.area.max} pts)</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.area.reason}</div>
                                                        </div>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>📍 Location ({breakdown.location.score}/{breakdown.location.max} pts)</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.location.reason}</div>
                                                        </div>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>🛏️ Rooms ({breakdown.rooms.score}/{breakdown.rooms.max} pts)</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.rooms.reason}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Quick Add Developer Modal */}
            {showQuickDevModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '480px', padding: '32px', background: 'white', position: 'relative', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <button 
                            type="button"
                            onClick={() => setShowQuickDevModal(false)}
                            style={{ position: 'absolute', top: '20px', right: '20px', padding: '6px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}
                        >
                            <X size={16}/>
                        </button>
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                    <Building size={20} />
                                </div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Add Developer</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Register a real estate developer company into your system.</p>
                        </div>
                        <form onSubmit={handleCreateDeveloper}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Developer Company Name *</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder="e.g. Emaar Misr, Talaat Moustafa..." 
                                    value={newDevForm.name} 
                                    onChange={e => setNewDevForm({ ...newDevForm, name: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Contact Person</label>
                                <input 
                                    className="ap-input" 
                                    placeholder="e.g. Ahmed Zaki" 
                                    value={newDevForm.contact_person} 
                                    onChange={e => setNewDevForm({ ...newDevForm, contact_person: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Phone Number</label>
                                <input 
                                    className="ap-input" 
                                    placeholder="e.g. +20 100 123 4567" 
                                    value={newDevForm.phone} 
                                    onChange={e => setNewDevForm({ ...newDevForm, phone: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">Email</label>
                                <input 
                                    className="ap-input" 
                                    type="email" 
                                    placeholder="e.g. info@developer.com" 
                                    value={newDevForm.email} 
                                    onChange={e => setNewDevForm({ ...newDevForm, email: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingDev} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingDev ? 'Saving...' : 'Confirm Developer'}
                                </button>
                                <button type="button" onClick={() => setShowQuickDevModal(false)} style={{ padding: '0 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'white', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Add Project Modal */}
            {showQuickProjModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '500px', padding: '32px', background: 'white', position: 'relative', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <button 
                            type="button"
                            onClick={() => setShowQuickProjModal(false)}
                            style={{ position: 'absolute', top: '20px', right: '20px', padding: '6px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}
                        >
                            <X size={16}/>
                        </button>
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                    <Building2 size={20} />
                                </div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Add Project / Compound</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Create a compound or real estate project under a developer.</p>
                        </div>
                        <form onSubmit={handleCreateProject}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Project / Compound Name *</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder="e.g. Palm Hills, Marassi, Uptown Cairo..." 
                                    value={newProjForm.name} 
                                    onChange={e => setNewProjForm({ ...newProjForm, name: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Developer (Optional)</label>
                                <select 
                                    className="ap-input"
                                    value={newProjForm.developer_id}
                                    onChange={e => setNewProjForm({ ...newProjForm, developer_id: e.target.value })}
                                >
                                    <option value="">-- No Developer / Direct --</option>
                                    {(hierarchyTree.developers || []).map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Location / City</label>
                                <input 
                                    className="ap-input" 
                                    placeholder="e.g. New Cairo, North Coast, 6th of October" 
                                    value={newProjForm.location} 
                                    onChange={e => setNewProjForm({ ...newProjForm, location: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">Description (Optional)</label>
                                <textarea 
                                    className="ap-input" 
                                    rows={2}
                                    placeholder="Brief overview of the project..." 
                                    value={newProjForm.description} 
                                    onChange={e => setNewProjForm({ ...newProjForm, description: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingProj} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingProj ? 'Saving...' : 'Confirm Project'}
                                </button>
                                <button type="button" onClick={() => setShowQuickProjModal(false)} style={{ padding: '0 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'white', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Add Phase Modal */}
            {showQuickPhaseModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '480px', padding: '32px', background: 'white', position: 'relative', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <button 
                            type="button"
                            onClick={() => setShowQuickPhaseModal(false)}
                            style={{ position: 'absolute', top: '20px', right: '20px', padding: '6px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}
                        >
                            <X size={16}/>
                        </button>
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                    <Layers size={20} />
                                </div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Add Project Phase</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Create a new phase or development stage for a project.</p>
                        </div>
                        <form onSubmit={handleCreatePhase}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Project / Compound *</label>
                                <select 
                                    className="ap-input" 
                                    required
                                    value={newPhaseForm.project_id}
                                    onChange={e => setNewPhaseForm({ ...newPhaseForm, project_id: e.target.value })}
                                >
                                    <option value="">-- Select Project --</option>
                                    {(hierarchyTree.projects || []).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">Phase Name *</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder="e.g. Phase 1, Phase 2, Marina Stage, North Wing..." 
                                    value={newPhaseForm.name} 
                                    onChange={e => setNewPhaseForm({ ...newPhaseForm, name: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingPhase} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingPhase ? 'Saving...' : 'Confirm Phase'}
                                </button>
                                <button type="button" onClick={() => setShowQuickPhaseModal(false)} style={{ padding: '0 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'white', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Add Building Modal */}
            {showQuickBuildingModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '480px', padding: '32px', background: 'white', position: 'relative', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <button 
                            type="button"
                            onClick={() => setShowQuickBuildingModal(false)}
                            style={{ position: 'absolute', top: '20px', right: '20px', padding: '6px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}
                        >
                            <X size={16}/>
                        </button>
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                                    <Building size={20} />
                                </div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Add Building / Tower</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Register a specific building, tower, or block.</p>
                        </div>
                        <form onSubmit={handleCreateBuilding}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Project / Compound *</label>
                                <select 
                                    className="ap-input" 
                                    required
                                    value={newBuildingForm.project_id}
                                    onChange={e => setNewBuildingForm({ ...newBuildingForm, project_id: e.target.value, phase_id: '' })}
                                >
                                    <option value="">-- Select Project --</option>
                                    {(hierarchyTree.projects || []).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Phase (Optional)</label>
                                <select 
                                    className="ap-input" 
                                    value={newBuildingForm.phase_id}
                                    onChange={e => setNewBuildingForm({ ...newBuildingForm, phase_id: e.target.value })}
                                >
                                    <option value="">-- Direct Project Level (No Phase) --</option>
                                    {(hierarchyTree.projects?.find(p => String(p.id) === String(newBuildingForm.project_id))?.phases || []).map(ph => (
                                        <option key={ph.id} value={ph.id}>{ph.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">Building / Tower Name *</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder="e.g. Building A, Tower 2, Block 14..." 
                                    value={newBuildingForm.name} 
                                    onChange={e => setNewBuildingForm({ ...newBuildingForm, name: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">Floors Count</label>
                                <input 
                                    type="number"
                                    min="1"
                                    className="ap-input" 
                                    placeholder="1" 
                                    value={newBuildingForm.floors_count} 
                                    onChange={e => setNewBuildingForm({ ...newBuildingForm, floors_count: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingBuilding} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingBuilding ? 'Saving...' : 'Confirm Building'}
                                </button>
                                <button type="button" onClick={() => setShowQuickBuildingModal(false)} style={{ padding: '0 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'white', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Full Developers & Projects Management Modal */}
            {showManageHierarchyModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: '20px' }}>
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '850px', padding: '0', background: 'white', position: 'relative', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '16px' }}>
                        {/* Header */}
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 4px 0', color: 'var(--text-main)' }}>Developers & Projects Catalog</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Manage the real estate hierarchy structure for your inventory.</p>
                            </div>
                            <button 
                                onClick={() => setShowManageHierarchyModal(false)}
                                style={{ padding: '8px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}
                            >
                                <X size={18}/>
                            </button>
                        </div>

                        {/* Tabs */}
                        <div style={{ padding: '16px 32px 0 32px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                            <button 
                                onClick={() => setHierarchyTab('projects')}
                                style={{ padding: '10px 18px', border: 'none', background: 'transparent', fontWeight: 800, fontSize: '14px', cursor: 'pointer', borderBottom: hierarchyTab === 'projects' ? '3px solid var(--primary)' : '3px solid transparent', color: hierarchyTab === 'projects' ? 'var(--primary)' : 'var(--text-muted)' }}
                            >
                                Projects ({(hierarchyTree.projects || []).length})
                            </button>
                            <button 
                                onClick={() => setHierarchyTab('developers')}
                                style={{ padding: '10px 18px', border: 'none', background: 'transparent', fontWeight: 800, fontSize: '14px', cursor: 'pointer', borderBottom: hierarchyTab === 'developers' ? '3px solid var(--primary)' : '3px solid transparent', color: hierarchyTab === 'developers' ? 'var(--primary)' : 'var(--text-muted)' }}
                            >
                                Developers ({(hierarchyTree.developers || []).length})
                            </button>
                            <div style={{ flex: 1 }} />
                            <button 
                                onClick={() => {
                                    if (hierarchyTab === 'developers') setShowQuickDevModal(true);
                                    else setShowQuickProjModal(true);
                                }}
                                className="btn-primary-premium"
                                style={{ height: '36px', fontSize: '12px', padding: '0 14px' }}
                            >
                                <Plus size={14} strokeWidth={3} />
                                {hierarchyTab === 'developers' ? 'New Developer' : 'New Project'}
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
                            {hierarchyTab === 'projects' ? (
                                (hierarchyTree.projects || []).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                                        <Building2 size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                        <p style={{ fontWeight: 700, margin: '0 0 12px 0' }}>No projects registered yet.</p>
                                        <button onClick={() => setShowQuickProjModal(true)} className="btn-primary-premium" style={{ height: '38px', fontSize: '13px' }}>
                                            <Plus size={14} /> Create First Project
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                        {(hierarchyTree.projects || []).map(p => {
                                            const isExpanded = expandedProjectId === p.id;
                                            const phasesList = p.phases || [];
                                            const buildingsList = p.buildings || [];
                                            return (
                                                <div key={p.id} style={{ padding: '18px', borderRadius: '14px', border: '1px solid var(--border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>{p.name}</h4>
                                                            <button 
                                                                onClick={() => handleDeleteProject(p.id, p.name)}
                                                                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                                title="Delete Project"
                                                            >
                                                                <Trash2 size={15}/>
                                                            </button>
                                                        </div>
                                                        {p.developer_name && (
                                                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
                                                                🏢 {p.developer_name}
                                                            </div>
                                                        )}
                                                        {p.location && (
                                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                                📍 {p.location}
                                                            </div>
                                                        )}
                                                        {p.description && (
                                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontStyle: 'italic' }}>
                                                                {p.description}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Quick Actions & Summary */}
                                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setExpandedProjectId(isExpanded ? null : p.id)}
                                                                style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                                            >
                                                                <span>{phasesList.length} Phases • {buildingsList.length} Buildings</span>
                                                                {isExpanded ? <ChevronUp size={14} color="var(--primary)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                                                            </button>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => openAddPhaseModal(p.id, p.name)}
                                                                    className="btn-secondary-modern"
                                                                    style={{ height: '28px', padding: '0 8px', fontSize: '11px', fontWeight: 800, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                    title="Add Phase to this project"
                                                                >
                                                                    <Plus size={11} strokeWidth={3} /> Phase
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => openAddBuildingModal(p.id, p.name)}
                                                                    className="btn-secondary-modern"
                                                                    style={{ height: '28px', padding: '0 8px', fontSize: '11px', fontWeight: 800, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                    title="Add Building to this project"
                                                                >
                                                                    <Plus size={11} strokeWidth={3} /> Building
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expanded Structure Details */}
                                                        {isExpanded && (
                                                            <div style={{ marginTop: '4px', padding: '12px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                {/* Phases list */}
                                                                <div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Phases ({phasesList.length})</span>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => openAddPhaseModal(p.id, p.name)}
                                                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                                        >
                                                                            + Add
                                                                        </button>
                                                                    </div>
                                                                    {phasesList.length === 0 ? (
                                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No phases defined yet</span>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {phasesList.map(ph => (
                                                                                <span key={ph.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                                                                    {ph.name}
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => handleDeletePhase(ph.id, ph.name)}
                                                                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                                                        title={`Delete phase ${ph.name}`}
                                                                                    >
                                                                                        <X size={12}/>
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Buildings list */}
                                                                <div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Buildings ({buildingsList.length})</span>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => openAddBuildingModal(p.id, p.name)}
                                                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                                        >
                                                                            + Add
                                                                        </button>
                                                                    </div>
                                                                    {buildingsList.length === 0 ? (
                                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No buildings defined yet</span>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {buildingsList.map(b => (
                                                                                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: 'var(--text-main)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid #e2e8f0' }}>
                                                                                    🏢 {b.name} {b.floors_count ? `(${b.floors_count}F)` : ''}
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => handleDeleteBuilding(b.id, b.name)}
                                                                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                                                        title={`Delete building ${b.name}`}
                                                                                    >
                                                                                        <X size={12}/>
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : (
                                (hierarchyTree.developers || []).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                                        <Building size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                        <p style={{ fontWeight: 700, margin: '0 0 12px 0' }}>No developers registered yet.</p>
                                        <button onClick={() => setShowQuickDevModal(true)} className="btn-primary-premium" style={{ height: '38px', fontSize: '13px' }}>
                                            <Plus size={14} /> Create First Developer
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                        {(hierarchyTree.developers || []).map(d => (
                                            <div key={d.id} style={{ padding: '18px', borderRadius: '12px', border: '1px solid var(--border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>{d.name}</h4>
                                                        <button 
                                                            onClick={() => handleDeleteDeveloper(d.id, d.name)}
                                                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                            title="Delete Developer"
                                                        >
                                                            <Trash2 size={15}/>
                                                        </button>
                                                    </div>
                                                    {d.contact_person && (
                                                        <div style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600, marginBottom: '2px' }}>
                                                            👤 {d.contact_person}
                                                        </div>
                                                    )}
                                                    {d.phone && (
                                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                            📞 {d.phone}
                                                        </div>
                                                    )}
                                                    {d.email && (
                                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                            ✉️ {d.email}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnitsRegistry;
