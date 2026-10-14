import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Package, Tag, DollarSign, List } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import WarehouseSubNav from '../components/Warehouse/WarehouseSubNav';

const Products = () => {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { products, fetchProducts, loading } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    cost_price: 0,
    selling_price: 0,
    category: '',
    unit: 'piece',
    is_inventory_item: true
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        description: product.description || '',
        cost_price: product.cost_price || 0,
        selling_price: product.selling_price || 0,
        category: product.category || '',
        unit: product.unit || 'piece',
        is_inventory_item: product.is_inventory_item !== false
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', sku: '', description: '', cost_price: 0, selling_price: 0, category: '', unit: 'piece', is_inventory_item: true });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
        toast.success(t('inventory.products.productUpdated'));
      } else {
        await api.post('/products', formData);
        toast.success(t('inventory.products.productAdded'));
      }
      fetchProducts(false);
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || t('inventory.products.somethingWrong'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('inventory.products.confirmDelete'))) {
      try {
        await api.delete(`/products/${id}`);
        toast.success(t('inventory.products.productDeleted'));
        fetchProducts(false);
      } catch (err) {
        toast.error(t('inventory.products.failedDelete'));
      }
    }
  };

  const currencyLabel = t('common.currency', 'EGP');

  const columns = [
    { 
      key: 'name', 
      label: t('inventory.products.productName'),
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a' }}>
            <Package size={16} />
          </div>
          <span style={{ fontWeight: '600' }}>{val}</span>
        </div>
      )
    },
    { key: 'sku', label: t('inventory.products.sku'), render: (val) => <span className="num-en">{val || '—'}</span> },
    { key: 'unit', label: t('inventory.products.unit'), render: (val) => val || t('inventory.products.piece') },
    { key: 'is_inventory_item', label: t('inventory.products.inventoryType'), render: (val) => val === false ? t('inventory.products.serviceNonStock') : t('inventory.products.stockItem') },
    { key: 'category', label: t('inventory.products.category') },
    { 
      key: 'cost_price', 
      label: t('inventory.products.cost'),
      render: (val) => <span><span className="num-en">{val}</span> {currencyLabel}</span>
    },
    { 
      key: 'selling_price', 
      label: t('inventory.products.price'),
      render: (val) => <span style={{ fontWeight: '700', color: 'var(--primary)' }}><span className="num-en">{val}</span> {currencyLabel}</span>
    }
  ];

  return (
    <div className="products-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <WarehouseSubNav />
      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 0 24px; }
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer; border: none; }
        
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg-main); outline: none; }
        
        .btn-cancel { background: #f1f5f9; color: var(--text-muted); padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
        .btn-save { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
      `}</style>

      <div className="page-header">
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>{t('inventory.products.title')}</h2>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{t('inventory.products.subtitle')}</p>
        </div>
        <button label="add product control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          {t('inventory.products.addProduct')}
        </button>
      </div>

      <div style={{ padding: '0 24px' }}>
        <DataTable 
          title={t('inventory.products.catalogTitle')}
          columns={columns}
          data={products || []}
          loading={loading}
          onEdit={handleOpenModal}
          onDelete={handleDelete}
        />
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? t('inventory.products.editProduct') : t('inventory.products.newProduct')}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>{t('common.cancel')}</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit}>
              {editingProduct ? t('inventory.products.updateProduct') : t('inventory.products.createProduct')}
            </button>
          </>
        }
      >
        <form className="form-grid" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="form-group full">
            <label>{t('inventory.products.productName')}</label>
            <input 
              type="text" 
              placeholder={t('inventory.products.namePlaceholder')}
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('inventory.products.sku')}</label>
            <input 
              type="text" 
              placeholder={t('inventory.products.skuPlaceholder')}
              value={formData.sku}
              onChange={(e) => setFormData({...formData, sku: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>{t('inventory.products.category')}</label>
            <input 
              type="text" 
              placeholder={t('inventory.products.categoryPlaceholder')}
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>{t('inventory.products.unitOfMeasure')}</label>
            <input 
              type="text" 
              placeholder={t('inventory.products.unitPlaceholder')}
              value={formData.unit}
              onChange={(e) => setFormData({...formData, unit: e.target.value})}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '26px' }}>
            <input
              id="is_inventory_item"
              type="checkbox"
              checked={formData.is_inventory_item}
              onChange={(e) => setFormData({ ...formData, is_inventory_item: e.target.checked })}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="is_inventory_item" style={{ margin: 0, cursor: 'pointer' }}>{t('inventory.products.trackInventory')}</label>
          </div>
          <div className="form-group">
            <label>{t('inventory.products.costPrice', { currency: currencyLabel })}</label>
            <input 
              type="number" 
              className="num-en"
              value={formData.cost_price}
              onChange={(e) => setFormData({...formData, cost_price: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>{t('inventory.products.sellingPrice', { currency: currencyLabel })}</label>
            <input 
              type="number" 
              className="num-en"
              value={formData.selling_price}
              onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
            />
          </div>
          <div className="form-group full">
            <label>{t('inventory.products.description')}</label>
            <textarea 
              rows="3"
              placeholder={t('inventory.products.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            ></textarea>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Products;
