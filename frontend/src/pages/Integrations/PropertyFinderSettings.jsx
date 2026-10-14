import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Building, ShieldCheck, RefreshCw, Key, CheckCircle2,
  AlertTriangle, XCircle, ArrowRight, ExternalLink,
  DownloadCloud, UploadCloud, Globe, Lock, Clock, History,
  Trash2, Play, Users, Check, Activity, Power
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const PropertyFinderSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSync, setSavingSync] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncingLeads, setSyncingLeads] = useState(false);
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'logs'

  // Settings State
  const [settings, setSettings] = useState({
    environment: 'sandbox',
    country_code: 'EG',
    is_enabled: false,
    is_connected: false,
    listing_sync_enabled: true,
    lead_sync_enabled: true,
    auto_publish: false,
    has_credentials: false,
    api_key_masked: '',
    api_secret_masked: '',
    webhook_status: 'unregistered',
    last_sync_at: null,
    last_sync_status: 'never_run',
    last_error_message: null
  });

  // Edit fields
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [environment, setEnvironment] = useState('sandbox');
  const [listingSync, setListingSync] = useState(true);
  const [leadSync, setLeadSync] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);

  // Unsaved sync settings indicator
  const hasUnsavedSyncSettings =
    isEnabled !== Boolean(settings.is_enabled) ||
    listingSync !== Boolean(settings.listing_sync_enabled) ||
    leadSync !== Boolean(settings.lead_sync_enabled);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Inbound Webhook URL
  const webhookUrl = `${window.location.origin}/api/propertyfinder/webhook?tenant_id=${user?.tenant_id || ''}`;

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/propertyfinder/settings');
      const data = res.data?.data || {};
      setSettings(data);
      setEnvironment(data.environment || 'sandbox');
      setListingSync(data.listing_sync_enabled ?? true);
      setLeadSync(data.lead_sync_enabled ?? true);
      setIsEnabled(Boolean(data.is_enabled));
      setApiKeyInput(data.api_key_masked || '');
      setApiSecretInput(data.api_secret_masked || '');
    } catch (err) {
      toast.error('Failed to load Property Finder settings.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await api.get('/propertyfinder/logs?limit=50');
      setLogs(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load integration logs.');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put('/propertyfinder/settings', {
        api_key: apiKeyInput,
        api_secret: apiSecretInput,
        environment,
        country_code: 'EG',
        is_enabled: isEnabled,
        listing_sync_enabled: listingSync,
        lead_sync_enabled: leadSync
      });
      toast.success('Property Finder credentials saved successfully.');
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save credentials.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSyncSettings = async () => {
    try {
      setSavingSync(true);
      await api.put('/propertyfinder/settings', {
        is_enabled: isEnabled,
        listing_sync_enabled: listingSync,
        lead_sync_enabled: leadSync
      });
      toast.success('Integration settings saved successfully.');
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save integration settings.');
    } finally {
      setSavingSync(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const res = await api.post('/propertyfinder/test-connection');
      if (res.data?.data?.success) {
        toast.success('Connection verified successfully with Property Finder API!');
      } else {
        toast.error(res.data?.data?.message || 'Connection test failed.');
      }
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Connection test failed.');
      fetchSettings();
    } finally {
      setTesting(false);
    }
  };

  const handleImportListings = async () => {
    try {
      setImporting(true);
      const res = await api.post('/propertyfinder/sync/import');
      const stats = res.data?.data || {};
      toast.success(
        `Import finished: ${stats.created || 0} created, ${stats.linkedExisting || 0} linked, ${stats.updated || 0} updated.`
      );
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleSyncLeads = async () => {
    try {
      setSyncingLeads(true);
      const res = await api.post('/propertyfinder/sync/leads');
      const s = res.data?.data || {};
      toast.success(`Lead sync: ${s.created || 0} new, ${s.duplicates || 0} already imported, ${(s.errors || []).length} errors.`);
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lead sync failed.');
    } finally {
      setSyncingLeads(false);
    }
  };


  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Property Finder? Your existing local properties and leads will remain intact.')) {
      return;
    }
    try {
      await api.post('/propertyfinder/disconnect');
      toast.success('Account disconnected safely.');
      setApiKeyInput('');
      setApiSecretInput('');
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disconnect account.');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Webhook callback URL copied to clipboard!');
  };

  return (
    <div className="property-finder-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#0284c7', color: 'white', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Property Finder Integration
              </h1>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Multi-tenant bidirectional property synchronization & lead ingestion for Egypt (EG)
              </p>
            </div>
          </div>
        </div>

        {/* Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Active / Inactive Badge (Persisted Server State Only) */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            background: settings.is_enabled ? '#eff6ff' : '#f8fafc',
            color: settings.is_enabled ? '#1d4ed8' : '#64748b',
            border: `1px solid ${settings.is_enabled ? '#bfdbfe' : '#cbd5e1'}`
          }}>
            {settings.is_enabled ? <Activity size={14} color="#2563eb" /> : <Power size={14} color="#64748b" />}
            {settings.is_enabled ? 'Active' : 'Inactive'}
          </span>

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            background: settings.is_connected ? '#ecfdf5' : '#fef2f2',
            color: settings.is_connected ? '#059669' : '#dc2626',
            border: `1px solid ${settings.is_connected ? '#a7f3d0' : '#fecaca'}`
          }}>
            {settings.is_connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {settings.is_connected ? 'Connected' : 'Not Connected'}
          </span>

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1'
          }}>
            <Globe size={14} />
            {settings.environment === 'production' ? 'Production' : 'Sandbox'} · EG
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, borderBottom: activeTab === 'settings' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeTab === 'settings' ? '#0284c7' : '#64748b'
          }}
        >
          Integration Settings
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('logs'); fetchLogs(); }}
          style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, borderBottom: activeTab === 'logs' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeTab === 'logs' ? '#0284c7' : '#64748b'
          }}
        >
          Activity & Audit Logs
        </button>
      </div>

      {activeTab === 'settings' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
          {/* Card 1: Connection & Credentials */}
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
              <Key size={18} color="#0284c7" /> API Credentials & Gateway
            </h3>

            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Target Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                >
                  <option value="sandbox">Sandbox (Testing / Pre-Production)</option>
                  <option value="production">Production (Official Live Egypt Portal)</option>
                </select>
                <small style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  Use Sandbox for verifying OAuth token handshake and property schema mapping.
                </small>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  API Key
                </label>
                <input
                  type="text"
                  placeholder="Enter Property Finder API Key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  API Secret
                </label>
                <input
                  type="password"
                  placeholder={settings.has_credentials ? '•••••••••••••••• (Leave blank to keep existing)' : 'Enter Property Finder API Secret'}
                  value={apiSecretInput}
                  onChange={(e) => setApiSecretInput(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'monospace' }}
                />
                <small style={{ color: '#059669', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  🔒 Encrypted at rest using AES-256-GCM. Never returned in browser responses.
                </small>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#0284c7',
                    color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <ShieldCheck size={16} /> {saving ? 'Saving...' : 'Save Credentials'}
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || !settings.has_credentials}
                  style={{
                    padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc',
                    color: '#1e293b', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <RefreshCw size={16} className={testing ? 'animate-spin' : ''} /> {testing ? 'Testing...' : 'Test Connection'}
                </button>

                {settings.is_connected && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    style={{
                      padding: '10px 18px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2',
                      color: '#dc2626', fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <Trash2 size={16} /> Disconnect
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Card 2: Synchronization Preferences */}
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                <RefreshCw size={18} color="#0284c7" /> Synchronization Controls
              </h3>
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '6px',
                background: settings.is_enabled ? '#eff6ff' : '#f1f5f9',
                color: settings.is_enabled ? '#2563eb' : '#64748b',
                border: `1px solid ${settings.is_enabled ? '#bfdbfe' : '#e2e8f0'}`
              }}>
                Saved State: {settings.is_enabled ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Integration Enabled</strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Activate communication with Property Finder</span>
                </div>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Listing Synchronization</strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Allow importing and publishing property listings</span>
                </div>
                <input
                  type="checkbox"
                  checked={listingSync}
                  onChange={(e) => setListingSync(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Lead Ingestion</strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Capture incoming client inquiries into CRM pipeline</span>
                </div>
                <input
                  type="checkbox"
                  checked={leadSync}
                  onChange={(e) => setLeadSync(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Dedicated Save Button for Sync & Enablement Settings */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSaveSyncSettings}
                disabled={savingSync}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#0284c7',
                  color: 'white', fontWeight: 600, fontSize: '13px', cursor: savingSync ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <CheckCircle2 size={16} /> {savingSync ? 'Saving Settings...' : 'Save Integration Settings'}
              </button>

              {hasUnsavedSyncSettings && (
                <span style={{
                  fontSize: '12px', color: '#b45309', background: '#fffbeb',
                  border: '1px solid #fef3c7', padding: '6px 10px', borderRadius: '6px',
                  display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500
                }}>
                  <AlertTriangle size={14} /> Unsaved settings changes (click Save to apply)
                </span>
              )}
            </div>

            {/* Quick Actions / Manual Operations */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                Manual Operations
              </h4>

              {/* Informative banners when actions are disabled */}
              {!settings.is_enabled ? (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a',
                  color: '#92400e', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    Integration is currently <strong>Inactive</strong>. Turn on <strong>Integration Enabled</strong> above and click <strong>Save Integration Settings</strong> before running manual operations.
                  </span>
                </div>
              ) : !settings.is_connected ? (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                  color: '#475569', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    Connection not verified. Click <strong>Test Connection</strong> to verify your credentials with Property Finder before syncing.
                  </span>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleImportListings}
                  disabled={importing || !settings.is_enabled || !settings.is_connected}
                  title={!settings.is_enabled ? 'Enable integration and save settings first' : (!settings.is_connected ? 'Verify connection first' : 'Import Listings from PF')}
                  style={{
                    padding: '10px 18px', borderRadius: '8px', border: 'none',
                    background: (!settings.is_enabled || !settings.is_connected) ? '#94a3b8' : '#059669',
                    color: 'white', fontWeight: 600, fontSize: '13px',
                    cursor: (!settings.is_enabled || !settings.is_connected || importing) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: (!settings.is_enabled || !settings.is_connected) ? 0.7 : 1
                  }}
                >
                  <DownloadCloud size={16} /> {importing ? 'Importing Listings...' : 'Import Listings from PF'}
                </button>

                <button
                  type="button"
                  onClick={handleSyncLeads}
                  disabled={syncingLeads || !settings.is_enabled || !settings.is_connected}
                  title={!settings.is_enabled ? 'Enable integration and save settings first' : (!settings.is_connected ? 'Verify connection first' : 'Sync Leads from PF')}
                  style={{
                    padding: '10px 18px', borderRadius: '8px', border: 'none',
                    background: (!settings.is_enabled || !settings.is_connected) ? '#94a3b8' : '#0284c7',
                    color: 'white', fontWeight: 600, fontSize: '13px',
                    cursor: (!settings.is_enabled || !settings.is_connected || syncingLeads) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: (!settings.is_enabled || !settings.is_connected) ? 0.7 : 1
                  }}
                >
                  <DownloadCloud size={16} /> {syncingLeads ? 'Syncing Leads...' : 'Sync Leads from PF'}
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Webhook Endpoint & Real-Time Ingestion */}
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
              <ShieldCheck size={18} color="#059669" /> Inbound Webhook Listener (Real-Time Leads & Status)
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Configure this webhook callback URL in your Property Finder Partner / PF Expert dashboard to receive immediate lead notifications and listing status updates.
            </p>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <code style={{ fontSize: '13px', color: '#0f172a', wordBreak: 'break-all', flex: 1, fontFamily: 'monospace' }}>
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(webhookUrl)}
                style={{
                  padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap'
                }}
              >
                Copy URL
              </button>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
              <span>🔐 Signature Validation: <strong>HMAC-SHA256 (Tashgheel implementation; provider scheme pending confirmation)</strong></span>
              <span>⚡ Delivery: <strong>Asynchronous Background Queue</strong></span>
              <span>🛡️ Protection: <strong>Replay & Duplicate Filtered</strong></span>
            </div>
          </div>
        </div>
      ) : (
        /* Logs Tab */
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#1e293b' }}>
              Integration Event Logs
            </h3>
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loadingLogs}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc',
                cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <RefreshCw size={13} className={loadingLogs ? 'animate-spin' : ''} /> Refresh Logs
            </button>
          </div>

          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>
              No integration events logged yet. Actions will appear here in real-time.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>Timestamp</th>
                    <th style={{ padding: '10px' }}>Event Type</th>
                    <th style={{ padding: '10px' }}>Severity</th>
                    <th style={{ padding: '10px' }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#1e293b' }}>
                        {log.event_type}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: log.severity === 'error' ? '#fee2e2' : log.severity === 'warn' ? '#fef3c7' : '#e0f2fe',
                          color: log.severity === 'error' ? '#dc2626' : log.severity === 'warn' ? '#d97706' : '#0284c7'
                        }}>
                          {log.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#334155' }}>
                        {log.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PropertyFinderSettings;
