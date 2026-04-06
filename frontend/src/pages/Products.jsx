import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Package, Tag, DollarSign, List } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';

const Products = () => {
  const { products, fetchProducts, loading } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    cost_price: 0,
    selling_price: 0,
    category: ''
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
        category: product.category || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', sku: '', description: '', cost_price: 0, selling_price: 0, category: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
        toast.success('Product updated successfully');
      } else {
        await api.post('/products', formData);
        toast.success('Product added successfully');
      }
      fetchProducts(false);
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await api.delete(`/products/${id}`);
        toast.success('Product deleted');
        fetchProducts(false);
      } catch (err) {
        toast.error('Failed to delete product');
      }
    }
  };

  const columns = [
    { 
      key: 'name', 
      label: 'Product Name',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a' }}>
            <Package size={16} />
          </div>
          <span style={{ fontWeight: '600' }}>{val}</span>
        </div>
      )
    },
    { key: 'sku', label: 'SKU' },
    { key: 'category', label: 'Category' },
    { 
      key: 'cost_price', 
      label: 'Cost',
      render: (val) => `${val} EGP`
    },
    { 
      key: 'selling_price', 
      label: 'Price',
      render: (val) => <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{val} EGP</span>
    }
  ];

  return (
    <div className="products-page">
      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
        
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg-main); outline: none; }
        
        .btn-cancel { background: #f1f5f9; color: var(--text-muted); padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .btn-save { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; }
      `}</style>

      <div className="page-header">
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Products & Services</h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage your catalog, pricing, and costs.</p>
        </div>
        <button label="add product control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          Add Product
        </button>
      </div>

      <DataTable 
        title="Product Catalog"
        columns={columns}
        data={products}
        loading={loading}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit}>
              {editingProduct ? 'Update Product' : 'Create Product'}
            </button>
          </>
        }
      >
        <form className="form-grid">
          <div className="form-group full">
            <label>Product Name</label>
            <input 
              type="text" 
              placeholder="e.g. Premium Subscription"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>SKU / ID</label>
            <input 
              type="text" 
              placeholder="e.g. PRD-001"
              value={formData.sku}
              onChange={(e) => setFormData({...formData, sku: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <input 
              type="text" 
              placeholder="e.g. Services"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Cost Price (EGP)</label>
            <input 
              type="number" 
              value={formData.cost_price}
              onChange={(e) => setFormData({...formData, cost_price: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Selling Price (EGP)</label>
            <input 
              type="number" 
              value={formData.selling_price}
              onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
            />
          </div>
          <div className="form-group full">
            <label>Description</label>
            <textarea 
              rows="3"
              placeholder="Brief details about the product"
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
