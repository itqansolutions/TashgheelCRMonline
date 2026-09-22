import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Bot, Plus, Play, ToggleLeft, ToggleRight, Trash2, Edit, MessageSquare,
  Users, Sparkles, Phone, ArrowRight, CheckCircle, AlertCircle, RefreshCw,
  HelpCircle, Settings, X, Send, CornerDownLeft, ShieldCheck, ChevronRight,
  Briefcase, Building2
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';

const WhatsAppChatbots = () => {
  const navigate = useNavigate();

  // Data states
  const [chatbots, setChatbots] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal / Drawer states
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingBot, setEditingBot] = useState(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatingBot, setSimulatingBot] = useState(null);

  // Builder Form State
  const [botForm, setBotForm] = useState({
    name: '',
    description: '',
    account_id: '',
    target_role_key: 'sales',
    trigger_type: 'keyword',
    trigger_keywords: ['hello', 'price', 'inquiry', 'info'],
    newKeywordInput: '',
    scenario_nodes: [
      {
        id: 'node_1_greeting',
        message: 'Hello! Thank you for reaching out to us. How can we assist you today?',
        options: [
          { text: 'Inquire about Services & Pricing', value: 'services', next_node_id: 'node_2_name' },
          { text: 'Book an Appointment or Consultation', value: 'booking', next_node_id: 'node_2_name' },
          { text: 'Speak with a Representative', value: 'sales', action: 'handoff' }
        ],
        action: 'next_step'
      },
      {
        id: 'node_2_name',
        message: 'Wonderful! Could you please share your full name so our team can record your inquiry?',
        save_to_field: 'name',
        next_node_id: 'node_3_interest',
        action: 'next_step'
      },
      {
        id: 'node_3_interest',
        message: 'Thank you! Which service or property specifications are you interested in?',
        save_to_field: 'notes',
        action: 'handoff',
        target_role_key: 'sales',
        handoff_message: 'Your details have been saved! Connecting you with a specialist immediately.'
      }
    ]
  });

  // Simulator State
  const [simMessages, setSimMessages] = useState([]);
  const [simInput, setSimInput] = useState('');
  const [simCurrentNodeId, setSimCurrentNodeId] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch Chatbots, Accounts & Departments
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [botsRes, accRes, deptRes] = await Promise.all([
        api.get('/whatsapp/chatbots'),
        api.get('/whatsapp/accounts').catch(() => ({ data: { data: [] } })),
        api.get('/departments').catch(() => ({ data: { data: [] } }))
      ]);
      setChatbots(botsRes.data?.data || []);
      setAccounts(accRes.data?.data || []);
      setDepartments(deptRes.data?.data || []);
    } catch {
      toast.error('Failed to load chatbots data');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Toggle Bot Active Status
  // -------------------------------------------------------------------------
  const handleToggleBot = async (botId) => {
    try {
      const res = await api.patch(`/whatsapp/chatbots/${botId}/toggle`);
      toast.success('ChatBot status updated successfully');
      setChatbots(prev => prev.map(b => b.id === botId ? { ...b, is_active: res.data.data.is_active } : b));
    } catch {
      toast.error('Failed to toggle ChatBot status');
    }
  };

  // -------------------------------------------------------------------------
  // Delete Bot
  // -------------------------------------------------------------------------
  const handleDeleteBot = async (botId, name) => {
    if (!window.confirm(`Are you sure you want to delete the chatbot "${name}"?`)) return;
    try {
      await api.delete(`/whatsapp/chatbots/${botId}`);
      toast.success('ChatBot deleted successfully');
      setChatbots(prev => prev.filter(b => b.id !== botId));
    } catch {
      toast.error('Failed to delete ChatBot');
    }
  };

  // -------------------------------------------------------------------------
  // Open Builder Modal (Create or Edit)
  // -------------------------------------------------------------------------
  const handleOpenBuilder = (bot = null) => {
    const defaultHandoff = departments[0]?.name || 'sales';
    if (bot) {
      setEditingBot(bot);
      setBotForm({
        name: bot.name,
        description: bot.description || '',
        account_id: bot.account_id || '',
        target_role_key: bot.target_role_key || defaultHandoff,
        trigger_type: bot.trigger_type || 'keyword',
        trigger_keywords: Array.isArray(bot.trigger_keywords) ? bot.trigger_keywords : [],
        newKeywordInput: '',
        scenario_nodes: Array.isArray(bot.scenario_nodes) && bot.scenario_nodes.length > 0 
          ? bot.scenario_nodes 
          : []
      });
    } else {
      setEditingBot(null);
      setBotForm({
        name: 'Lead Qualification & Inquiries Bot',
        description: 'Collects visitor information, auto-creates CRM customer, and hands off to target department.',
        account_id: accounts.find(a => a.is_default)?.id || accounts[0]?.id || '',
        target_role_key: defaultHandoff,
        trigger_type: 'keyword',
        trigger_keywords: ['hello', 'hi', 'price', 'inquiry', 'details'],
        newKeywordInput: '',
        scenario_nodes: [
          {
            id: 'node_1_greeting',
            message: 'Hello! Welcome to our company. How may we assist you today?',
            options: [
              { text: 'Inquire about Services & Pricing', value: 'services', next_node_id: 'node_2_name' },
              { text: 'Book an Appointment or Consultation', value: 'booking', next_node_id: 'node_2_name' },
              { text: 'Speak to a Representative', value: 'sales', action: 'handoff' }
            ],
            action: 'next_step'
          },
          {
            id: 'node_2_name',
            message: 'Glad to assist you! Please enter your full name so our team can follow up with you.',
            save_to_field: 'name',
            next_node_id: 'node_3_interest',
            action: 'next_step'
          },
          {
            id: 'node_3_interest',
            message: 'Thank you! Which service or property specifications are you interested in?',
            save_to_field: 'notes',
            action: 'handoff',
            target_role_key: defaultHandoff,
            handoff_message: 'Your details have been saved! Assigning a specialist to assist you immediately.'
          }
        ]
      });
    }
    setShowBuilderModal(true);
  };

  // -------------------------------------------------------------------------
  // Save Bot
  // -------------------------------------------------------------------------
  const handleSaveBot = async (e) => {
    e.preventDefault();
    if (!botForm.name.trim()) {
      toast.error('Please enter a chatbot name');
      return;
    }

    const payload = {
      name: botForm.name.trim(),
      description: botForm.description.trim(),
      account_id: botForm.account_id ? parseInt(botForm.account_id, 10) : null,
      target_role_key: botForm.target_role_key,
      trigger_type: botForm.trigger_type,
      trigger_keywords: botForm.trigger_keywords,
      scenario_nodes: botForm.scenario_nodes
    };

    try {
      if (editingBot) {
        const res = await api.put(`/whatsapp/chatbots/${editingBot.id}`, payload);
        toast.success(`ChatBot updated successfully (Version v${res.data.data.version})`);
      } else {
        await api.post('/whatsapp/chatbots', payload);
        toast.success('ChatBot created successfully');
      }
      setShowBuilderModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save chatbot');
    }
  };

  // -------------------------------------------------------------------------
  // Node Operations in Builder
  // -------------------------------------------------------------------------
  const handleAddNode = () => {
    const newId = `node_${botForm.scenario_nodes.length + 1}`;
    setBotForm(prev => ({
      ...prev,
      scenario_nodes: [
        ...prev.scenario_nodes,
        {
          id: newId,
          message: 'Type the bot prompt or question here...',
          options: [],
          display_mode: 'interactive',
          save_to_field: '',
          action: 'next_step',
          target_role_key: prev.target_role_key || 'sales'
        }
      ]
    }));
  };

  const handleUpdateNode = (index, field, value) => {
    setBotForm(prev => {
      const nodes = [...prev.scenario_nodes];
      nodes[index] = { ...nodes[index], [field]: value };
      return { ...prev, scenario_nodes: nodes };
    });
  };

  const handleRemoveNode = (index) => {
    setBotForm(prev => ({
      ...prev,
      scenario_nodes: prev.scenario_nodes.filter((_, i) => i !== index)
    }));
  };

  const handleAddOptionToNode = (nodeIndex) => {
    setBotForm(prev => {
      const nodes = [...prev.scenario_nodes];
      const currentOptions = nodes[nodeIndex].options || [];
      nodes[nodeIndex].options = [
        ...currentOptions,
        {
          text: `Option ${currentOptions.length + 1}`,
          value: `opt_${currentOptions.length + 1}`,
          action: 'next_step',
          next_node_id: ''
        }
      ];
      return { ...prev, scenario_nodes: nodes };
    });
  };

  const handleRemoveOptionFromNode = (nodeIndex, optIndex) => {
    setBotForm(prev => {
      const nodes = [...prev.scenario_nodes];
      nodes[nodeIndex].options = nodes[nodeIndex].options.filter((_, i) => i !== optIndex);
      return { ...prev, scenario_nodes: nodes };
    });
  };

  // -------------------------------------------------------------------------
  // Simulator Execution
  // -------------------------------------------------------------------------
  const handleStartSimulator = async (bot) => {
    setSimulatingBot(bot);
    setSimMessages([]);
    setSimInput('');
    setSimCurrentNodeId(null);
    setShowSimulator(true);
    setSimLoading(true);

    try {
      const res = await api.post('/whatsapp/chatbots/simulate', {
        nodes: bot.scenario_nodes,
        currentNodeId: null
      });

      const data = res.data?.data;
      if (data) {
        setSimCurrentNodeId(data.currentNodeId);
        setSimMessages([
          { sender: 'bot', text: data.botReply, options: data.options || [], time: new Date() }
        ]);
      }
    } catch {
      toast.error('Failed to initialize simulator');
    } finally {
      setSimLoading(false);
    }
  };

  const handleSendSimReply = async (textToSend = null) => {
    const input = (textToSend || simInput).trim();
    if (!input || simLoading) return;

    // Add user message to simulator UI
    setSimMessages(prev => [
      ...prev,
      { sender: 'user', text: input, time: new Date() }
    ]);
    setSimInput('');
    setSimLoading(true);

    try {
      const res = await api.post('/whatsapp/chatbots/simulate', {
        nodes: simulatingBot.scenario_nodes,
        currentNodeId: simCurrentNodeId,
        userInput: input
      });

      const data = res.data?.data;
      if (data) {
        setSimCurrentNodeId(data.currentNodeId);
        setSimMessages(prev => [
          ...prev,
          { sender: 'bot', text: data.botReply, options: data.options || [], action: data.action, time: new Date() }
        ]);
      }
    } catch {
      toast.error('Failed to send reply in simulator');
    } finally {
      setSimLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Filtered Chatbots List
  // -------------------------------------------------------------------------
  const filteredBots = useMemo(() => {
    return chatbots.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.target_role_key && b.target_role_key.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'all' || b.target_role_key === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [chatbots, searchQuery, roleFilter]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>
      <IntegrationsSubNav />

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={28} color="#25D366" />
            WhatsApp ChatBots
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13.5 }}>
            Design automated conversation trees, collect customer details, auto-register CRM leads, and hand off to target departments.
          </p>
        </div>

        <button
          onClick={() => handleOpenBuilder(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #25D366, #128C7E)',
            color: 'white', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,211,102,0.3)'
          }}
        >
          <Plus size={18} /> Create New ChatBot
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'white', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Bots</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{chatbots.length}</div>
        </div>
        <div style={{ background: 'white', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Bots</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
            {chatbots.filter(b => b.is_active).length}
          </div>
        </div>
        <div style={{ background: 'white', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Sessions</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
            {chatbots.reduce((sum, b) => sum + parseInt(b.active_sessions_count || 0, 10), 0)}
          </div>
        </div>
        <div style={{ background: 'white', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Interactions</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
            {chatbots.reduce((sum, b) => sum + parseInt(b.total_sessions_count || 0, 10), 0)}
          </div>
        </div>
      </div>

      {/* Action Bar (Search, Department Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, maxWidth: 640 }}>
          <input
            type="text"
            placeholder="Search chatbots by name, description or department..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5 }}
          />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white' }}
          >
            <option value="all">All Departments / Roles</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name} Department</option>
            ))}
            <option value="sales">Sales</option>
            <option value="support">Customer Support</option>
            <option value="reception">Reception</option>
          </select>
        </div>
      </div>

      {/* Chatbots Cards List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>Loading chatbots...</div>
        </div>
      ) : filteredBots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          <Bot size={48} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', color: '#1e293b' }}>No ChatBots Found</h3>
          <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13.5 }}>
            Create your first automated chatbot to handle customer inquiries, capture lead data, and transfer to your team.
          </p>
          <button
            onClick={() => handleOpenBuilder(null)}
            style={{ background: '#25D366', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Create ChatBot Now
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {filteredBots.map(bot => {
            const keywords = Array.isArray(bot.trigger_keywords) ? bot.trigger_keywords : [];
            const nodesCount = Array.isArray(bot.scenario_nodes) ? bot.scenario_nodes.length : 0;
            return (
              <div
                key={bot.id}
                style={{
                  background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
                  padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{bot.name}</h3>
                        <span style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4 }}>
                          v{bot.version || 1}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.4 }}>
                        {bot.description || 'No description provided'}
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBot(bot.id)}
                      title={bot.is_active ? 'Deactivate ChatBot' : 'Activate ChatBot'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {bot.is_active 
                        ? <ToggleRight size={32} color="#16a34a" /> 
                        : <ToggleLeft size={32} color="#94a3b8" />}
                    </button>
                  </div>

                  {/* Badges Info */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', gap: 4
                    }}>
                      <Briefcase size={11} /> Dept: {bot.target_role_key}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: '#fef3c7', color: '#b45309'
                    }}>
                      {nodesCount} Steps
                    </span>
                    {bot.account_phone_number && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                        background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', gap: 4
                      }}>
                        <Phone size={11} /> {bot.account_phone_number}
                      </span>
                    )}
                  </div>

                  {/* Keywords chips */}
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Triggers:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {bot.trigger_type === 'all_inbound' ? (
                        <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                          Matches all new incoming messages
                        </span>
                      ) : keywords.length > 0 ? (
                        keywords.map((kw, i) => (
                          <span key={i} style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 4 }}>
                            {kw}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>No keywords set</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => handleStartSimulator(bot)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#166534',
                      border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: 6, fontSize: 12,
                      fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    <Play size={13} /> Test in Simulator
                  </button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleOpenBuilder(bot)}
                      title="Edit Scenario"
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#475569' }}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteBot(bot.id, bot.name)}
                      title="Delete ChatBot"
                      style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#dc2626' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SCENARIO BUILDER MODAL */}
      {/* ===================================================================== */}
      {showBuilderModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: 'white', borderRadius: 16, width: '100%', maxWidth: '880px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {editingBot ? `Edit ChatBot: ${editingBot.name}` : 'Create New ChatBot'}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  Configure triggers, question tree, CRM field mappings, and department handoffs.
                </p>
              </div>
              <button
                onClick={() => setShowBuilderModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSaveBot} style={{ overflowY: 'auto', padding: 24, flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* General Settings Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>ChatBot Name *</label>
                  <input
                    type="text"
                    value={botForm.name}
                    onChange={e => setBotForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Sales Inquiry & Lead Capture Bot"
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                    Handoff Target Department *
                  </label>
                  <select
                    value={botForm.target_role_key}
                    onChange={e => setBotForm(prev => ({ ...prev, target_role_key: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white', boxSizing: 'border-box' }}
                  >
                    {departments.length > 0 && (
                      <optgroup label="Company Departments">
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name} Department</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Default Roles & Fallback">
                      <option value="sales">Sales Team</option>
                      <option value="support">Customer Support</option>
                      <option value="reception">Reception / Front Desk</option>
                      <option value="all">Any Available Agent</option>
                    </optgroup>
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Description</label>
                  <input
                    type="text"
                    value={botForm.description}
                    onChange={e => setBotForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of what this bot handles..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, boxSizing: 'border-box' }}
                  />
                </div>

                {/* Linked WhatsApp Account (Multi-Number) */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Linked WhatsApp Number</label>
                  <select
                    value={botForm.account_id}
                    onChange={e => setBotForm(prev => ({ ...prev, account_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="">Default / All Numbers</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.display_phone_number} {acc.label ? `(${acc.label})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Trigger Type */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Trigger Type</label>
                  <select
                    value={botForm.trigger_type}
                    onChange={e => setBotForm(prev => ({ ...prev, trigger_type: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="keyword">Keyword Match (Triggers on specific customer phrases)</option>
                    <option value="all_inbound">All Inbound Messages (Triggers for any incoming chat)</option>
                  </select>
                </div>

                {/* Trigger Keywords */}
                {botForm.trigger_type === 'keyword' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      Trigger Keywords (Type keyword and press Enter or Add)
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        type="text"
                        value={botForm.newKeywordInput || ''}
                        onChange={e => setBotForm(prev => ({ ...prev, newKeywordInput: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (botForm.newKeywordInput && botForm.newKeywordInput.trim()) {
                              setBotForm(prev => ({
                                ...prev,
                                trigger_keywords: [...prev.trigger_keywords, prev.newKeywordInput.trim()],
                                newKeywordInput: ''
                              }));
                            }
                          }
                        }}
                        placeholder="e.g. price, booking, info, offer, sales..."
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (botForm.newKeywordInput && botForm.newKeywordInput.trim()) {
                            setBotForm(prev => ({
                              ...prev,
                              trigger_keywords: [...prev.trigger_keywords, prev.newKeywordInput.trim()],
                              newKeywordInput: ''
                            }));
                          }
                        }}
                        style={{ background: '#0f172a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Add
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {botForm.trigger_keywords.map((kw, idx) => (
                        <span key={idx} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9',
                          color: '#0f172a', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600
                        }}>
                          {kw}
                          <button
                            type="button"
                            onClick={() => setBotForm(prev => ({
                              ...prev,
                              trigger_keywords: prev.trigger_keywords.filter((_, i) => i !== idx)
                            }))}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scenario Nodes Builder */}
              <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      Scenario Steps & Nodes
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                      The first node starts the conversation. Subsequent nodes collect customer details and save them into the CRM.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddNode}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: '#e0f2fe', color: '#0369a1',
                      border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: 6, fontSize: 12,
                      fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} /> Add Step
                  </button>
                </div>

                {/* Nodes List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {botForm.scenario_nodes.map((node, nodeIdx) => (
                    <div
                      key={node.id || nodeIdx}
                      style={{
                        background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 16
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                          Step #{nodeIdx + 1} ({node.id}) {nodeIdx === 0 ? '— [Initial Prompt]' : ''}
                        </span>
                        {nodeIdx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveNode(nodeIdx)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                          >
                            Delete Step ✕
                          </button>
                        )}
                      </div>

                      {/* Message Prompt */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                          Message or Question to send to the customer:
                        </label>
                        <textarea
                          rows={2}
                          value={node.message || node.text || ''}
                          onChange={e => handleUpdateNode(nodeIdx, 'message', e.target.value)}
                          placeholder="Type what the bot will ask the customer..."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Save to CRM Field & Action Configuration */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Save Customer Response to CRM Field (Optional):
                          </label>
                          <select
                            value={node.save_to_field || ''}
                            onChange={e => handleUpdateNode(nodeIdx, 'save_to_field', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, background: 'white' }}
                          >
                            <option value="">-- Do Not Save (Continue Only) --</option>
                            <optgroup label="1. Basic Information (Section 1)">
                              <option value="name">Full Name (name)</option>
                              <option value="email">Email Address (email)</option>
                              <option value="company_name">Company Name (company_name)</option>
                              <option value="entity_type">Entity Type (entity_type)</option>
                            </optgroup>
                            <optgroup label="2. Contact & Location (Section 2)">
                              <option value="address">Address / City (address)</option>
                              <option value="preferred_location">Preferred Location / Area (preferred_location)</option>
                            </optgroup>
                            <optgroup label="3. Specifications & Budget (Section 3)">
                              <option value="notes">Notes & General Inquiry (notes)</option>
                              <option value="budget_min">Minimum Budget (budget_min)</option>
                              <option value="budget_max">Maximum Budget (budget_max)</option>
                              <option value="preferred_rooms">Preferred Rooms (preferred_rooms)</option>
                              <option value="preferred_area_min">Minimum Area sqm (preferred_area_min)</option>
                              <option value="preferred_area_max">Maximum Area sqm (preferred_area_max)</option>
                            </optgroup>
                            <optgroup label="4. CRM Status & Source (Section 4)">
                              <option value="status">Lead Status (status)</option>
                              <option value="classification_name">Classification (classification_name)</option>
                              <option value="source">Lead Source (source)</option>
                            </optgroup>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Action After This Step:
                          </label>
                          <select
                            value={node.action || 'next_step'}
                            onChange={e => handleUpdateNode(nodeIdx, 'action', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, background: 'white' }}
                          >
                            <option value="next_step">Proceed to Next Step</option>
                            <option value="handoff">Handoff to Department Agent</option>
                            <option value="complete">Complete Conversation</option>
                          </select>
                        </div>
                      </div>

                      {/* Multiple choice options & Interactive WhatsApp Buttons/List */}
                      <div style={{ marginTop: 12, background: '#f1f5f9', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 800, color: '#1e293b' }}>
                              Multiple Choice Options & Branching:
                            </label>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              (Interactive WhatsApp Buttons or Selection Menu)
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <select
                              value={node.display_mode || 'interactive'}
                              onChange={e => handleUpdateNode(nodeIdx, 'display_mode', e.target.value)}
                              style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: 'white', color: '#334155' }}
                              title="Display format sent to customer on WhatsApp"
                            >
                              <option value="interactive">Auto: Interactive Buttons (≤3) / List Menu (4-10)</option>
                              <option value="text">Numbered Plain Text (1, 2, 3...)</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => handleAddOptionToNode(nodeIdx)}
                              style={{
                                background: '#0284c7', color: 'white', border: 'none',
                                padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <Plus size={13} /> Add Option
                            </button>
                          </div>
                        </div>

                        {Array.isArray(node.options) && node.options.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {node.options.map((opt, optIdx) => {
                              const currentTargetVal = opt.action === 'handoff' 
                                ? 'action:handoff' 
                                : opt.action === 'complete' 
                                  ? 'action:complete' 
                                  : (opt.next_node_id ? `node:${opt.next_node_id}` : '');

                              return (
                                <div
                                  key={optIdx}
                                  style={{
                                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 8,
                                    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6
                                  }}
                                >
                                  {/* Top Row: Option Number, Label, Value, Remove */}
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{
                                      fontSize: 11, fontWeight: 800, color: '#0369a1', background: '#e0f2fe',
                                      padding: '2px 8px', borderRadius: 12, minWidth: 24, textAlign: 'center'
                                    }}>
                                      #{optIdx + 1}
                                    </span>

                                    <input
                                      type="text"
                                      placeholder="Option label displayed to customer (e.g. Sales Inquiry)"
                                      value={opt.text || ''}
                                      onChange={e => {
                                        const opts = [...node.options];
                                        opts[optIdx] = { ...opts[optIdx], text: e.target.value };
                                        handleUpdateNode(nodeIdx, 'options', opts);
                                      }}
                                      style={{ flex: 2, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                                    />

                                    <input
                                      type="text"
                                      placeholder="Stored value (optional)"
                                      value={opt.value || ''}
                                      onChange={e => {
                                        const opts = [...node.options];
                                        opts[optIdx] = { ...opts[optIdx], value: e.target.value };
                                        handleUpdateNode(nodeIdx, 'options', opts);
                                      }}
                                      style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                                    />

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOptionFromNode(nodeIdx, optIdx)}
                                      title="Delete Option"
                                      style={{
                                        background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {/* Bottom Row: Branching Destination Selector */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4, background: '#f8fafc', padding: '4px 8px', borderRadius: 6 }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                      <ArrowRight size={12} color="#0284c7" />
                                      When chosen, branch to:
                                    </span>

                                    <select
                                      value={currentTargetVal}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const opts = [...node.options];
                                        if (val === 'action:handoff') {
                                          opts[optIdx] = { ...opts[optIdx], action: 'handoff', next_node_id: '' };
                                        } else if (val === 'action:complete') {
                                          opts[optIdx] = { ...opts[optIdx], action: 'complete', next_node_id: '' };
                                        } else if (val.startsWith('node:')) {
                                          opts[optIdx] = { ...opts[optIdx], action: 'next_step', next_node_id: val.replace('node:', '') };
                                        } else {
                                          opts[optIdx] = { ...opts[optIdx], action: 'next_step', next_node_id: '' };
                                        }
                                        handleUpdateNode(nodeIdx, 'options', opts);
                                      }}
                                      style={{
                                        flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #94a3b8',
                                        fontSize: 12, background: 'white', color: '#0f172a'
                                      }}
                                    >
                                      <option value="">Next Step (Sequential / Default Node Action)</option>
                                      <optgroup label="Branch to Specific Step">
                                        {botForm.scenario_nodes.map((targetNode, tIdx) => {
                                          if (targetNode.id === node.id) return null;
                                          return (
                                            <option key={targetNode.id || tIdx} value={`node:${targetNode.id}`}>
                                              Step #{tIdx + 1}: {(targetNode.message || targetNode.text || targetNode.id).substring(0, 45)}...
                                            </option>
                                          );
                                        })}
                                      </optgroup>
                                      <optgroup label="Direct Actions">
                                        <option value="action:handoff">Transfer to Department Agent (Handoff)</option>
                                        <option value="action:complete">Complete & Close Conversation</option>
                                      </optgroup>
                                    </select>

                                    {/* Visual Route Indicator Badge */}
                                    {opt.action === 'handoff' ? (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                        → Agent Handoff
                                      </span>
                                    ) : opt.action === 'complete' ? (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                        → Complete
                                      </span>
                                    ) : opt.next_node_id ? (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                        → Step #{botForm.scenario_nodes.findIndex(n => n.id === opt.next_node_id) + 1}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                            No options configured. The bot will wait for free-form customer text (e.g. Name, Phone, Notes).
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setShowBuilderModal(false)}
                  style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#25D366', color: 'white', border: 'none', padding: '9px 22px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save & Activate ChatBot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* INTERACTIVE IN-BROWSER SIMULATOR DRAWER */}
      {/* ===================================================================== */}
      {showSimulator && simulatingBot && (
        <div style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, width: '420px', background: '#e5ddd5',
          boxShadow: '4px 0 20px rgba(0,0,0,0.2)', zIndex: 10000, display: 'flex', flexDirection: 'column'
        }}>
          {/* Simulator Header */}
          <div style={{ padding: '14px 16px', background: '#075e54', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={20} color="white" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{simulatingBot.name}</div>
                <div style={{ fontSize: 11, color: '#dcfce7' }}>Live WhatsApp Simulator</div>
              </div>
            </div>
            <button
              onClick={() => setShowSimulator(false)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Stream */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {simMessages.map((msg, i) => {
              const isUser = msg.sender === 'user';
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: '8px 12px', borderRadius: 8,
                    background: isUser ? '#dcf8c6' : 'white', color: '#111b21',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)', fontSize: 13, lineHeight: 1.4
                  }}>
                    {msg.text}
                  </div>

                  {/* If options available, render WhatsApp interactive buttons or list */}
                  {!isUser && Array.isArray(msg.options) && msg.options.length > 0 && (
                    <div style={{
                      marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6,
                      maxWidth: '85%', width: '100%'
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>⚡ WhatsApp Interactive Options ({msg.options.length <= 3 ? 'Buttons' : 'List Menu'}):</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {msg.options.map((opt, oi) => {
                          const branchHint = opt.action === 'handoff' 
                            ? '→ Handoff' 
                            : opt.action === 'complete' 
                              ? '→ Complete' 
                              : opt.next_node_id 
                                ? `→ Step #${(simulatingBot?.scenario_nodes || []).findIndex(n => n.id === opt.next_node_id) + 1 || opt.next_node_id}`
                                : '';

                          return (
                            <button
                              key={oi}
                              onClick={() => handleSendSimReply(opt.text || opt.value)}
                              disabled={simLoading}
                              style={{
                                background: 'white', color: '#075e54', border: '1px solid #128c7e',
                                padding: '7px 12px', borderRadius: 8, fontSize: 12,
                                fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'all 0.15s ease'
                              }}
                              onMouseOver={e => { e.currentTarget.style.background = '#e6f7f2'; }}
                              onMouseOut={e => { e.currentTarget.style.background = 'white'; }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#25D366' }}>●</span> {opt.text || opt.label}
                              </span>
                              {branchHint && (
                                <span style={{ fontSize: 10, color: '#0284c7', background: '#f0f9ff', padding: '2px 6px', borderRadius: 4 }}>
                                  {branchHint}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Handoff banner */}
                  {!isUser && (msg.action === 'handed_off' || msg.action === 'handoff') && (
                    <div style={{
                      marginTop: 6, padding: '5px 10px', borderRadius: 6,
                      background: '#ecfdf5', color: '#065f46', fontSize: 11.5, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #a7f3d0'
                    }}>
                      <CheckCircle size={13} /> Transferred to Department Agent
                    </div>
                  )}

                  {/* Complete banner */}
                  {!isUser && msg.action === 'completed' && (
                    <div style={{
                      marginTop: 6, padding: '5px 10px', borderRadius: 6,
                      background: '#f8fafc', color: '#334155', fontSize: 11.5, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #cbd5e1'
                    }}>
                      <CheckCircle size={13} /> Conversation Completed
                    </div>
                  )}
                </div>
              );
            })}

            {simLoading && (
              <div style={{ alignSelf: 'flex-start', background: 'white', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                Typing...
              </div>
            )}
          </div>

          {/* Simulator Input Footer */}
          <div style={{ padding: 10, background: '#f0f2f5', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Type message as customer..."
              value={simInput}
              onChange={e => setSimInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendSimReply();
                }
              }}
              disabled={simLoading}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: '1px solid #cbd5e1', fontSize: 13, background: 'white' }}
            />
            <button
              onClick={() => handleSendSimReply()}
              disabled={simLoading || !simInput.trim()}
              style={{
                width: 36, height: 36, borderRadius: '50%', background: '#075e54',
                color: 'white', border: 'none', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppChatbots;
