import React, { useState, useEffect } from 'react';
import { Package, ArrowRightLeft, Plus, CheckCircle, Database } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Modal from '../../components/Common/Modal';

const InventoryControl = () => {
    const [movements, setMovements] = useState([]);
    const [stockList, setStockList] = useState([]);
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        type: 'in',
        product_id: '',
        quantity: '',
        from_warehouse_id: '',
        to_warehouse_id: '',
        reference_type: 'manual',
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [movRes, stockRes, prodRes, whRes] = await Promise.all([
                api.get('/inventory/movements'),
                api.get('/inventory/stock'),
                api.get('/products'), 
                api.get('/inventory/warehouses')
            ]);
            setMovements(movRes.data.data || []);
            setStockList(stockRes.data.data || []);
            setProducts(prodRes.data.data || []);
            setWarehouses(whRes.data.data || []);
        } catch (err) {
            toast.error('Failed to load Inventory data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = { ...formData };
            if (!payload.from_warehouse_id) delete payload.from_warehouse_id;
            if (!payload.to_warehouse_id) delete payload.to_warehouse_id;

            await api.post('/inventory/movements', payload);
            toast.success('Movement created! (Pending Approval)');
            setIsModalOpen(false);
            fetchData();
            // Reset
            setFormData({ type: 'in', product_id: '', quantity: '', from_warehouse_id: '', to_warehouse_id: '', reference_type: 'manual' });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create movement');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApprove = async (id) => {
        if (!window.confirm('Approve and apply this movement to the live ledger?')) return;
        try {
            await api.put(`/inventory/movements/${id}/approve`);
            toast.success('Movement applied to stock balance!');
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve movement');
        }
    };

    return (
        <div className="inventory-control-page">
            <style>{`
                .inv-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
                .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s;}
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }

                .stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
                .stock-card { background: var(--bg-card); padding: 16px; border-radius: 12px; border: 1px solid var(--glass-border); display: flex; flex-direction: column; }
                
                .inv-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); }
                .inv-table th, .inv-table td { padding: 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
                .inv-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; }
                
                .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; text-transform: uppercase;}
                .badge-in { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .badge-out { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                .badge-transfer { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
                .badge-adjustment { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                
                .form-group { margin-bottom: 16px; }
                .form-group label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--text-muted); }
                .form-group input, .form-group select { width: 100%; padding: 10px 12px; border: 1px solid var(--glass-border); border-radius: 8px; background: transparent; color: var(--text-main); font-size: 14px; outline: none; }
            `}</style>
            
            <div className="inv-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '900', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Database size={28} color="var(--primary)"/> Inventory Engine
                    </h2>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Event Sourced Logistics & Stock Ledger</p>
                </div>
                <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} /> Create Movement
                </button>
            </div>

            {/* Live Stock Aggregator */}
            <div className="stock-grid">
                {stockList.slice(0, 8).map(stock => (
                    <div key={stock.product_id} className="stock-card">
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{stock.product_sku || `Prod #${stock.product_id}`}</span>
                        <span style={{ fontSize: '16px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stock.product_name}</span>
                        <span style={{ fontSize: '24px', fontWeight: 900, color: stock.current_stock < 5 ? '#ef4444' : 'var(--primary)', marginTop: '8px' }}>
                            {stock.current_stock}
                        </span>
                    </div>
                ))}
            </div>

            <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}><ArrowRightLeft size={18}/> Movement Ledger</h3>
            <table className="inv-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Product</th>
                        <th>Origin <span style={{opacity:0.5}}>→</span> Destination</th>
                        <th>Qty</th>
                        <th>Source Ref</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px' }}>Loading Logistics Matrix...</td></tr>
                    ) : movements.length === 0 ? (
                        <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No movements recorded in the ledger.</td></tr>
                    ) : movements.map(mov => (
                        <tr key={mov.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>MOV-{String(mov.id).padStart(4, '0')}</td>
                            <td>
                                <span className={`badge badge-${mov.type}`}>
                                    {mov.type}
                                </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Package size={14} color="var(--text-muted)"/>
                                    {mov.product_name}
                                </div>
                            </td>
                            <td style={{ fontSize: '13px' }}>
                                <span style={{ color: mov.from_warehouse_name ? 'var(--text-main)' : 'var(--text-muted)' }}>{mov.from_warehouse_name || 'System / Vendor'}</span>
                                <ArrowRightLeft size={12} style={{ margin: '0 8px', opacity: 0.5 }}/>
                                <span style={{ color: mov.to_warehouse_name ? 'var(--text-main)' : 'var(--text-muted)' }}>{mov.to_warehouse_name || 'System / Target'}</span>
                            </td>
                            <td style={{ fontWeight: 800, fontSize: '16px', color: mov.type==='out' ? '#ef4444' : mov.type==='in' ? '#10b981' : 'var(--primary)' }}>
                                {mov.type === 'out' ? '-' : mov.type === 'in' ? '+' : ''}{parseFloat(mov.quantity)}
                            </td>
                            <td>
                                <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: '6px', textTransform: 'uppercase' }}>
                                    {mov.reference_type || 'Manual'}
                                </span>
                                {mov.reference_id && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>#{mov.reference_id}</span>}
                            </td>
                            <td>
                                {mov.status === 'approved' ? <span style={{color: '#10b981', fontWeight: 800, fontSize: '12px'}}><CheckCircle size={12}/> Applied</span> 
                                : <span style={{color: '#f59e0b', fontWeight: 800, fontSize: '12px'}}>Pending</span>}
                            </td>
                            <td>
                                {mov.status === 'pending' && (
                                    <button onClick={() => handleApprove(mov.id)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                                        Approve
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* CREATE MOVEMENT MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Issue Logistics Movement">
                <form onSubmit={handleSubmit} style={{ color: 'black' }}>
                    <div className="form-group">
                        <label>Movement Type</label>
                        <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} style={{ fontWeight: 700 }}>
                            <option value="in">IN (Purchase/Restock)</option>
                            <option value="out">OUT (Sale/Consumption)</option>
                            <option value="transfer">TRANSFER (Warehouse to Warehouse)</option>
                            <option value="adjustment">ADJUSTMENT (Audit Correction)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Target Product</label>
                        <select value={formData.product_id} onChange={(e) => setFormData({...formData, product_id: e.target.value})} required>
                            <option value="">-- Select Product --</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Quantity</label>
                        <input type="number" min="0.01" step="0.01" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: e.target.value})} required />
                    </div>

                    {(formData.type === 'out' || formData.type === 'transfer' || formData.type === 'adjustment') && (
                        <div className="form-group">
                            <label>From Warehouse (Source)</label>
                            <select value={formData.from_warehouse_id} onChange={(e) => setFormData({...formData, from_warehouse_id: e.target.value})} required={formData.type === 'transfer'}>
                                <option value="">-- Main Branch Scope / System --</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    )}

                    {(formData.type === 'in' || formData.type === 'transfer' || formData.type === 'adjustment') && (
                        <div className="form-group">
                            <label>To Warehouse (Destination)</label>
                            <select value={formData.to_warehouse_id} onChange={(e) => setFormData({...formData, to_warehouse_id: e.target.value})} required={formData.type === 'transfer'}>
                                <option value="">-- Main Branch Scope / System --</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Processing...' : 'Queue Movement'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default InventoryControl;
