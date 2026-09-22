import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Bot, Plus, Play, ToggleLeft, ToggleRight, Trash2, Edit, MessageSquare,
  Users, Sparkles, Phone, ArrowRight, CheckCircle, AlertCircle, RefreshCw,
  HelpCircle, Settings, X, Send, CornerDownLeft, ShieldCheck, ChevronRight
} from 'lucide-react';

const WhatsAppChatbots = () => {
  const navigate = useNavigate();

  // Data states
  const [chatbots, setChatbots] = useState([]);
  const [accounts, setAccounts] = useState([]);
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
    trigger_keywords: ['مرحبا', 'سعر', 'تفاصيل'],
    newKeywordInput: '',
    scenario_nodes: [
      {
        id: 'node_1_greeting',
        message: 'أهلاً بك في شركتنا! يسعدنا تواصلك معنا. كيف يمكننا مساعدتك اليوم؟',
        options: [
          { text: 'الاستفسار عن الخدمات والأسعار', value: 'services', next_node_id: 'node_2_name' },
          { text: 'حجز موعد أو استشارة', value: 'booking', next_node_id: 'node_2_name' },
          { text: 'التحدث مع مسؤول مبيعات', value: 'sales', action: 'handoff' }
        ],
        action: 'next_step'
      },
      {
        id: 'node_2_name',
        message: 'تشرفنا بحضرتك! برجاء كتابة اسمك الكريم لتسجيل طلبك ومتابعتك.',
        save_to_field: 'name',
        next_node_id: 'node_3_interest',
        action: 'next_step'
      },
      {
        id: 'node_3_interest',
        message: 'شكراً لك! ما هي الخدمة أو المنتج الذي ترغب في الاستفسار عنه بالتحديد؟',
        save_to_field: 'interest',
        action: 'handoff',
        target_role_key: 'sales',
        handoff_message: 'تم استلام بياناتك بنجاح! جاري تحويلك لأحد مسؤولي المبيعات للمتابعة معك الآن.'
      }
    ]
  });

  // Simulator State
  const [simMessages, setSimMessages] = useState([]);
  const [simInput, setSimInput] = useState('');
  const [simCurrentNodeId, setSimCurrentNodeId] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch Chatbots & Accounts
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [botsRes, accRes] = await Promise.all([
        api.get('/whatsapp/chatbots'),
        api.get('/whatsapp/accounts').catch(() => ({ data: { data: [] } }))
      ]);
      setChatbots(botsRes.data?.data || []);
      setAccounts(accRes.data?.data || []);
    } catch {
      toast.error('فشل تحميل بيانات الشات بوت');
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
      toast.success('تم تحديث حالة الشات بوت');
      setChatbots(prev => prev.map(b => b.id === botId ? { ...b, is_active: res.data.data.is_active } : b));
    } catch {
      toast.error('فشل تغيير حالة الشات بوت');
    }
  };

  // -------------------------------------------------------------------------
  // Delete Bot
  // -------------------------------------------------------------------------
  const handleDeleteBot = async (botId, name) => {
    if (!window.confirm(`هل أنت متأكد من حذف الشات بوت "${name}"؟`)) return;
    try {
      await api.delete(`/whatsapp/chatbots/${botId}`);
      toast.success('تم حذف الشات بوت بنجاح');
      setChatbots(prev => prev.filter(b => b.id !== botId));
    } catch {
      toast.error('فشل حذف الشات بوت');
    }
  };

  // -------------------------------------------------------------------------
  // Open Builder Modal (Create or Edit)
  // -------------------------------------------------------------------------
  const handleOpenBuilder = (bot = null) => {
    if (bot) {
      setEditingBot(bot);
      setBotForm({
        name: bot.name,
        description: bot.description || '',
        account_id: bot.account_id || '',
        target_role_key: bot.target_role_key || 'sales',
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
        name: 'بوت خدمة المبيعات والتسجيل',
        description: 'بوت لجمع بيانات العميل التلقائية والتحويل للمبيعات',
        account_id: accounts.find(a => a.is_default)?.id || accounts[0]?.id || '',
        target_role_key: 'sales',
        trigger_type: 'keyword',
        trigger_keywords: ['مرحبا', 'سعر', 'تفاصيل', 'حجز'],
        newKeywordInput: '',
        scenario_nodes: [
          {
            id: 'node_1_greeting',
            message: 'أهلاً بك في شركتنا! يسعدنا تواصلك معنا. كيف يمكننا مساعدتك اليوم؟',
            options: [
              { text: 'الاستفسار عن الخدمات والأسعار', value: 'services', next_node_id: 'node_2_name' },
              { text: 'حجز موعد أو استشارة', value: 'booking', next_node_id: 'node_2_name' },
              { text: 'التحدث مع مسؤول مبيعات', value: 'sales', action: 'handoff' }
            ],
            action: 'next_step'
          },
          {
            id: 'node_2_name',
            message: 'تشرفنا بحضرتك! برجاء كتابة اسمك الكريم لتسجيل طلبك ومتابعتك.',
            save_to_field: 'name',
            next_node_id: 'node_3_interest',
            action: 'next_step'
          },
          {
            id: 'node_3_interest',
            message: 'شكراً لك! ما هي الخدمة أو المنتج الذي ترغب في الاستفسار عنه بالتحديد؟',
            save_to_field: 'interest',
            action: 'handoff',
            target_role_key: 'sales',
            handoff_message: 'تم استلام بياناتك بنجاح! جاري تحويلك لأحد مسؤولي المبيعات للمتابعة معك الآن.'
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
      toast.error('يرجى كتابة اسم الشات بوت');
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
        toast.success(`تم تحديث الشات بوت (الإصدار v${res.data.data.version})`);
      } else {
        await api.post('/whatsapp/chatbots', payload);
        toast.success('تم إنشاء الشات بوت بنجاح');
      }
      setShowBuilderModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل حفظ الشات بوت');
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
          message: 'اكتب نص رسالة أو سؤال البوت هنا...',
          options: [],
          save_to_field: '',
          action: 'next_step',
          target_role_key: 'sales'
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
        { text: `خيار ${currentOptions.length + 1}`, value: `opt_${currentOptions.length + 1}`, next_node_id: '' }
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
      toast.error('فشل بدء المحاكي');
    } finally {
      setSimLoading(false);
    }
  };

  const handleSendSimReply = async (textToSend = null) => {
    const input = (textToSend || simInput).trim();
    if (!input || simLoading) return;

    // Add user message
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
      toast.error('فشل إرسال الرد في المحاكي');
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
        (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'all' || b.target_role_key === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [chatbots, searchQuery, roleFilter]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>
      
      {/* Top Breadcrumb & Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={28} color="#25D366" />
            شات بوت واتساب الذكي (Role-Based ChatBots)
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13.5 }}>
            صمم سيناريوهات التفاعل الآلي، تسجيل العملاء الجدد في CRM، والتحويل التلقائي لمسؤولي المبيعات
          </p>
        </div>

        {/* Navigation Tabs to Other WhatsApp Sections */}
        <div style={{ display: 'flex', gap: 8, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
          <button
            onClick={() => navigate('/marketing/whatsapp-chat')}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'transparent', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            💬 المحادثات
          </button>
          <button
            onClick={() => navigate('/marketing/whatsapp-campaigns')}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'transparent', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            📢 الحملات
          </button>
          <button
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#25D366', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'default' }}
          >
            🤖 الشات بوت
          </button>
          <button
            onClick={() => navigate('/settings')}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'transparent', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            ⚙️ الإعدادات
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'white', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>إجمالي البوتات</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{chatbots.length}</div>
        </div>
        <div style={{ background: 'white', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>البوتات النشطة</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
            {chatbots.filter(b => b.is_active).length}
          </div>
        </div>
        <div style={{ background: 'white', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>الجلسات النشطة الآن</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
            {chatbots.reduce((sum, b) => sum + parseInt(b.active_sessions_count || 0, 10), 0)}
          </div>
        </div>
        <div style={{ background: 'white', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>إجمالي تفاعلات البوت</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
            {chatbots.reduce((sum, b) => sum + parseInt(b.total_sessions_count || 0, 10), 0)}
          </div>
        </div>
      </div>

      {/* Action Bar (Search, Role Filter, Create Bot Button) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, maxWidth: 600 }}>
          <input
            type="text"
            placeholder="ابحث عن شات بوت باسمه أو وصفه..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5 }}
          />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white' }}
          >
            <option value="all">كل الأدوار (All Roles)</option>
            <option value="sales">المبيعات (Sales)</option>
            <option value="support">خدمة العملاء (Support)</option>
            <option value="reception">الاستقبال (Reception)</option>
          </select>
        </div>

        <button
          onClick={() => handleOpenBuilder(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, background: '#25D366', color: 'white',
            border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 4px rgba(37,211,102,0.3)'
          }}
        >
          <Plus size={18} /> إنشاء شات بوت جديد
        </button>
      </div>

      {/* Chatbots Cards List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>جاري تحميل الشات بوتس...</div>
        </div>
      ) : filteredBots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
          <Bot size={48} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', color: '#1e293b' }}>لا يوجد شات بوت مطابق</h3>
          <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13.5 }}>
            ابدأ بإنشاء أول شات بوت ليتولى الرد التلقائي على عملائك وتسجيل بياناتهم
          </p>
          <button
            onClick={() => handleOpenBuilder(null)}
            style={{ background: '#25D366', color: 'white', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            إنشاء شات بوت الآن
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
                        {bot.description || 'لا يوجد وصف'}
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBot(bot.id)}
                      title={bot.is_active ? 'تعطيل الشات بوت' : 'تفعيل الشات بوت'}
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
                      background: '#e0f2fe', color: '#0369a1'
                    }}>
                      الدور: {bot.target_role_key.toUpperCase()}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: '#fef3c7', color: '#b45309'
                    }}>
                      الخطوات: {nodesCount} خطوات
                    </span>
                    {bot.account_phone_number && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                        background: '#f1f5f9', color: '#475569'
                      }}>
                        الرقم: {bot.account_phone_number}
                      </span>
                    )}
                  </div>

                  {/* Keywords chips */}
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>الكلمات المفتاحية للمشغل:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {bot.trigger_type === 'all_inbound' ? (
                        <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                          يعمل مع جميع الرسائل الواردة
                        </span>
                      ) : keywords.length > 0 ? (
                        keywords.map((kw, i) => (
                          <span key={i} style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 4 }}>
                            {kw}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>لا توجد كلمات مفتاحية</span>
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
                    <Play size={13} /> تجربة في المحاكي
                  </button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleOpenBuilder(bot)}
                      title="تعديل السيناريو"
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#475569' }}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteBot(bot.id, bot.name)}
                      title="حذف البوت"
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
                  {editingBot ? `تعديل الشات بوت: ${editingBot.name}` : 'إنشاء شات بوت جديد'}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  حدد الكلمات المفتاحية ومسار الأسئلة وتسجيل بيانات العميل
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>اسم الشات بوت *</label>
                  <input
                    type="text"
                    value={botForm.name}
                    onChange={e => setBotForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="مثال: بوت مبيعات العقارات أو الاستقبال"
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>الدور المستهدف للتحويل (Handoff Role)</label>
                  <select
                    value={botForm.target_role_key}
                    onChange={e => setBotForm(prev => ({ ...prev, target_role_key: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="sales">فريق المبيعات (Sales)</option>
                    <option value="support">خدمة العملاء والدعم (Support)</option>
                    <option value="reception">الاستقبال (Reception)</option>
                    <option value="all">أي موظف متاح (Any Agent)</option>
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>وصف الشات بوت</label>
                  <input
                    type="text"
                    value={botForm.description}
                    onChange={e => setBotForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="وصف مختصر للوظيفة التي يؤديها هذا البوت..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, boxSizing: 'border-box' }}
                  />
                </div>

                {/* Linked WhatsApp Account (Multi-Number) */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>رقم الواتساب المرتبط</label>
                  <select
                    value={botForm.account_id}
                    onChange={e => setBotForm(prev => ({ ...prev, account_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="">جميع أرقام الواتساب (Default / All Numbers)</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.display_phone_number} {acc.label ? `(${acc.label})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Trigger Type */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>نوع المشغّل (Trigger Type)</label>
                  <select
                    value={botForm.trigger_type}
                    onChange={e => setBotForm(prev => ({ ...prev, trigger_type: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="keyword">عند كتابة كلمات مفتاحية معينة (Keyword Match)</option>
                    <option value="all_inbound">الرد على كل الرسائل الواردة الجديدة (All Inbound)</option>
                  </select>
                </div>

                {/* Trigger Keywords */}
                {botForm.trigger_type === 'keyword' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      الكلمات المفتاحية التي يبدأ بها البوت (اضغط Enter بعد كل كلمة)
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
                        placeholder="اكتب الكلمة المفتاحية ثم اضغط إضافة (مثال: سعر، حجز، تفاصيل)..."
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
                        إضافة
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
                      خطوات وسيناريو الشات بوت (Scenario Steps)
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                      الخطوة الأولى تعمل كرسالة بدء، وتتدرج الخطوات لسؤال العميل وتسجيل بياناته
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
                    <Plus size={14} /> إضافة خطوة جديدة
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
                          الخطوة #{nodeIdx + 1} ({node.id}) {nodeIdx === 0 ? '— [رسالة البداية]' : ''}
                        </span>
                        {nodeIdx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveNode(nodeIdx)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                          >
                            حذف الخطوة ✕
                          </button>
                        )}
                      </div>

                      {/* Message Prompt */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                          نص الرسالة أو السؤال الذي سيرسله البوت:
                        </label>
                        <textarea
                          rows={2}
                          value={node.message || node.text || ''}
                          onChange={e => handleUpdateNode(nodeIdx, 'message', e.target.value)}
                          placeholder="اكتب هنا ما سيقوله البوت للعميل..."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Save to CRM Field & Action Configuration */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            حفظ رد العميل في حقل CRM (اختياري):
                          </label>
                          <select
                            value={node.save_to_field || ''}
                            onChange={e => handleUpdateNode(nodeIdx, 'save_to_field', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, background: 'white' }}
                          >
                            <option value="">لا تحفظ رد هذا السؤال</option>
                            <option value="name">اسم العميل (Name)</option>
                            <option value="interest">الاهتمام / الخدمة (Interest)</option>
                            <option value="budget">الميزانية المتوقعة (Budget)</option>
                            <option value="email">البريد الإلكتروني (Email)</option>
                            <option value="notes">إضافة إلى الملاحظات (Notes)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            الإجراء بعد هذا السؤال:
                          </label>
                          <select
                            value={node.action || 'next_step'}
                            onChange={e => handleUpdateNode(nodeIdx, 'action', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, background: 'white' }}
                          >
                            <option value="next_step">الانتقال للخطوة التالية</option>
                            <option value="handoff">تحويل المحادثة لممثل مبيعات (Handoff to Agent)</option>
                            <option value="complete">إنهاء المحادثة (Complete)</option>
                          </select>
                        </div>
                      </div>

                      {/* Options / Choice buttons if applicable */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                            خيارات متعددة يختار منها العميل (1، 2، 3...):
                          </label>
                          <button
                            type="button"
                            onClick={() => handleAddOptionToNode(nodeIdx)}
                            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                          >
                            + إضافة خيار
                          </button>
                        </div>
                        {Array.isArray(node.options) && node.options.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {node.options.map((opt, optIdx) => (
                              <div key={optIdx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', minWidth: 20 }}>
                                  {optIdx + 1}.
                                </span>
                                <input
                                  type="text"
                                  placeholder="نص الخيار (مثال: شقق سكنية)"
                                  value={opt.text || ''}
                                  onChange={e => {
                                    const opts = [...node.options];
                                    opts[optIdx] = { ...opts[optIdx], text: e.target.value };
                                    handleUpdateNode(nodeIdx, 'options', opts);
                                  }}
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOptionFromNode(nodeIdx, optIdx)}
                                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                            بدون خيارات — يقبل أي نص حر يكتبه العميل (مثل الاسم أو الرغبة)
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{ background: '#25D366', color: 'white', border: 'none', padding: '9px 22px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  حفظ وتفعيل الشات بوت
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
                <div style={{ fontSize: 11, color: '#dcfce7' }}>محاكي تفاعلي مباشر (Simulator)</div>
              </div>
            </div>
            <button
              onClick={() => setShowSimulator(false)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ alignSelf: 'center', background: '#fff3cd', color: '#856404', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #ffeeba' }}>
              💡 هذه محاكاة داخلية — لن يتم إرسال أي رسائل حقيقية
            </div>

            {simMessages.map((msg, i) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: isUser ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    background: isUser ? '#d9fdd3' : '#ffffff',
                    padding: '8px 12px',
                    borderRadius: 8,
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ fontSize: 13, color: '#111b21', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {msg.text}
                  </div>

                  {/* Options clickable pills in simulation */}
                  {Array.isArray(msg.options) && msg.options.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      {msg.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          onClick={() => handleSendSimReply(String(optIdx + 1))}
                          style={{
                            background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
                            padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', textAlign: 'right'
                          }}
                        >
                          {optIdx + 1}. {opt.text}
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.action === 'handed_off' && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '3px 6px', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                      🤝 تم تنفيذ التحويل لموظف المبيعات
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Simulator Input Bar */}
          <div style={{ padding: 12, background: '#f0f2f5', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="اكتب ردك أو رقم الخيار..."
              value={simInput}
              onChange={e => setSimInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendSimReply();
                }
              }}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <button
              onClick={() => handleSendSimReply()}
              disabled={!simInput.trim() || simLoading}
              style={{
                background: '#075e54', color: 'white', border: 'none', width: 38, height: 38,
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default WhatsAppChatbots;
