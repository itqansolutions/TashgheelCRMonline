import React, { useState, useEffect } from 'react';
import { Building2, Building, Plus, Search, UserCheck, Trash2, CheckCircle2, XCircle, Clock, X, LayoutGrid, List, Map, Sparkles, ArrowRight, ChevronDown, ChevronUp, Layers, Phone, Mail, User, MapPin, FileText, KeyRound, AlertTriangle, Globe, UploadCloud, ExternalLink } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { safeArray } from '../../utils/dataUtils';
import { useLanguage } from '../../context/LanguageContext';

export const formatN2 = (val) => {
    if (val === '' || val === null || val === undefined) return '';
    const num = Number(String(val).replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const UnitsRegistry = () => {
    const { user } = useAuth();
    const { t, isRTL } = useLanguage();
    const [searchParams] = useSearchParams();
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
            toast.error(t('realEstate.unitsRegistry.toastLoadUnitsError'));
        } finally {
            setLoading(false);
        }
    };

    const handleExtendReservation = async (unitId, hours) => {
        try {
            const res = await api.post(`/re-units/${unitId}/extend-reservation`, { extensionHours: hours });
            if (res.data?.success) {
                toast.success(t('realEstate.unitsRegistry.toastExtendSuccess', { hours }));
                if (res.data.data) {
                    setSelectedUnit(prev => prev ? { ...prev, ...res.data.data } : null);
                }
                fetchUnits();
            } else {
                toast.error(res.data?.message || t('realEstate.unitsRegistry.toastExtendError'));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastExtendError'));
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
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastMatchBuyersError'));
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

    // Sync URL tab with hierarchy management modal
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'developers') {
            setHierarchyTab('developers');
            setShowManageHierarchyModal(true);
        } else if (tab === 'projects' || tab === 'phases' || tab === 'buildings') {
            setHierarchyTab('projects');
        }
    }, [searchParams]);

    // Close topmost modal on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showQuickBuildingModal) setShowQuickBuildingModal(false);
                else if (showQuickPhaseModal) setShowQuickPhaseModal(false);
                else if (showQuickProjModal) setShowQuickProjModal(false);
                else if (showQuickDevModal) setShowQuickDevModal(false);
                else if (showMatchBuyersModal) setShowMatchBuyersModal(false);
                else if (selectedUnit) setSelectedUnit(null);
                else if (showAddModal) setShowAddModal(false);
                else if (showManageHierarchyModal) setShowManageHierarchyModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        showQuickBuildingModal, showQuickPhaseModal, showQuickProjModal, showQuickDevModal,
        showMatchBuyersModal, selectedUnit, showAddModal, showManageHierarchyModal
    ]);

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
            toast.error(t('realEstate.unitsRegistry.toastDevNameRequired'));
            return;
        }
        setCreatingDev(true);
        try {
            const res = await api.post('/re-hierarchy/developers', newDevForm);
            toast.success(t('realEstate.unitsRegistry.toastDevCreated', { name: newDevForm.name }));
            const createdDev = res.data?.data;
            await fetchHierarchy();
            if (createdDev && createdDev.id) {
                setFormData(prev => ({ ...prev, developer_id: createdDev.id }));
            }
            setNewDevForm({ name: '', contact_person: '', phone: '', email: '' });
            setShowQuickDevModal(false);
        } catch (err) {
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastDevCreateError'));
        } finally {
            setCreatingDev(false);
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (!newProjForm.name.trim()) {
            toast.error(t('realEstate.unitsRegistry.toastProjNameRequired'));
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
            toast.success(t('realEstate.unitsRegistry.toastProjCreated', { name: newProjForm.name }));
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
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastProjCreateError'));
        } finally {
            setCreatingProj(false);
        }
    };

    const handleDeleteDeveloper = async (id, name) => {
        if (!window.confirm(t('realEstate.unitsRegistry.confirmDeleteDev', { name }))) return;
        try {
            await api.delete(`/re-hierarchy/developers/${id}`);
            toast.success(t('realEstate.unitsRegistry.toastDevDeleted'));
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastDevDeleteError'));
        }
    };

    const handleDeleteProject = async (id, name) => {
        if (!window.confirm(t('realEstate.unitsRegistry.confirmDeleteProj', { name }))) return;
        try {
            await api.delete(`/re-hierarchy/projects/${id}`);
            toast.success(t('realEstate.unitsRegistry.toastProjDeleted'));
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastProjDeleteError'));
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
            toast.error(t('realEstate.unitsRegistry.toastSelectProjForPhase'));
            return;
        }
        if (!newPhaseForm.name.trim()) {
            toast.error(t('realEstate.unitsRegistry.toastPhaseNameRequired'));
            return;
        }
        setCreatingPhase(true);
        try {
            const res = await api.post('/re-hierarchy/phases', {
                project_id: newPhaseForm.project_id,
                name: newPhaseForm.name.trim()
            });
            toast.success(t('realEstate.unitsRegistry.toastPhaseCreated', { name: newPhaseForm.name }));
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
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastPhaseCreateError'));
        } finally {
            setCreatingPhase(false);
        }
    };

    const handleCreateBuilding = async (e) => {
        e.preventDefault();
        if (!newBuildingForm.project_id) {
            toast.error(t('realEstate.unitsRegistry.toastSelectProjForBuilding'));
            return;
        }
        if (!newBuildingForm.name.trim()) {
            toast.error(t('realEstate.unitsRegistry.toastBuildingNameRequired'));
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
            toast.success(t('realEstate.unitsRegistry.toastBuildingCreated', { name: newBuildingForm.name }));
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
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastBuildingCreateError'));
        } finally {
            setCreatingBuilding(false);
        }
    };

    const handleDeletePhase = async (id, name) => {
        if (!window.confirm(t('realEstate.unitsRegistry.confirmDeletePhase', { name }))) return;
        try {
            await api.delete(`/re-hierarchy/phases/${id}`);
            toast.success(t('realEstate.unitsRegistry.toastPhaseDeleted', { name }));
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastPhaseDeleteError'));
        }
    };

    const handleDeleteBuilding = async (id, name) => {
        if (!window.confirm(t('realEstate.unitsRegistry.confirmDeleteBuilding', { name }))) return;
        try {
            await api.delete(`/re-hierarchy/buildings/${id}`);
            toast.success(t('realEstate.unitsRegistry.toastBuildingDeleted', { name }));
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastBuildingDeleteError'));
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
            toast.success(t('realEstate.unitsRegistry.toastUnitAdded'));
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
            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastAddUnitError'));
        }
    };

    const handleAssignEmployee = async (unitId, employeeId) => {
        try {
            await api.put(`/re-units/${unitId}`, { assigned_to: employeeId || null });
            toast.success(employeeId ? t('realEstate.unitsRegistry.toastEmployeeAssigned') : t('realEstate.unitsRegistry.toastAssignmentCleared'));
            fetchUnits();
            // Update selected unit in-place so modal shows new name immediately
            setSelectedUnit(prev => ({ ...prev, assigned_to: employeeId || null }));
        } catch(err) {
            toast.error(t('realEstate.unitsRegistry.toastAssignError'));
        }
    };

    const handleDelete = async (id) => {
        const targetUnit = units.find(u => u.id === id);
        if (targetUnit && (targetUnit.vendor_id || targetUnit.status?.toLowerCase() !== 'available')) {
            toast.error(t('realEstate.unitsRegistry.assetLockedError'));
            return;
        }
        if (!window.confirm(t('realEstate.unitsRegistry.confirmDeleteProperty'))) return;
        try {
            await api.delete(`/re-units/${id}`);
            toast.success(t('realEstate.unitsRegistry.toastUnitDeleted'));
            fetchUnits();
        } catch (err) {
            toast.error(t('realEstate.unitsRegistry.toastUnitDeleteError'));
        }
    };

    const getStatusConfig = (status) => {
        const s = status?.toLowerCase() || 'unknown';
        switch (s) {
            case 'available': return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', icon: <CheckCircle2 size={13}/>, glow: 'status-glow-success' };
            case 'reserved': return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', icon: <Clock size={13}/>, glow: 'status-glow-warning' };
            case 'contracted': return { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', icon: <FileText size={13}/>, glow: 'status-glow-info' };
            case 'handed over': return { bg: 'rgba(13, 148, 136, 0.12)', color: '#0d9488', icon: <KeyRound size={13}/>, glow: 'status-glow-success' };
            case 'under dispute': return { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', icon: <AlertTriangle size={13}/>, glow: 'status-glow-danger' };
            case 'sold': return { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', icon: <FileText size={13}/>, glow: '' };
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
        <div className="wow-reveal" dir={isRTL ? 'rtl' : 'ltr'} style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
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
                        {[{ key: 'map', icon: <Map size={15}/>, label: t('realEstate.unitsRegistry.viewMap') }, { key: 'cards', icon: <LayoutGrid size={15}/>, label: t('realEstate.unitsRegistry.viewCards') }, { key: 'list', icon: <List size={15}/>, label: t('realEstate.unitsRegistry.viewList') }].map(v => (
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
                    <Search size={18} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                    <input 
                        className="ap-input" 
                        placeholder={t('realEstate.unitsRegistry.searchPlaceholder')} 
                        style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: '48px', border: 'none', background: 'transparent', height: '40px' }}
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
                    <option value="all">{t('realEstate.unitsRegistry.allProjects')}</option>
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
                        <option value="all">{t('realEstate.unitsRegistry.allPhases')}</option>
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
                        <option value="all">{t('realEstate.unitsRegistry.allBuildings')}</option>
                        {activeProjectBuildings.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}

                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" placeholder={t('realEstate.unitsRegistry.minEgp')} className="ap-input" style={{ width: '110px', height: '40px' }} value={budgetMin} onChange={e => setBudgetMin(e.target.value)} />
                    <input type="number" placeholder={t('realEstate.unitsRegistry.maxEgp')} className="ap-input" style={{ width: '110px', height: '40px' }} value={budgetMax} onChange={e => setBudgetMax(e.target.value)} />
                </div>
                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                
                <select className="ap-input" style={{ width: '160px', height: '40px' }} value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}>
                    <option value="all">{t('realEstate.unitsRegistry.allEmployees')}</option>
                    {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>

                <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.03)', padding: '5px', borderRadius: '12px', gap: '3px', flexWrap: 'wrap' }}>
                    {[
  { key: 'All', label: t('realEstate.unitsRegistry.tabAll') },
  { key: 'Available', label: t('realEstate.unitsRegistry.tabAvailable') },
  { key: 'Reserved', label: t('realEstate.unitsRegistry.tabReserved') },
  { key: 'Contracted', label: t('realEstate.unitsRegistry.tabContracted') },
  { key: 'Handed Over', label: t('realEstate.unitsRegistry.tabHandedOver') },
  { key: 'Under Dispute', label: t('realEstate.unitsRegistry.tabUnderDispute') },
].map(tab => (
                        <button 
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            style={{ 
                                padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 800,
                                background: filter === tab.key ? 'white' : 'transparent',
                                color: filter === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: filter === tab.key ? 'var(--shadow-md)' : 'none',
                                transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>
                    <div className="wow-float" style={{ marginBottom: '16px' }}><Building2 size={48} opacity={0.3}/></div>
                    <p style={{ fontWeight: 600 }}>{t('realEstate.unitsRegistry.syncingInventory')}</p>
                </div>
            ) : filteredUnits.length === 0 ? (
                <div style={{ padding: '80px', textAlign: 'center' }}>
                   <div className="ap-card" style={{ padding: '60px', background: 'rgba(0,0,0,0.01)', borderStyle: 'dashed', borderWidth: '2px' }}>
                        <div className="wow-float" style={{ marginBottom: '20px' }}>
                            <Building2 size={64} opacity={0.1}/>
                        </div>
                        <h3 style={{ fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>{t('realEstate.unitsRegistry.noPropertiesFound')}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>{t('realEstate.unitsRegistry.adjustFilters')}</p>
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
                                    <span className="num-en">{Object.values(floors).flat().length}</span> {t('realEstate.unitsRegistry.unitCountLabel', { count: '' }).trim()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {Object.entries(floors).sort(([a],[b]) => parseInt(b || 0) - parseInt(a || 0)).map(([floor, sortedUnits]) => (
                                    <div key={floor} style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
                                        <div style={{ width: '80px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{t('realEstate.unitsRegistry.floorLabel')}</span>
                                            <span className="num-en" style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-main)' }}>{floor}</span>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.01)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            {sortedUnits.map(u => {
                                                const config = getStatusConfig(u.status);
                                                return (
                                                    <div key={u.id} title={t('realEstate.unitsRegistry.clickDetails')} onClick={() => setSelectedUnit(u)}
                                                        style={{ padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', background: config.bg, color: config.color, border: `1px solid ${config.color}40`, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '110px' }}
                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 6px 12px ${config.bg}`; }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span className="num-en" style={{ fontWeight: 900, fontSize: '16px' }}>{u.unit_number}</span>
                                                            {config.icon}
                                                        </div>
                                                        <div style={{ fontSize: '10px', fontWeight: 800, opacity: 0.9, textTransform: 'uppercase' }}>
                                                            {u.type === 'Apartment' ? 'APT' : u.type === 'Commercial' ? 'COM' : u.type === 'Villa' ? 'VIL' : 'UNT'} • <span className="num-en">{u.area_sqm}</span>m²
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
                                            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.unitPrefix', { number: u.unit_number })}</div>
                                        </div>
                                        <span style={{ background: config.bg, color: config.color, padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 900 }}>{u.status}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>{t('realEstate.unitsRegistry.cardType')}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 800 }}>{u.type}</div>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>{t('realEstate.unitsRegistry.cardArea')}</div>
                                            <div style={{ fontSize: '13px', fontWeight: 800 }}><span className="num-en">{u.area_sqm}</span> m²</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)', marginBottom: '8px' }}><span className="num-en">{Number(u.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {t('realEstate.common.currencySuffix')}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        <span>{t('realEstate.unitsRegistry.floorRooms', { floor: u.floor, rooms: u.rooms })}</span>
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
                                {[
  t('realEstate.unitsRegistry.thUnit'),
  t('realEstate.unitsRegistry.thProject'),
  t('realEstate.unitsRegistry.thType'),
  t('realEstate.unitsRegistry.thArea'),
  t('realEstate.unitsRegistry.thPrice'),
  t('realEstate.unitsRegistry.thStatus'),
  t('realEstate.unitsRegistry.thEmployee'),
  t('realEstate.unitsRegistry.thActions')
].map(h => (
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
                                        <td style={{ padding: '14px 16px', fontWeight: 900, fontSize: '15px', color: 'var(--text-main)' }}><span className="num-en">{u.unit_number}</span></td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{u.project_name || '—'}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}>{u.type}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700 }}><span className="num-en">{u.area_sqm}</span> m²</td>
                                        <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--primary)' }}><span className="num-en">{Number(u.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ background: config.bg, color: config.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 900 }}>{u.status}</span>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            {u.assigned_to_name || users.find(em => String(em.id) === String(u.assigned_to))?.name || <span style={{ fontStyle: 'italic' }}>{t('realEstate.unitsRegistry.unassigned')}</span>}
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowAddModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.4)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
                >
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '650px', padding: '40px', background: 'white', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button 
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            style={{ position: 'absolute', top: '24px', [isRTL ? 'left' : 'right']: '24px', padding: '8px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}
                            title={t('common.close') || 'Close'}
                        >
                            <X size={18}/>
                        </button>

                        <div style={{ marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '26px', fontWeight: 900, marginBottom: '8px' }}>{t('realEstate.unitsRegistry.modalAddTitle')}</h2>
                            <p style={{ color: 'var(--text-muted)' }}>{t('realEstate.unitsRegistry.modalAddSubtitle')}</p>
                        </div>

                        <form onSubmit={handleAddUnit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                                {/* Core Identity & Project Hierarchy */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('realEstate.unitsRegistry.secHierarchy')}</h4>
                                </div>
                                <div className="ap-form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="ap-label" style={{ margin: 0 }}>{t('realEstate.unitsRegistry.lblDeveloper')}</label>
                                        <button 
                                            type="button" 
                                            onClick={() => setShowQuickDevModal(true)}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={12} strokeWidth={3} /> {t('realEstate.unitsRegistry.btnAddDeveloper')}
                                        </button>
                                    </div>
                                    <select 
                                        className="ap-input" 
                                        value={formData.developer_id || ''} 
                                        onChange={e => setFormData({ ...formData, developer_id: e.target.value })}
                                    >
                                        <option value="">{t('realEstate.unitsRegistry.optNoDev')}</option>
                                        {(hierarchyTree.developers || []).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="ap-label" style={{ margin: 0 }}>{t('realEstate.unitsRegistry.lblProject')}</label>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setNewProjForm(p => ({ ...p, developer_id: formData.developer_id || '' }));
                                                setShowQuickProjModal(true);
                                            }}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={12} strokeWidth={3} /> {t('realEstate.unitsRegistry.btnAddProject')}
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
                                        <option value="">{t('realEstate.unitsRegistry.optCustomProject')}</option>
                                        {(hierarchyTree.projects || []).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}{p.developer_name ? ` (${p.developer_name})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                {!formData.project_id && (
                                    <div className="ap-form-group">
                                        <label className="ap-label">{t('realEstate.unitsRegistry.lblProjectName')}</label>
                                        <input className="ap-input" required value={formData.project_name} onChange={e => setFormData({...formData, project_name: e.target.value})} placeholder={t('realEstate.unitsRegistry.placeholderProjectName')} />
                                    </div>
                                )}
                                {formData.project_id && (
                                    <>
                                        <div className="ap-form-group">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label className="ap-label" style={{ margin: 0 }}>{t('realEstate.unitsRegistry.lblPhase')}</label>
                                                <button 
                                                    type="button" 
                                                    onClick={() => openAddPhaseModal(formData.project_id)}
                                                    style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Plus size={12} strokeWidth={3} /> {t('realEstate.unitsRegistry.btnAddPhase')}
                                                </button>
                                            </div>
                                            <select 
                                                className="ap-input" 
                                                value={formData.phase_id || ''} 
                                                onChange={e => setFormData({ ...formData, phase_id: e.target.value })}
                                            >
                                                <option value="">{t('realEstate.unitsRegistry.optSelectPhase')}</option>
                                                {(hierarchyTree.projects?.find(p => String(p.id) === String(formData.project_id))?.phases || []).map(ph => (
                                                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="ap-form-group">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label className="ap-label" style={{ margin: 0 }}>{t('realEstate.unitsRegistry.lblBuilding')}</label>
                                                <button 
                                                    type="button" 
                                                    onClick={() => openAddBuildingModal(formData.project_id, '', formData.phase_id)}
                                                    style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Plus size={12} strokeWidth={3} /> {t('realEstate.unitsRegistry.btnAddBuilding')}
                                                </button>
                                            </div>
                                            <select 
                                                className="ap-input" 
                                                value={formData.building_id || ''} 
                                                onChange={e => setFormData({ ...formData, building_id: e.target.value })}
                                            >
                                                <option value="">{t('realEstate.unitsRegistry.optSelectBuilding')}</option>
                                                {(hierarchyTree.projects?.find(p => String(p.id) === String(formData.project_id))?.buildings || []).map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}{b.floors_count ? ` ${t('realEstate.unitsRegistry.buildingFloorsSuffix', { count: b.floors_count })}` : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblUnitNumber')}</label>
                                    <input className="ap-input" required value={formData.unit_number} onChange={e => setFormData({...formData, unit_number: e.target.value})} placeholder={t('realEstate.unitsRegistry.placeholderUnitNumber')} />
                                </div>

                                {/* Linkages */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px', marginTop: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('realEstate.unitsRegistry.secOwnership')}</h4>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblAssignedEmployee')}</label>
                                    <select className="ap-input" value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}>
                                        <option value="">{t('realEstate.unitsRegistry.optSystemDecide')}</option>
                                        {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblVendor')}</label>
                                    <select className="ap-input" value={formData.vendor_id} onChange={e => setFormData({...formData, vendor_id: e.target.value})}>
                                        <option value="">{t('realEstate.unitsRegistry.optIndependentVendor')}</option>
                                        {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </div>

                                {/* Specifications */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px', marginTop: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('realEstate.unitsRegistry.secTechSpecs')}</h4>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblPropertyType')}</label>
                                    <select className="ap-input" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                        <option value="Apartment">Luxury Apartment</option>
                                        <option value="Villa">Premium Villa</option>
                                        <option value="Commercial">Commercial/Retail</option>
                                        <option value="Office">Business Unit</option>
                                    </select>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblAreaSqm')}</label>
                                    <input className="ap-input" type="number" required value={formData.area_sqm} onChange={e => setFormData({...formData, area_sqm: e.target.value})} placeholder={t('realEstate.unitsRegistry.placeholderArea')} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblRooms')}</label>
                                    <input className="ap-input" type="number" required value={formData.rooms} onChange={e => setFormData({...formData, rooms: e.target.value})} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-label">{t('realEstate.unitsRegistry.lblFloor')}</label>
                                    <input className="ap-input" type="number" required value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} />
                                </div>

                                {/* Commercials */}
                                <div style={{ gridColumn: 'span 2', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '8px', marginTop: '8px' }}>
                                    <h4 style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('realEstate.unitsRegistry.secPricing')}</h4>
                                </div>
                                <div className="ap-form-group" style={{ gridColumn: 'span 2' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="ap-label" style={{ margin: 0 }}>{t('realEstate.unitsRegistry.lblTargetPrice')}</label>
                                        {formData.price && (
                                            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                                                {t('realEstate.unitsRegistry.n2FormatNotice', { formatted: formatN2(formData.price) })}
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
                                <button type="submit" className="btn-primary-premium" style={{ flex: 1, justifyContent: 'center', height: '56px' }}>{t('realEstate.unitsRegistry.btnConfirmReg')}</button>
                                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '0 32px', borderRadius: '12px', border: '2px solid var(--border)', fontWeight: 800, color: 'var(--text-muted)' }}>{t('realEstate.unitsRegistry.btnDiscard')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Read-Only Unit Details Modal */}
            {selectedUnit && (
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setSelectedUnit(null);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}
                >
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', padding: '0', background: 'white', position: 'relative', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
                        {(() => {
                            const config = getStatusConfig(selectedUnit.status);
                            return (
                                <>
                                    <div style={{ padding: '20px 24px', background: config.bg, borderBottom: `1px solid ${config.color}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '12px', fontWeight: 900, color: config.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', wordBreak: 'break-word' }}>
                                                {selectedUnit.developer_name ? `${selectedUnit.developer_name} • ` : ''}
                                                {selectedUnit.project_name || t('realEstate.unitsRegistry.individual')}
                                                {selectedUnit.phase_name ? ` • ${selectedUnit.phase_name}` : ''}
                                                {selectedUnit.building_name ? ` • ${selectedUnit.building_name}` : ''}
                                            </div>
                                            <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 900, color: 'var(--text-main)', wordBreak: 'break-all', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
                                                {t('realEstate.unitsRegistry.unitPrefix', { number: selectedUnit.unit_number })}
                                            </h2>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isRTL ? 'flex-start' : 'flex-end', gap: '8px', flexShrink: 0 }}>
                                            <button 
                                                type="button"
                                                onClick={() => setSelectedUnit(null)} 
                                                title={t('common.close') || 'إغلاق'}
                                                aria-label={t('common.close') || 'إغلاق'}
                                                style={{ 
                                                    width: '36px', 
                                                    height: '36px', 
                                                    borderRadius: '50%', 
                                                    background: 'rgba(0,0,0,0.06)', 
                                                    border: 'none', 
                                                    cursor: 'pointer', 
                                                    color: 'var(--text-main)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.12)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
                                            >
                                                <X size={20}/>
                                            </button>
                                            <div style={{ background: 'white', color: config.color, padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
                                                {selectedUnit.status || 'Available'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div style={{ padding: '28px 24px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{t('realEstate.unitsRegistry.drawerType')}</div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedUnit.type}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{t('realEstate.unitsRegistry.drawerMarketValue')}</div>
                                                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}><span className="num-en">{Number(selectedUnit.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {t('realEstate.common.currencySuffix')}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{t('realEstate.unitsRegistry.drawerArea')}</div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}><span className="num-en">{selectedUnit.area_sqm}</span> m²</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{t('realEstate.unitsRegistry.drawerLayout')}</div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.drawerFloorRooms', { floor: selectedUnit.floor || '—', rooms: selectedUnit.rooms ?? '—' })}</div>
                                            </div>
                                        </div>

                                        {/* Active Reservation & Extension */}
                                        {selectedUnit.status === 'Reserved' && (
                                            <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '16px' }}>
                                                <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Clock size={13}/> {t('realEstate.unitsRegistry.activeReservation')}
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '10px' }}>
                                                    <strong>{t('realEstate.unitsRegistry.lblExpires')}</strong> {selectedUnit.reservation_expires_at ? <span className="num-en">{new Date(selectedUnit.reservation_expires_at).toLocaleString('en-US')}</span> : t('realEstate.unitsRegistry.notSet')}
                                                    {Number(selectedUnit.reservation_extension_count) > 0 && (
                                                        <span style={{ marginLeft: '8px', padding: '2px 6px', background: '#fef3c7', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: '#b45309' }}>
                                                            {t('realEstate.unitsRegistry.extendedCount', { count: selectedUnit.reservation_extension_count })}
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
                                                <UserCheck size={13}/> {t('realEstate.unitsRegistry.employeeAssignment')}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={assigningEmployee}
                                                    onChange={e => setAssigningEmployee(e.target.value)}
                                                    style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, background: 'white', cursor: 'pointer' }}
                                                >
                                                    <option value="">{t('realEstate.unitsRegistry.optOpenEmployee')}</option>
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
                                                    {t('realEstate.unitsRegistry.currentlyAssigned', { name: selectedUnit.assigned_to_name || users.find(u => String(u.id) === String(selectedUnit.assigned_to))?.name || t('realEstate.common.confirmed') })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Property Finder Integration Panel */}
                                        <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '12px', border: '1px solid #bae6fd', marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Globe size={13}/> {t('realEstate.unitsRegistry.pfTitle')}
                                                </div>
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                                                    background: selectedUnit.pf_publication_status === 'published' ? '#dcfce7' : selectedUnit.pf_publication_status === 'rejected' ? '#fee2e2' : selectedUnit.pf_publication_status === 'pending_publication' ? '#fef3c7' : '#f1f5f9',
                                                    color: selectedUnit.pf_publication_status === 'published' ? '#15803d' : selectedUnit.pf_publication_status === 'rejected' ? '#b91c1c' : selectedUnit.pf_publication_status === 'pending_publication' ? '#b45309' : '#64748b'
                                                }}>
                                                    {selectedUnit.pf_publication_status ? selectedUnit.pf_publication_status.replace(/_/g, ' ').toUpperCase() : t('realEstate.unitsRegistry.pfNotPublished')}
                                                </span>
                                            </div>
                                            {selectedUnit.pf_rejection_reason && (
                                                <div style={{ fontSize: '11px', color: '#b91c1c', marginBottom: '8px', padding: '6px 8px', background: '#fef2f2', borderRadius: '6px' }}>
                                                    {t('realEstate.unitsRegistry.pfRejection', { reason: selectedUnit.pf_rejection_reason })}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        try {
                                                            await api.post(`/propertyfinder/units/${selectedUnit.id}/publish`);
                                                            toast.success(t('realEstate.unitsRegistry.toastPfPublishSuccess'));
                                                            fetchUnits();
                                                            setSelectedUnit(prev => ({ ...prev, pf_publication_status: 'pending_publication' }));
                                                        } catch (err) {
                                                            toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastPfPublishError'));
                                                        }
                                                    }}
                                                    style={{ flex: 1, padding: '8px 12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                >
                                                    <UploadCloud size={13}/> {selectedUnit.pf_publication_status === 'published' ? t('realEstate.unitsRegistry.btnUpdatePf') : t('realEstate.unitsRegistry.btnPublishPf')}
                                                </button>
                                                {selectedUnit.pf_publication_status === 'published' && (
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            try {
                                                                await api.post(`/propertyfinder/units/${selectedUnit.id}/unpublish`);
                                                                toast.success(t('realEstate.unitsRegistry.toastPfUnpublishSuccess'));
                                                                fetchUnits();
                                                                setSelectedUnit(prev => ({ ...prev, pf_publication_status: 'unpublished' }));
                                                            } catch (err) {
                                                                toast.error(err.response?.data?.message || t('realEstate.unitsRegistry.toastPfUnpublishError'));
                                                            }
                                                        }}
                                                        style={{ padding: '8px 12px', background: '#64748b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                                    >
                                                        Unpublish
                                                    </button>
                                                )}
                                                {selectedUnit.pf_portal_url && (
                                                    <a
                                                        href={selectedUnit.pf_portal_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{ padding: '8px 12px', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', fontWeight: 700, fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                                                        title={t('realEstate.unitsRegistry.pfOpenTooltip')}
                                                    >
                                                        <ExternalLink size={13}/>
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button 
                                                    type="button"
                                                    onClick={() => handleOpenMatchBuyers(selectedUnit)}
                                                    className="btn-primary-premium"
                                                    style={{ flex: 1, justifyContent: 'center', background: '#3b82f6', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }}
                                                >
                                                    <Sparkles size={16} /> {t('realEstate.unitsRegistry.btnMatchBuyers')}
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        handleDelete(selectedUnit.id);
                                                        setSelectedUnit(null);
                                                    }}
                                                    className="btn-primary-premium"
                                                    style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }}
                                                >
                                                    <Trash2 size={16} /> {t('realEstate.unitsRegistry.btnDisableDelete')}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedUnit(null)}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    borderRadius: '10px',
                                                    border: '1.5px solid var(--border)',
                                                    background: '#f8fafc',
                                                    color: 'var(--text-main)',
                                                    fontWeight: 800,
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                                            >
                                                <X size={16} /> {t('common.close') || 'إغلاق'}
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowMatchBuyersModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}
                >
                    <div className="ap-card" style={{ width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', background: 'white', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px', wordBreak: 'break-word' }}>
                                    <Sparkles size={20} color="#eab308" /> {t('realEstate.unitsRegistry.matchBuyersTitle')}
                                </h3>
                                <div style={{ fontSize: '13px', color: '#64748b', wordBreak: 'break-word' }}>
                                    <span>{t('realEstate.unitsRegistry.matchBuyersDesc', { unit: matchedBuyersUnit.unit_number, project: matchedBuyersUnit.project_name || t('realEstate.unitsRegistry.individual'), price: Number(matchedBuyersUnit.price).toLocaleString('en-US'), area: matchedBuyersUnit.area_sqm, rooms: matchedBuyersUnit.rooms })}</span>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setShowMatchBuyersModal(false)} 
                                title={t('common.close') || 'Close'}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {loadingMatchedBuyers ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                                {t('realEstate.unitsRegistry.analyzingBuyers')}
                            </div>
                        ) : matchedBuyersList.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b', fontSize: '14px' }}>
                                {t('realEstate.unitsRegistry.noMatchedBuyers')}
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
                                                            {customer.budget_max && <span>{t('realEstate.unitsRegistry.maxBudgetLabel', { amount: Number(customer.budget_max).toLocaleString('en-US') })}</span>}
                                                            {customer.preferred_rooms && <span>{t('realEstate.unitsRegistry.roomsLabel', { count: customer.preferred_rooms })}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <a 
                                                        href={`/deals?new=1&client_id=${customer.id}&unit_id=${matchedBuyersUnit.id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ padding: '7px 14px', borderRadius: '8px', background: 'var(--primary)', color: 'white', textDecoration: 'none', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        {t('realEstate.unitsRegistry.btnCreateDeal')} <ArrowRight size={13} />
                                                    </a>
                                                    {isExpanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', background: '#fafafa', fontSize: '12px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('realEstate.unitsRegistry.scoreBudget')} {t('realEstate.unitsRegistry.ptsScore', { score: breakdown.budget.score, max: breakdown.budget.max })}</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.budget.reason}</div>
                                                        </div>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('realEstate.unitsRegistry.scoreArea')} {t('realEstate.unitsRegistry.ptsScore', { score: breakdown.area.score, max: breakdown.area.max })}</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.area.reason}</div>
                                                        </div>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('realEstate.unitsRegistry.scoreLocation')} {t('realEstate.unitsRegistry.ptsScore', { score: breakdown.location.score, max: breakdown.location.max })}</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.location.reason}</div>
                                                        </div>
                                                        <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('realEstate.unitsRegistry.scoreRooms')} {t('realEstate.unitsRegistry.ptsScore', { score: breakdown.rooms.score, max: breakdown.rooms.max })}</div>
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowQuickDevModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}
                >
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
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.devModalTitle')}</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{t('realEstate.unitsRegistry.devModalSubtitle')}</p>
                        </div>
                        <form onSubmit={handleCreateDeveloper}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblDevName')}</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder={t('realEstate.unitsRegistry.placeholderDevName')} 
                                    value={newDevForm.name} 
                                    onChange={e => setNewDevForm({ ...newDevForm, name: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblContactPerson')}</label>
                                <input 
                                    className="ap-input" 
                                    placeholder={t('realEstate.unitsRegistry.placeholderContactPerson')} 
                                    value={newDevForm.contact_person} 
                                    onChange={e => setNewDevForm({ ...newDevForm, contact_person: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblPhone')}</label>
                                <input 
                                    className="ap-input" 
                                    placeholder={t('realEstate.unitsRegistry.placeholderPhone')} 
                                    value={newDevForm.phone} 
                                    onChange={e => setNewDevForm({ ...newDevForm, phone: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblEmail')}</label>
                                <input 
                                    className="ap-input" 
                                    type="email" 
                                    placeholder={t('realEstate.unitsRegistry.placeholderEmail')} 
                                    value={newDevForm.email} 
                                    onChange={e => setNewDevForm({ ...newDevForm, email: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingDev} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingDev ? t('realEstate.unitsRegistry.saving') : t('realEstate.unitsRegistry.btnConfirmDev')}
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowQuickProjModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}
                >
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
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.projModalTitle')}</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{t('realEstate.unitsRegistry.projModalSubtitle')}</p>
                        </div>
                        <form onSubmit={handleCreateProject}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblProjName')}</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder={t('realEstate.unitsRegistry.placeholderProjName')} 
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
                                    <option value="">{t('realEstate.unitsRegistry.optNoDevDirect')}</option>
                                    {(hierarchyTree.developers || []).map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblLocation')}</label>
                                <input 
                                    className="ap-input" 
                                    placeholder={t('realEstate.unitsRegistry.placeholderLocation')} 
                                    value={newProjForm.location} 
                                    onChange={e => setNewProjForm({ ...newProjForm, location: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblDescription')}</label>
                                <textarea 
                                    className="ap-input" 
                                    rows={2}
                                    placeholder={t('realEstate.unitsRegistry.placeholderDescription')} 
                                    value={newProjForm.description} 
                                    onChange={e => setNewProjForm({ ...newProjForm, description: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingProj} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingProj ? t('realEstate.unitsRegistry.saving') : t('realEstate.unitsRegistry.btnConfirmProj')}
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowQuickPhaseModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}
                >
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
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.phaseModalTitle')}</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{t('realEstate.unitsRegistry.phaseModalSubtitle')}</p>
                        </div>
                        <form onSubmit={handleCreatePhase}>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblProjSelect')}</label>
                                <select 
                                    className="ap-input" 
                                    required
                                    value={newPhaseForm.project_id}
                                    onChange={e => setNewPhaseForm({ ...newPhaseForm, project_id: e.target.value })}
                                >
                                    <option value="">{t('realEstate.unitsRegistry.optSelectProject')}</option>
                                    {(hierarchyTree.projects || []).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblPhaseName')}</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder={t('realEstate.unitsRegistry.placeholderPhaseName')} 
                                    value={newPhaseForm.name} 
                                    onChange={e => setNewPhaseForm({ ...newPhaseForm, name: e.target.value })} 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={creatingPhase} className="btn-primary-premium" style={{ flex: 1, height: '46px', justifyContent: 'center' }}>
                                    {creatingPhase ? t('realEstate.unitsRegistry.saving') : t('realEstate.unitsRegistry.btnConfirmPhase')}
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowQuickBuildingModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '20px' }}
                >
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
                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.buildingModalTitle')}</h3>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{t('realEstate.unitsRegistry.buildingModalSubtitle')}</p>
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
                                    <option value="">{t('realEstate.unitsRegistry.optNoPhaseDirect')}</option>
                                    {(hierarchyTree.projects?.find(p => String(p.id) === String(newBuildingForm.project_id))?.phases || []).map(ph => (
                                        <option key={ph.id} value={ph.id}>{ph.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '14px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblBuildingName')}</label>
                                <input 
                                    className="ap-input" 
                                    required 
                                    placeholder={t('realEstate.unitsRegistry.placeholderBuildingName')} 
                                    value={newBuildingForm.name} 
                                    onChange={e => setNewBuildingForm({ ...newBuildingForm, name: e.target.value })} 
                                />
                            </div>
                            <div className="ap-form-group" style={{ marginBottom: '24px' }}>
                                <label className="ap-label">{t('realEstate.unitsRegistry.lblFloorsCount')}</label>
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
                                    {creatingBuilding ? t('realEstate.unitsRegistry.saving') : t('realEstate.unitsRegistry.btnConfirmBuilding')}
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
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowManageHierarchyModal(false);
                    }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: '20px' }}
                >
                    <div className="ap-card wow-reveal" style={{ width: '100%', maxWidth: '850px', padding: '0', background: 'white', position: 'relative', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '16px' }}>
                        {/* Header */}
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 4px 0', color: 'var(--text-main)' }}>{t('realEstate.unitsRegistry.catalogTitle')}</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{t('realEstate.unitsRegistry.catalogSubtitle')}</p>
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
                                {t('realEstate.unitsRegistry.tabProjects', { count: (hierarchyTree.projects || []).length })}
                            </button>
                            <button 
                                onClick={() => setHierarchyTab('developers')}
                                style={{ padding: '10px 18px', border: 'none', background: 'transparent', fontWeight: 800, fontSize: '14px', cursor: 'pointer', borderBottom: hierarchyTab === 'developers' ? '3px solid var(--primary)' : '3px solid transparent', color: hierarchyTab === 'developers' ? 'var(--primary)' : 'var(--text-muted)' }}
                            >
                                {t('realEstate.unitsRegistry.tabDevelopers', { count: (hierarchyTree.developers || []).length })}
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
                                {hierarchyTab === 'developers' ? t('realEstate.unitsRegistry.btnNewDev') : t('realEstate.unitsRegistry.btnNewProj')}
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
                            {hierarchyTab === 'projects' ? (
                                (hierarchyTree.projects || []).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                                        <Building2 size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                        <p style={{ fontWeight: 700, margin: '0 0 12px 0' }}>{t('realEstate.unitsRegistry.noProjectsRegistered')}</p>
                                        <button onClick={() => setShowQuickProjModal(true)} className="btn-primary-premium" style={{ height: '38px', fontSize: '13px' }}>
                                            <Plus size={14} /> {t('realEstate.unitsRegistry.btnCreateFirstProj')}
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
                                                                title={t('realEstate.unitsRegistry.btnDeleteProjTitle')}
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
                                                                <span>{t('realEstate.unitsRegistry.summaryPhasesBuildings', { phases: phasesList.length, buildings: buildingsList.length })}</span>
                                                                {isExpanded ? <ChevronUp size={14} color="var(--primary)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                                                            </button>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => openAddPhaseModal(p.id, p.name)}
                                                                    className="btn-secondary-modern"
                                                                    style={{ height: '28px', padding: '0 8px', fontSize: '11px', fontWeight: 800, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                    title={t('realEstate.unitsRegistry.addPhaseToProj')}
                                                                >
                                                                    <Plus size={11} strokeWidth={3} /> {t('realEstate.unitsRegistry.btnPhaseInline')}
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => openAddBuildingModal(p.id, p.name)}
                                                                    className="btn-secondary-modern"
                                                                    style={{ height: '28px', padding: '0 8px', fontSize: '11px', fontWeight: 800, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                    title={t('realEstate.unitsRegistry.addBuildingToProj')}
                                                                >
                                                                    <Plus size={11} strokeWidth={3} /> {t('realEstate.unitsRegistry.btnBuildingInline')}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expanded Structure Details */}
                                                        {isExpanded && (
                                                            <div style={{ marginTop: '4px', padding: '12px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                {/* Phases list */}
                                                                <div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{t('realEstate.unitsRegistry.phasesHeading', { count: phasesList.length })}</span>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => openAddPhaseModal(p.id, p.name)}
                                                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                                        >
                                                                            + Add
                                                                        </button>
                                                                    </div>
                                                                    {phasesList.length === 0 ? (
                                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>{t('realEstate.unitsRegistry.noPhasesDefined')}</span>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {phasesList.map(ph => (
                                                                                <span key={ph.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                                                                    {ph.name}
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => handleDeletePhase(ph.id, ph.name)}
                                                                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                                                        title={t('realEstate.unitsRegistry.deletePhaseTitle', { name: ph.name })}
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
                                                                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{t('realEstate.unitsRegistry.buildingsHeading', { count: buildingsList.length })}</span>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => openAddBuildingModal(p.id, p.name)}
                                                                            style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                                                        >
                                                                            + Add
                                                                        </button>
                                                                    </div>
                                                                    {buildingsList.length === 0 ? (
                                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>{t('realEstate.unitsRegistry.noBuildingsDefined')}</span>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {buildingsList.map(b => (
                                                                                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: 'var(--text-main)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: '1px solid #e2e8f0' }}>
                                                                                    🏢 {b.name} {b.floors_count ? `(${b.floors_count}F)` : ''}
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => handleDeleteBuilding(b.id, b.name)}
                                                                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                                                        title={t('realEstate.unitsRegistry.deleteBuildingTitle', { name: b.name })}
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
                                        <p style={{ fontWeight: 700, margin: '0 0 12px 0' }}>{t('realEstate.unitsRegistry.noDevelopersRegistered')}</p>
                                        <button onClick={() => setShowQuickDevModal(true)} className="btn-primary-premium" style={{ height: '38px', fontSize: '13px' }}>
                                            <Plus size={14} /> {t('realEstate.unitsRegistry.btnCreateFirstDev')}
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
                                                            title={t('realEstate.unitsRegistry.deleteDevTitle')}
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
