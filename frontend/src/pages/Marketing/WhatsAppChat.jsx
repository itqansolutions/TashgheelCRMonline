import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  MessageSquare, Send, Search, User, UserCheck, Clock, AlertCircle,
  Check, CheckCheck, RefreshCw, Plus, Phone, Shield, ExternalLink,
  FileText, Image as ImageIcon, Paperclip, ChevronRight, Info, Sparkles,
  X, Filter, ArrowLeft, MoreVertical, Users
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';
import { useAuth } from '../../context/AuthContext';

const WhatsAppChat = () => {
  const { user } = useAuth();

  // Data states
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);

  // Filter states
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [scope, setScope] = useState('all'); // 'all', 'my', 'unassigned'
  const [searchQuery, setSearchQuery] = useState('');

  // UI / Loading states
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageInput, setMessageInput] = useState('');

  // Modals
  const [showStartChatModal, setShowStartChatModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // New Chat Form state
  const [newChatData, setNewChatData] = useState({
    account_id: '',
    phone_number: '',
    contact_name: '',
    customer_id: '',
    initial_message: '',
    template_name: '',
    language_code: 'ar'
  });
  const [startingChat, setStartingChat] = useState(false);

  // CRM Customers state
  const [crmCustomers, setCrmCustomers] = useState([]);
  const [loadingCrmCustomers, setLoadingCrmCustomers] = useState(false);

  // Template Send Modal state
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [selectedTemplateLang, setSelectedTemplateLang] = useState('ar');

  const messagesEndRef = useRef(null);
  const pollingRef = useRef(null);

  // -------------------------------------------------------------------------
  // Fetch initial accounts, users, templates & customers
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetchAccounts();
    fetchUsers();
    fetchTemplates();
    fetchCrmCustomers();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/whatsapp/accounts');
      const data = res.data?.data || [];
      setAccounts(data);
      const defaultAcc = data.find(a => a.is_default);
      if (defaultAcc && !newChatData.account_id) {
        setNewChatData(prev => ({ ...prev, account_id: defaultAcc.id }));
      }
    } catch (err) {
      console.warn('Failed to load accounts', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data?.data || []);
    } catch (err) {
      console.warn('Failed to load users', err);
    }
  };

  const fetchCrmCustomers = async () => {
    setLoadingCrmCustomers(true);
    try {
      const res = await api.get('/customers');
      setCrmCustomers(res.data?.data || []);
    } catch (err) {
      console.warn('Failed to load CRM customers', err);
    } finally {
      setLoadingCrmCustomers(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/whatsapp/templates');
      const data = res.data?.data || [];
      const approved = data.filter(t => t.status?.toUpperCase() === 'APPROVED');
      setTemplates(approved.length > 0 ? approved : data);
      if (approved.length > 0) {
        setSelectedTemplateName(approved[0].name);
      }
    } catch (err) {
      console.warn('Failed to load templates', err);
    }
  };

  const handleSelectCustomerForChat = (customer) => {
    if (!customer) return;
    const cleanCPhone = (customer.phone || '').replace(/[\s\-().+]/g, '');
    const existingConv = conversations.find(c => {
      const p = (c.phone_number || '').replace(/[\s\-().+]/g, '');
      return (cleanCPhone && p && (p.includes(cleanCPhone) || cleanCPhone.includes(p))) ||
             (c.customer_id && String(c.customer_id) === String(customer.id));
    });

    if (existingConv) {
      setActiveConversationId(existingConv.id);
      setScope('all');
    } else {
      setNewChatData({
        account_id: accounts.find(a => a.is_default)?.id || accounts[0]?.id || '',
        customer_id: customer.id,
        phone_number: customer.phone || '',
        contact_name: customer.name || '',
        initial_message: '',
        template_name: templates[0]?.name || '',
        language_code: 'ar'
      });
      setShowStartChatModal(true);
    }
  };

  // -------------------------------------------------------------------------
  // Fetch Conversations
  // -------------------------------------------------------------------------
  const fetchConversations = async (silent = false) => {
    if (!silent) setLoadingConversations(true);
    try {
      const params = {};
      if (selectedAccountId !== 'all') params.accountId = selectedAccountId;
      if (scope !== 'all' && scope !== 'customers') params.scope = scope;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/whatsapp/conversations', { params });
      const list = res.data?.data || [];
      setConversations(list);

      // If active conversation is not set yet, pick the first one
      if (!activeConversationId && list.length > 0 && !silent) {
        setActiveConversationId(list[0].id);
      }
    } catch (err) {
      if (!silent) toast.error('Failed to load conversations');
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return crmCustomers;
    const q = searchQuery.toLowerCase().trim();
    return crmCustomers.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.company_name && c.company_name.toLowerCase().includes(q))
    );
  }, [crmCustomers, searchQuery]);

  useEffect(() => {
    fetchConversations();
  }, [selectedAccountId, scope, searchQuery]);

  // -------------------------------------------------------------------------
  // Polling for background updates (every 4s)
  // -------------------------------------------------------------------------
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchConversations(true);
      if (activeConversationId) {
        fetchMessages(activeConversationId, true);
      }
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeConversationId, selectedAccountId, scope, searchQuery]);

  // -------------------------------------------------------------------------
  // Fetch Messages for Active Conversation
  // -------------------------------------------------------------------------
  const fetchMessages = async (convId, silent = false) => {
    if (!convId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await api.get(`/whatsapp/conversations/${convId}/messages`);
      const data = res.data?.data || {};
      setMessages(data.messages || []);
      
      // Update the active conversation details in list
      if (data.conversation) {
        setConversations(prev =>
          prev.map(c => c.id === data.conversation.id ? { ...c, ...data.conversation, unread_count: 0 } : c)
        );
      }
    } catch (err) {
      if (!silent) toast.error('Failed to load messages');
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Active Conversation Object
  const activeConv = useMemo(() => {
    return conversations.find(c => String(c.id) === String(activeConversationId)) || null;
  }, [conversations, activeConversationId]);

  // Check if 24h Customer Service Window is expired
  const isWindowExpired = useMemo(() => {
    if (!activeConv || !activeConv.window_expires_at) return true;
    return new Date(activeConv.window_expires_at).getTime() < Date.now();
  }, [activeConv]);

  // Format time remaining for 24h window
  const windowTimeRemaining = useMemo(() => {
    if (!activeConv || !activeConv.window_expires_at) return null;
    const diff = new Date(activeConv.window_expires_at).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  }, [activeConv]);

  // -------------------------------------------------------------------------
  // Send Direct Text Message
  // -------------------------------------------------------------------------
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeConversationId || sendingMessage) return;

    setSendingMessage(true);
    const textToSend = messageInput.trim();
    setMessageInput('');

    try {
      const res = await api.post(`/whatsapp/conversations/${activeConversationId}/messages`, {
        body: textToSend,
        message_type: 'text'
      });

      if (res.data?.data) {
        setMessages(prev => [...prev, res.data.data]);
        fetchConversations(true);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'WINDOW_EXPIRED') {
        toast.error('24h Window is closed. Please send an approved template!', { duration: 5000 });
        setShowTemplateModal(true);
      } else {
        toast.error(data?.message || 'Failed to dispatch message');
      }
      setMessageInput(textToSend); // restore on failure
    } finally {
      setSendingMessage(false);
    }
  };

  // -------------------------------------------------------------------------
  // Send Template Message
  // -------------------------------------------------------------------------
  const handleSendTemplate = async () => {
    if (!selectedTemplateName || !activeConversationId) return;

    setSendingMessage(true);
    try {
      const res = await api.post(`/whatsapp/conversations/${activeConversationId}/messages`, {
        message_type: 'template',
        template_name: selectedTemplateName,
        language_code: selectedTemplateLang
      });

      toast.success('Template sent successfully!');
      setShowTemplateModal(false);
      if (res.data?.data) {
        setMessages(prev => [...prev, res.data.data]);
        fetchConversations(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send template');
    } finally {
      setSendingMessage(false);
    }
  };

  // -------------------------------------------------------------------------
  // Assign Conversation
  // -------------------------------------------------------------------------
  const handleAssignConversation = async (userId) => {
    if (!activeConversationId) return;
    try {
      await api.patch(`/whatsapp/conversations/${activeConversationId}/assign`, {
        assigned_user_id: userId || null
      });
      toast.success('Chat assignment updated');
      fetchConversations(true);
      setConversations(prev =>
        prev.map(c => c.id === activeConversationId ? { ...c, assigned_user_id: userId || null } : c)
      );
    } catch (err) {
      toast.error('Failed to update assignment');
    }
  };

  // -------------------------------------------------------------------------
  // Start New Chat
  // -------------------------------------------------------------------------
  const handleStartNewChat = async (e) => {
    e.preventDefault();
    if (!newChatData.phone_number.trim()) {
      return toast.error('Phone number is required');
    }

    setStartingChat(true);
    try {
      const res = await api.post('/whatsapp/conversations/start', newChatData);
      const conv = res.data?.data?.conversation;
      toast.success('Chat conversation created!');
      setShowStartChatModal(false);
      setNewChatData({
        account_id: accounts.find(a => a.is_default)?.id || '',
        phone_number: '',
        contact_name: '',
        initial_message: '',
        template_name: '',
        language_code: 'ar'
      });
      await fetchConversations();
      if (conv) {
        setActiveConversationId(conv.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 75px)', boxSizing: 'border-box' }}>
      <IntegrationsSubNav />

      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
        padding: '12px 18px',
        background: 'white',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #25D366, #128C7E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', boxShadow: '0 4px 10px rgba(37,211,102,0.25)'
          }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>WhatsApp Chat</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Two-way messaging inbox & customer service window
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Account/Number Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <Phone size={14} color="#64748b" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={{
                border: 'none', background: 'transparent', fontSize: '13px',
                fontWeight: 600, color: '#1e293b', outline: 'none', cursor: 'pointer'
              }}
            >
              <option value="all">All WhatsApp Numbers ({accounts.length})</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.display_phone_number || acc.phone_number_id} {acc.verified_name ? `(${acc.verified_name})` : ''} {acc.is_default ? '★ Default' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchConversations()}
            title="Refresh Chats"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: '10px', border: '1px solid #e2e8f0',
              background: '#f8fafc', cursor: 'pointer', color: '#64748b'
            }}
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={() => setShowStartChatModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #25D366, #128C7E)',
              color: 'white', fontWeight: 700, fontSize: '13px', border: 'none',
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,211,102,0.3)'
            }}
          >
            <Plus size={16} /> Start New Chat
          </button>
        </div>
      </div>

      {/* Main Two-Pane Chat Area */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        {/* Left Pane: Conversation List & Filters */}
        <div style={{
          width: '340px',
          minWidth: '280px',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafbfc'
        }}>
          {/* Scope Selector Tabs */}
          <div style={{
            display: 'flex',
            padding: '10px 10px',
            gap: '4px',
            borderBottom: '1px solid #e2e8f0',
            background: 'white'
          }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'my', label: 'My Chats' },
              { id: 'unassigned', label: 'Unassigned' },
              { id: 'customers', label: `Customers (${crmCustomers.length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setScope(tab.id)}
                style={{
                  flex: 1,
                  padding: '6px 2px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: scope === tab.id ? '#25D366' : '#f1f5f9',
                  color: scope === tab.id ? 'white' : '#64748b',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', background: 'white' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0'
            }}>
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                placeholder={scope === 'customers' ? "Search customers by name, phone or company..." : "Search contact, phone or message..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: '13px',
                  color: '#1e293b'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Conversation or Customers List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {scope === 'customers' ? (
              loadingCrmCustomers ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                  Loading customers...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>No customers found</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Try a different search query</p>
                </div>
              ) : (
                filteredCustomers.map(cust => (
                  <div
                    key={cust.id}
                    onClick={() => handleSelectCustomerForChat(cust)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 20,
                      background: '#e0f2fe', color: '#0369a1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '14px', flexShrink: 0
                    }}>
                      {cust.name?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                          {cust.name}
                        </span>
                        <span style={{ fontSize: '11px', color: '#25D366', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MessageSquare size={12} /> Chat
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {cust.phone || 'No phone number'}
                      </div>
                      {cust.company_name && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cust.company_name}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )
            ) : loadingConversations ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                <MessageSquare size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>No conversations found</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Start a new chat or pick from Customers tab</p>
              </div>
            ) : (
              conversations.map(conv => {
                const isActive = String(conv.id) === String(activeConversationId);
                const isConvWindowExpired = conv.window_expires_at && new Date(conv.window_expires_at).getTime() < Date.now();

                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConversationId(conv.id)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isActive ? '#ecfdf5' : 'transparent',
                      borderLeft: isActive ? '4px solid #25D366' : '4px solid transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                        {conv.contact_name || conv.customer_actual_name || conv.phone_number}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{
                        margin: 0,
                        fontSize: '12px',
                        color: conv.unread_count > 0 ? '#0f172a' : '#64748b',
                        fontWeight: conv.unread_count > 0 ? 700 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '200px'
                      }}>
                        {conv.last_message_direction === 'outbound' ? '✓ ' : ''}
                        {conv.last_message_body || 'No messages yet'}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {conv.unread_count > 0 && (
                          <span style={{
                            background: '#25D366',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 800,
                            borderRadius: '10px',
                            padding: '1px 6px',
                            minWidth: '16px',
                            textAlign: 'center'
                          }}>
                            {conv.unread_count}
                          </span>
                        )}
                        {conv.window_expires_at && (
                          <span
                            title={isConvWindowExpired ? '24h Window Closed' : '24h Window Open'}
                            style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: isConvWindowExpired ? '#cbd5e1' : '#22c55e',
                              display: 'inline-block'
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Meta info tags */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '10px', color: '#94a3b8' }}>
                      <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>
                        {conv.phone_number}
                      </span>
                      {conv.assigned_user_name ? (
                        <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '1px 5px', borderRadius: '4px' }}>
                          👤 {conv.assigned_user_name}
                        </span>
                      ) : (
                        <span style={{ background: '#fef2f2', color: '#ef4444', padding: '1px 5px', borderRadius: '4px' }}>
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat Conversation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#efeae2', position: 'relative' }}>
          {activeConv ? (
            <>
              {/* Active Chat Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                background: '#f0f2f5',
                borderBottom: '1px solid #d1d7db',
                zIndex: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: '#dfe5e7', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#54656f', fontWeight: 700, fontSize: '16px'
                  }}>
                    {(activeConv.contact_name || activeConv.phone_number).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#111b21' }}>
                        {activeConv.contact_name || activeConv.customer_actual_name || activeConv.phone_number}
                      </h3>
                      {activeConv.customer_id && (
                        <span style={{ background: '#dcf8c6', color: '#075e54', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          CRM Customer
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#667781' }}>
                      <span>{activeConv.phone_number}</span>
                      <span>•</span>
                      <span>From: {activeConv.account_phone_number || 'Default WhatsApp'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* 24-hour service window pill */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: isWindowExpired ? '#fef2f2' : '#f0fdf4',
                    color: isWindowExpired ? '#b91c1c' : '#15803d',
                    border: `1px solid ${isWindowExpired ? '#fecaca' : '#bbf7d0'}`
                  }}>
                    <Clock size={12} />
                    <span>24h Window: {windowTimeRemaining || (isWindowExpired ? 'Closed' : 'Open')}</span>
                  </div>

                  {/* Assign Agent Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'white', padding: '4px 8px', borderRadius: '8px', border: '1px solid #d1d7db' }}>
                    <User size={13} color="#54656f" />
                    <select
                      value={activeConv.assigned_user_id || ''}
                      onChange={(e) => handleAssignConversation(e.target.value)}
                      style={{ border: 'none', outline: 'none', fontSize: '12px', fontWeight: 600, color: '#111b21', background: 'transparent', cursor: 'pointer' }}
                    >
                      <option value="">Unassigned</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Message History Stream */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {loadingMessages ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#667781' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                    Loading message history...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto', color: '#667781', background: 'rgba(255,255,255,0.85)', padding: '16px 24px', borderRadius: '12px', maxWidth: '350px' }}>
                    <Shield size={24} style={{ margin: '0 auto 8px', display: 'block', color: '#128C7E' }} />
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>This is the beginning of your chat</p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px' }}>Messages and calls are end-to-end encrypted by WhatsApp.</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          justifyContent: isOutbound ? 'flex-end' : 'flex-start',
                          width: '100%'
                        }}
                      >
                        <div style={{
                          maxWidth: '65%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: isOutbound ? '#d9fdd3' : '#ffffff',
                          boxShadow: '0 1px 1px rgba(11,20,26,0.12)',
                          position: 'relative'
                        }}>
                          {/* Sender name for inbound or multi-agent context */}
                          {isOutbound && msg.sender_name && (
                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#128C7E', marginBottom: '2px' }}>
                              {msg.sender_name}
                            </div>
                          )}

                          {/* Media preview if present */}
                          {msg.media_url && (
                            <div style={{ marginBottom: '6px' }}>
                              {msg.message_type === 'image' ? (
                                <img
                                  src={msg.media_url}
                                  alt="WhatsApp media"
                                  style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '6px', objectFit: 'cover' }}
                                />
                              ) : (
                                <a
                                  href={msg.media_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px', background: 'rgba(0,0,0,0.05)',
                                    borderRadius: '6px', textDecoration: 'none', color: '#111b21', fontSize: '12px'
                                  }}
                                >
                                  <Paperclip size={14} /> Download Attached File
                                </a>
                              )}
                            </div>
                          )}

                          {/* Message Text */}
                          <div style={{ fontSize: '13.5px', color: '#111b21', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                            {msg.body}
                          </div>

                          {/* Footer: Time + Status Ticks */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '4px',
                            marginTop: '2px',
                            fontSize: '10px',
                            color: '#667781'
                          }}>
                            <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isOutbound && (
                              <span>
                                {msg.status === 'read' ? (
                                  <CheckCheck size={14} color="#53bdeb" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck size={14} color="#667781" />
                                ) : msg.status === 'failed' ? (
                                  <AlertCircle size={12} color="#ea0038" title="Failed to deliver" />
                                ) : (
                                  <Check size={14} color="#667781" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Customer Service 24h Window Expired Notice */}
              {isWindowExpired && (
                <div style={{
                  padding: '10px 18px',
                  background: '#fef2f2',
                  borderTop: '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontSize: '12px' }}>
                    <AlertCircle size={16} />
                    <span>
                      <strong>Customer Service Window (24h) Expired.</strong> Meta requires an approved template to initiate or restart this chat.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '8px',
                      background: '#b91c1c', color: 'white',
                      border: 'none', fontWeight: 700, fontSize: '12px',
                      cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    <Sparkles size={14} /> Send Approved Template
                  </button>
                </div>
              )}

              {/* Message Composer Bar */}
              <div style={{
                padding: '12px 18px',
                background: '#f0f2f5',
                borderTop: '1px solid #d1d7db',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(true)}
                  title="Send Template"
                  style={{
                    padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid #d1d7db', background: 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    gap: '6px', fontSize: '12px', fontWeight: 600, color: '#54656f'
                  }}
                >
                  <Sparkles size={15} color="#25D366" />
                  <span>Templates</span>
                </button>

                <form onSubmit={handleSendMessage} style={{ display: 'flex', flex: 1, gap: '10px' }}>
                  <input
                    type="text"
                    placeholder={isWindowExpired ? "Window expired — send an approved template or enter text to attempt..." : "Type a message..."}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    disabled={sendingMessage}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d1d7db',
                      background: 'white',
                      outline: 'none',
                      fontSize: '13.5px',
                      color: '#111b21'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !messageInput.trim()}
                    style={{
                      width: 42, height: 42, borderRadius: '8px',
                      background: !messageInput.trim() ? '#e9edef' : '#25D366',
                      color: !messageInput.trim() ? '#8696a0' : 'white',
                      border: 'none', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: !messageInput.trim() ? 'default' : 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#667781', padding: '40px' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#e9edef', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 16px', color: '#8696a0'
              }}>
                <MessageSquare size={32} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#111b21' }}>
                WhatsApp Web for Tashgheel CRM
              </h3>
              <p style={{ margin: 0, fontSize: '13px', maxWidth: '380px', lineHeight: '1.5' }}>
                Select a conversation from the left to view message history, reply within the 24h window, or start a new chat.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Start New Chat Modal */}
      {showStartChatModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '460px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} color="#25D366" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Start New WhatsApp Chat</h3>
              </div>
              <button
                onClick={() => setShowStartChatModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStartNewChat} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                  Send From Number
                </label>
                <select
                  value={newChatData.account_id}
                  onChange={(e) => setNewChatData(prev => ({ ...prev, account_id: e.target.value }))}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                  }}
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.display_phone_number || acc.phone_number_id} {acc.verified_name ? `(${acc.verified_name})` : ''} {acc.is_default ? '★ Default' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* CRM Customer Picker */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#1e293b' }}>
                  Select from CRM Customers (اختيار عميل مسجل)
                </label>
                <select
                  value={newChatData.customer_id || ''}
                  onChange={(e) => {
                    const cId = e.target.value;
                    if (!cId) {
                      setNewChatData(prev => ({ ...prev, customer_id: '', contact_name: '', phone_number: '' }));
                      return;
                    }
                    const cust = crmCustomers.find(c => String(c.id) === String(cId));
                    if (cust) {
                      setNewChatData(prev => ({
                        ...prev,
                        customer_id: cust.id,
                        contact_name: cust.name || '',
                        phone_number: cust.phone || ''
                      }));
                    }
                  }}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', background: 'white'
                  }}
                >
                  <option value="">-- Choose a customer or enter phone below --</option>
                  {crmCustomers.map(cust => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name} {cust.phone ? `(${cust.phone})` : ''} {cust.company_name ? `• ${cust.company_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                  Recipient Phone Number (with Country Code) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 201012345678 or +966501234567"
                  value={newChatData.phone_number}
                  onChange={(e) => setNewChatData(prev => ({ ...prev, phone_number: e.target.value }))}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                  Contact Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mohamed Ahmed"
                  value={newChatData.contact_name}
                  onChange={(e) => setNewChatData(prev => ({ ...prev, contact_name: e.target.value }))}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                  Initial Message Type
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setNewChatData(prev => ({ ...prev, template_name: '' }))}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                      border: '1px solid #cbd5e1', cursor: 'pointer',
                      background: !newChatData.template_name ? '#25D366' : 'white',
                      color: !newChatData.template_name ? 'white' : '#64748b'
                    }}
                  >
                    Direct Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChatData(prev => ({ ...prev, template_name: templates[0]?.name || '' }))}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                      border: '1px solid #cbd5e1', cursor: 'pointer',
                      background: newChatData.template_name ? '#25D366' : 'white',
                      color: newChatData.template_name ? 'white' : '#64748b'
                    }}
                  >
                    Meta Template (Recommended)
                  </button>
                </div>
              </div>

              {newChatData.template_name ? (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                    Select Approved Template
                  </label>
                  <select
                    value={newChatData.template_name}
                    onChange={(e) => setNewChatData(prev => ({ ...prev, template_name: e.target.value }))}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '8px',
                      border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                    }}
                  >
                    {templates.map(tpl => (
                      <option key={tpl.id || tpl.name} value={tpl.name}>
                        {tpl.name} ({tpl.language || 'ar'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                    Initial Text Message
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter your first message..."
                    value={newChatData.initial_message}
                    onChange={(e) => setNewChatData(prev => ({ ...prev, initial_message: e.target.value }))}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '8px',
                      border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none',
                      boxSizing: 'border-box', resize: 'vertical'
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowStartChatModal(false)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingChat}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #25D366, #128C7E)',
                    color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  {startingChat ? 'Starting...' : 'Start Chat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Template Modal */}
      {showTemplateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '440px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#25D366" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Send WhatsApp Template</h3>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
                Sending an approved Meta template will reopen the 24-hour customer messaging window once the customer responds.
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                  Select Approved Template
                </label>
                <select
                  value={selectedTemplateName}
                  onChange={(e) => setSelectedTemplateName(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                  }}
                >
                  {templates.map(tpl => (
                    <option key={tpl.id || tpl.name} value={tpl.name}>
                      {tpl.name} ({tpl.language || 'ar'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                  Template Language Code
                </label>
                <select
                  value={selectedTemplateLang}
                  onChange={(e) => setSelectedTemplateLang(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                  }}
                >
                  <option value="ar">Arabic (ar)</option>
                  <option value="en_US">English (en_US)</option>
                  <option value="en">English (en)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendTemplate}
                  disabled={sendingMessage || !selectedTemplateName}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #25D366, #128C7E)',
                    color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  {sendingMessage ? 'Sending...' : 'Send Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppChat;
