import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Plus, CheckSquare, Calendar, Flag, User, Clock, 
  AlertTriangle, CheckCircle2, Circle, PlayCircle,
  ChevronDown, ChevronUp, Filter, LayoutGrid, List,
  Building, Briefcase, Tag, Trash2, Edit3, X, Users
} from 'lucide-react';
import Modal from '../components/Common/Modal';

const PRIORITY_CONFIG = {
  urgent: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Urgent', icon: '🔴' },
  high:   { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa', label: 'High',   icon: '🟠' },
  medium: { bg: '#fefce8', color: '#ca8a04', border: '#fde68a', label: 'Medium', icon: '🟡' },
  low:    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: 'Low',    icon: '🟢' },
};

const STATUS_CONFIG = {
  todo:        { label: 'To Do',       color: '#64748b', bg: '#f1f5f9', icon: <Circle size={14}/> },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', icon: <PlayCircle size={14}/> },
  review:      { label: 'Review',      color: '#7c3aed', bg: '#f5f3ff', icon: <AlertTriangle size={14}/> },
  done:        { label: 'Done',        color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircle2 size={14}/> },
};

const getDueDateStatus = (due_date) => {
  if (!due_date) return null;
  const today = new Date();
  const due = new Date(due_date);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: '#dc2626', bg: '#fef2f2' };
  if (diffDays === 0) return { label: 'Due today', color: '#ea580c', bg: '#fff7ed' };
  if (diffDays <= 3) return { label: `${diffDays}d left`, color: '#ca8a04', bg: '#fefce8' };
  return { label: `${diffDays}d`, color: '#64748b', bg: '#f1f5f9' };
};

const TaskCard = ({ task, onEdit, onDelete, onStatusChange }) => {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
  const dueStat = getDueDateStatus(task.due_date);

  return (
    <div style={{
      background: 'white', border: `1px solid #e2e8f0`, borderRadius: '12px',
      padding: '16px', marginBottom: '10px', cursor: 'pointer',
      borderLeft: `3px solid ${priority.color}`,
      transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: priority.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {priority.icon} {priority.label}
          </span>
          <h4 style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>{task.title}</h4>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} 
            style={{ padding: '4px', background: 'transparent', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            <Edit3 size={13}/>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            style={{ padding: '4px', background: 'transparent', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {task.description && (
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5, 
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {task.in_charge_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '20px' }}>
              <User size={11} color="#64748b"/>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{task.in_charge_name}</span>
            </div>
          )}
          {task.parent_type && task.parent_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', padding: '3px 8px', borderRadius: '20px' }}>
              {task.parent_type === 'unit' ? <Building size={11} color="#2563eb"/> : <Briefcase size={11} color="#2563eb"/>}
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>{task.parent_type}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {dueStat && (
            <span style={{ fontSize: '10px', fontWeight: 800, color: dueStat.color, background: dueStat.bg, padding: '2px 8px', borderRadius: '20px' }}>
              <Calendar size={9} style={{ display: 'inline', marginRight: '3px' }}/>{dueStat.label}
            </span>
          )}
          <select
            value={task.status}
            onChange={(e) => { e.stopPropagation(); onStatusChange(task.id, e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: '10px', fontWeight: 800, color: status.color, background: status.bg, border: 'none', borderRadius: '6px', padding: '3px 6px', cursor: 'pointer' }}
          >
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

const Tasks = () => {
  const { user } = useAuth();
  const { customers, deals, users, fetchCustomers, fetchDeals, fetchUsers } = useData();
  const [tasks, setTasks] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list'
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');

  const [formData, setFormData] = useState({
    title: '', description: '', priority: 'medium', status: 'todo',
    due_date: '', assigned_to: '', director_id: '', follower_ids: [],
    parent_type: '', parent_id: ''
  });

  const fetchTasks = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/tasks');
      setTasks(res.data?.data || []);
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
    // Fetch units for the unit selector
    api.get('/re-units').then(r => setUnits(r.data?.data || [])).catch(() => {});
  }, []);

  const handleOpenModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title || '', description: task.description || '',
        priority: task.priority || 'medium', status: task.status || 'todo',
        due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
        assigned_to: task.assigned_to || '', director_id: task.director_id || '',
        follower_ids: task.followers ? task.followers.map(f => f.user_id) : [],
        parent_type: task.parent_type || '', parent_id: task.parent_id || ''
      });
    } else {
      setEditingTask(null);
      setFormData({ title: '', description: '', priority: 'medium', status: 'todo', due_date: '', assigned_to: '', director_id: '', follower_ids: [], parent_type: '', parent_id: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const cleanData = {
        ...formData,
        assigned_to: formData.assigned_to || null,
        director_id: formData.director_id || null,
        parent_id: formData.parent_id || null,
        parent_type: formData.parent_type || null,
        due_date: formData.due_date || null,
      };
      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, cleanData);
        toast.success('Task updated');
      } else {
        await api.post('/tasks', cleanData);
        toast.success('Task created');
      }
      fetchTasks(false);
      setIsModalOpen(false);
    } catch (err) {
      toast.error('Error saving task');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task permanently?')) return;
    await api.delete(`/tasks/${id}`);
    fetchTasks(false);
    toast.success('Task deleted');
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.put(`/tasks/${id}`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Filtered data
  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterAssignee !== 'all' && t.assigned_to !== filterAssignee) return false;
    return true;
  }), [tasks, filterStatus, filterPriority, filterAssignee]);

  // Stats
  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
  }), [tasks]);

  const roleLabel = user?.role === 'admin' ? 'All Organization Tasks' 
                  : user?.role === 'manager' ? 'My Team Tasks' 
                  : 'My Assigned Tasks';

  return (
    <div style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
      <style>{`
        .task-form-group { margin-bottom: 16px; }
        .task-form-group label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #475569; }
        .task-form-group input, .task-form-group select, .task-form-group textarea { 
          width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; 
          font-size: 14px; background: #fff; outline: none; transition: border-color 0.2s; 
        }
        .task-form-group input:focus, .task-form-group select:focus, .task-form-group textarea:focus { border-color: var(--primary); }
        .kanban-col { background: #f8fafc; border-radius: 16px; padding: 16px; min-height: 300px; flex: 1; min-width: 220px; }
        .kanban-col-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; }
      `}</style>

      {/* Hero Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)' }}>
              <CheckSquare size={24}/>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.02em' }}>Task Command Center</h1>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>{roleLabel} • {tasks.length} Tasks</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* View Toggle */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            <button onClick={() => setViewMode('kanban')} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', background: viewMode === 'kanban' ? 'white' : 'transparent', color: viewMode === 'kanban' ? 'var(--primary)' : '#64748b', boxShadow: viewMode === 'kanban' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s' }}>
              <LayoutGrid size={15}/> Board
            </button>
            <button onClick={() => setViewMode('list')} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', background: viewMode === 'list' ? 'white' : 'transparent', color: viewMode === 'list' ? 'var(--primary)' : '#64748b', boxShadow: viewMode === 'list' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s' }}>
              <List size={15}/> List
            </button>
          </div>
          <button onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '10px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)' }}>
            <Plus size={18} strokeWidth={3}/> New Task
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Tasks', value: stats.total, color: '#6366f1', bg: '#eef2ff' },
          { label: 'To Do', value: stats.todo, color: '#64748b', bg: '#f1f5f9' },
          { label: 'In Progress', value: stats.in_progress, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Completed', value: stats.done, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Overdue', value: stats.overdue, color: '#dc2626', bg: '#fef2f2' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>{stat.label}</div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: stat.color }}>{stat.value}</div>
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '20px', color: stat.color, fontWeight: 900 }}>{stat.value > 0 ? '●' : '○'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 16px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={16} color="#94a3b8"/>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f8fafc' }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f8fafc' }}>
          <option value="all">All Priorities</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f8fafc', minWidth: '160px' }}>
          <option value="all">All Employees</option>
          {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(filterStatus !== 'all' || filterPriority !== 'all' || filterAssignee !== 'all') && (
          <button onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterAssignee('all'); }} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <X size={12}/> Clear
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>
          Showing <b style={{ color: '#475569' }}>{filteredTasks.length}</b> of {tasks.length} tasks
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
          <CheckSquare size={40} opacity={0.2} style={{ marginBottom: '12px' }}/>
          <p style={{ fontWeight: 600 }}>Loading task board...</p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN VIEW */
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '16px' }}>
          {Object.entries(STATUS_CONFIG).map(([statusKey, statusCfg]) => {
            const colTasks = filteredTasks.filter(t => t.status === statusKey);
            return (
              <div key={statusKey} className="kanban-col">
                <div className="kanban-col-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: statusCfg.color }}>{statusCfg.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>{statusCfg.label}</span>
                  </div>
                  <span style={{ background: statusCfg.bg, color: statusCfg.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: '#cbd5e1' }}>
                    <Circle size={28} opacity={0.3} style={{ marginBottom: '8px' }}/>
                    <p style={{ fontSize: '12px', fontWeight: 600 }}>No tasks here</p>
                  </div>
                ) : (
                  colTasks.map(task => (
                    <TaskCard key={task.id} task={task} onEdit={handleOpenModal} onDelete={handleDelete} onStatusChange={handleStatusChange}/>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Task', 'Assignee', 'Priority', 'Status', 'Due Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>No tasks found</td></tr>
              ) : filteredTasks.map((task, i) => {
                const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
                const dueStat = getDueDateStatus(task.due_date);
                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '14px', marginBottom: '2px' }}>{task.title}</div>
                      {task.description && <div style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>{task.description}</div>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: '11px', fontWeight: 800 }}>
                          {task.in_charge_name?.[0] || '?'}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{task.in_charge_name || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: priority.bg, color: priority.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>{priority.icon} {priority.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: status.bg, color: status.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>{status.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {dueStat ? <span style={{ background: dueStat.bg, color: dueStat.color, padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>{dueStat.label}</span> : <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleOpenModal(task)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => handleDelete(task.id)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
        footer={
          <>
            <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSubmit} style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>{editingTask ? 'Update Task' : 'Create Task'}</button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="task-form-group" style={{ gridColumn: 'span 2' }}>
            <label>Task Title *</label>
            <input type="text" placeholder="e.g. Call client for follow-up" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required/>
          </div>
          <div className="task-form-group">
            <label>Assigned Employee</label>
            <select value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}>
              <option value="">-- Select Employee --</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div className="task-form-group">
            <label>Director / Supervisor</label>
            <select value={formData.director_id} onChange={e => setFormData({...formData, director_id: e.target.value})}>
              <option value="">-- Select Director --</option>
              {(users || []).filter(u => u.role === 'admin' || u.role === 'manager').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="task-form-group">
            <label>Priority</label>
            <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          <div className="task-form-group">
            <label>Due Date</label>
            <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})}/>
          </div>
          <div className="task-form-group">
            <label>Link To</label>
            <select value={formData.parent_type} onChange={e => setFormData({...formData, parent_type: e.target.value, parent_id: ''})}>
              <option value="">-- None --</option>
              <option value="customer">Customer / Lead</option>
              <option value="deal">Deal</option>
              <option value="unit">Real Estate Unit</option>
            </select>
          </div>
          {formData.parent_type && (
            <div className="task-form-group">
              <label>Select {formData.parent_type === 'customer' ? 'Customer' : formData.parent_type === 'deal' ? 'Deal' : 'Unit'}</label>
              <select value={formData.parent_id} onChange={e => setFormData({...formData, parent_id: e.target.value})}>
                <option value="">-- Select --</option>
                {formData.parent_type === 'customer' && (customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {formData.parent_type === 'deal' && (deals || []).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                {formData.parent_type === 'unit' && (units.length === 0
                  ? <option disabled>No units found — add units in Units Registry first</option>
                  : units.map(u => <option key={u.id} value={u.id}>{u.unit_number} — {u.project_name || 'Individual'} ({u.status})</option>)
                )}
              </select>
            </div>
          )}
          <div className="task-form-group" style={{ gridColumn: 'span 2' }}>
            <label>Description</label>
            <textarea rows="3" placeholder="Task details and instructions..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ resize: 'vertical' }}></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Tasks;
