import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, CheckSquare, Calendar, Flag, User, Link as LinkIcon } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';

const Tasks = () => {
  const { customers, deals, users, fetchCustomers, fetchDeals, fetchUsers } = useData();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    due_date: '',
    assigned_to: '',
    director_id: '',
    follower_ids: [],
    parent_type: 'customer',
    parent_id: ''
  });

  const fetchTasks = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/tasks');
      setTasks(res.data.data);
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    if (customers.length === 0) fetchCustomers(false);
    if (deals.length === 0) fetchDeals(false);
    if (users.length === 0) fetchUsers(false);
  }, []);

  const handleOpenModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'medium',
        status: task.status || 'todo',
        due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
        assigned_to: task.assigned_to || '',
        director_id: task.director_id || '',
        follower_ids: task.followers ? task.followers.map(f => f.user_id) : [],
        parent_type: task.parent_type || 'customer',
        parent_id: task.parent_id || ''
      });
    } else {
      setEditingTask(null);
      setFormData({ 
        title: '', description: '', priority: 'medium', status: 'todo', due_date: '', 
        assigned_to: '', director_id: '', follower_ids: [], 
        parent_type: 'customer', parent_id: '' 
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, formData);
        toast.success('Task updated');
      } else {
        await api.post('/tasks', formData);
        toast.success('Task created');
      }
      fetchTasks(false);
      setIsModalOpen(false);
    } catch (err) {
      toast.error('Error saving task');
    }
  };

  const columns = [
    { 
      key: 'title', 
      label: 'Task Title',
      render: (val, item) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: '600' }}>{val}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.description?.substring(0, 30)}...</span>
        </div>
      )
    },
    { 
      key: 'in_charge_name', 
      label: 'Lead',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <User size={14} style={{ opacity: 0.6 }} />
          <span>{val || 'Unassigned'}</span>
        </div>
      )
    },
    { 
      key: 'director_name', 
      label: 'Director',
      render: (val) => val || '-'
    },
    { 
      key: 'priority', 
      label: 'Priority',
      render: (val) => {
        const colors = { low: '#f1f5f9', medium: '#fff7ed', high: '#fef2f2', urgent: '#450a0a' };
        const textColors = { low: '#64748b', medium: '#d97706', high: '#dc2626', urgent: '#fff' };
        return <span className="status-badge" style={{ background: colors[val], color: textColors[val] }}>{val}</span>
      }
    },
    { 
      key: 'status', 
      label: 'Status',
      render: (val) => (
        <span className="status-badge" style={{ border: '1px solid var(--border)', background: 'white' }}>
          {val.replace('_', ' ')}
        </span>
      )
    },
    { 
      key: 'due_date', 
      label: 'Due Date',
      render: (val) => val ? new Date(val).toLocaleDateString() : 'No date'
    }
  ];

  return (
    <div className="tasks-page">
      <style>{`
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg-main); }
        .btn-cancel { background: #f1f5f9; color: var(--text-muted); padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .btn-save { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .followers-select { height: 100px !important; }
      `}</style>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Tasks & Activities</h2>
          <p style={{ color: 'var(--text-muted)' }}>Organize your daily workflow and follow-ups.</p>
        </div>
        <button label="add task control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          New Task
        </button>
      </div>

      <DataTable 
        title="Active Tasks"
        columns={columns}
        data={tasks}
        loading={loading}
        onEdit={handleOpenModal}
        onDelete={async (id) => {
          if (window.confirm('Delete task?')) {
            await api.delete(`/tasks/${id}`);
            fetchTasks(false);
            toast.success('Task deleted');
          }
        }}
      />

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit}>Save Task</button>
          </>
        }
      >
        <form className="form-grid">
          <div className="form-group full">
            <label>Task Title</label>
            <input 
              type="text" 
              placeholder="e.g. Call client for follow-up"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Lead (In Charge)</label>
            <select value={formData.assigned_to} onChange={(e)=>setFormData({...formData, assigned_to: e.target.value})}>
              <option value="">-- Select Employee --</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Director/Manager</label>
            <select value={formData.director_id} onChange={(e)=>setFormData({...formData, director_id: e.target.value})}>
              <option value="">-- Select Director --</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={formData.priority} onChange={(e)=>setFormData({...formData, priority: e.target.value})}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="form-group">
            <label>Due Date</label>
            <input 
              type="date" 
              value={formData.due_date}
              onChange={(e) => setFormData({...formData, due_date: e.target.value})}
            />
          </div>
          <div className="form-group full">
            <label>Followers (Help/Assist)</label>
            <select 
              multiple 
              className="followers-select"
              value={formData.follower_ids} 
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                setFormData({...formData, follower_ids: values});
              }}
            >
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hold Ctrl/Cmd to select multiple people.</span>
          </div>
          <div className="form-group">
            <label>Link to Type</label>
            <select value={formData.parent_type} onChange={(e)=>setFormData({...formData, parent_type: e.target.value})}>
              <option value="customer">Customer</option>
              <option value="deal">Deal</option>
            </select>
          </div>
          <div className="form-group">
            <label>Select Item</label>
            <select value={formData.parent_id} onChange={(e)=>setFormData({...formData, parent_id: e.target.value})}>
              <option value="">None</option>
              {formData.parent_type === 'customer' ? 
                (customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>) :
                (deals || []).map(d => <option key={d.id} value={d.id}>{d.title}</option>)
              }
            </select>
          </div>
          <div className="form-group full">
            <label>Description</label>
            <textarea 
              rows="3"
              placeholder="Task details and instructions..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            ></textarea>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Tasks;
