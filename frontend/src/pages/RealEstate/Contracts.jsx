import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Download, Trash2, Paperclip } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import FileUploader from '../../components/Common/FileUploader';
import { useLanguage } from '../../context/LanguageContext';
import {
  WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton, DealFilterBanner,
  fmtMoney, fmtDate, fieldStyle, labelStyle
} from '../../components/RealEstate/WorkspaceKit';

/**
 * Real Estate → Contracts (standalone workspace)
 * Contracts originate from a Deal (created from the Deal's Related Records panel)
 * and keep the link to it. Lifecycle: Draft → Generated → Signed → Active → Completed / Cancelled.
 * Term: start date + duration (months) → end date; expiry reminders are sent by the backend scanner.
 */
const STATUS_COLOR = { Draft: 'gray', Generated: 'blue', Signed: 'amber', Active: 'green', Completed: 'teal', Cancelled: 'red' };

const Contracts = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const dealId = searchParams.get('deal_id');
  const [filter, setFilter] = useState('all');
  const [contracts, setContracts] = useState([]);
  const [allContracts, setAllContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [activeAttachmentContract, setActiveAttachmentContract] = useState(null);
  const [contractAttachments, setContractAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const loadContractAttachments = async (contractId) => {
    setLoadingAttachments(true);
    try {
      const res = await api.get(`/files/contract/${contractId}`);
      setContractAttachments(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.contracts.toastAttachmentLoadError', 'Failed to load attachments'));
      setContractAttachments([]);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const openAttachments = (c) => {
    setActiveAttachmentContract(c);
    loadContractAttachments(c.id);
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm(t('realEstate.contracts.confirmDeleteAttachment'))) return;
    try {
      await api.delete(`/files/${attachmentId}`);
      toast.success(t('realEstate.contracts.toastAttachmentDeleted'));
      if (activeAttachmentContract) {
        loadContractAttachments(activeAttachmentContract.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.contracts.toastAttachmentDeleteFailed'));
    }
  };

  const handleDownloadFile = (filePath, originalName) => {
    const token = localStorage.getItem('token');
    const cleanPath = (filePath || '').replace(/\\/g, '/');
    const baseUrl = api.defaults.baseURL.replace('/api', '');
    const separator = cleanPath.includes('?') ? '&' : '?';
    const url = `${baseUrl}/${cleanPath}${token ? `${separator}token=${encodeURIComponent(token)}` : ''}`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', originalName || 'contract_document');
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const nextStepMap = {
    Draft: { status: 'Generated', label: t('realEstate.contracts.btnGenerate'), color: '#2563eb' },
    Generated: { status: 'Signed', label: t('realEstate.contracts.btnMarkSigned'), color: '#d97706' },
    Signed: { status: 'Active', label: t('realEstate.contracts.btnActivate'), color: '#16a34a' },
  };

  const getStatusLabel = (s) => {
    switch (s) {
      case 'Draft': return t('realEstate.contracts.statusDraft');
      case 'Generated': return t('realEstate.contracts.statusGenerated');
      case 'Signed': return t('realEstate.contracts.statusSigned');
      case 'Active': return t('realEstate.contracts.statusActive');
      case 'Completed': return t('realEstate.contracts.statusCompleted');
      case 'Cancelled': return t('realEstate.contracts.statusCancelled');
      default: return s;
    }
  };

  const expiryBadge = (c) => {
    switch (c.expiry_state) {
      case 'expired':
        return (
          <Badge color="red">
            {t('realEstate.common.daysAgo', { days: Math.abs(c.days_remaining) })}
          </Badge>
        );
      case 'expiring_soon':
        return (
          <Badge color="amber">
            {t('realEstate.common.daysLeft', { days: c.days_remaining })}
          </Badge>
        );
      case 'active':
        return (
          <Badge color="green">
            {t('realEstate.common.daysLeft', { days: c.days_remaining })}
          </Badge>
        );
      case 'closed':
        return <Badge color="gray">—</Badge>;
      default:
        return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{t('realEstate.common.noTerm')}</span>;
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('deal_id', dealId);
      const res = await api.get(`/re-contracts?${params.toString()}`);
      const data = res.data.data || [];
      setAllContracts(data);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.contracts.toastLoadError'));
      setAllContracts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dealId]);

  useEffect(() => {
    setContracts(allContracts.filter(c => {
      if (filter === 'all') return true;
      if (filter === 'expiring_soon' || filter === 'expired') return c.expiry_state === filter;
      return c.status === filter;
    }));
  }, [allContracts, filter]);

  const transition = async (c, status) => {
    if (status === 'Cancelled' && !window.confirm(t('realEstate.contracts.confirmCancel', { number: c.contract_number }))) return;
    try {
      const res = await api.patch(`/re-contracts/${c.id}/status`, { status });
      toast.success(res.data.message || t('realEstate.contracts.toastStatusSuccess', { status: getStatusLabel(status) }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.contracts.toastStatusError'));
    }
  };

  const openEdit = (c) => {
    const rawContractDate = c.contract_date ? String(c.contract_date).split('T')[0] : '';
    const rawStartDate = c.start_date ? String(c.start_date).split('T')[0] : '';
    const rawEndDate = c.end_date ? String(c.end_date).split('T')[0] : '';

    setEditing(c);
    setForm({
      contract_date: rawContractDate,
      start_date: rawStartDate,
      duration_months: c.duration_months ?? '',
      end_date: rawEndDate,
      contract_value: c.contract_value,
      down_payment: c.down_payment,
      notes: c.notes || ''
    });
  };

  const saveEdit = async () => {
    const payload = {
      contract_date: form.contract_date || undefined,
      start_date: form.start_date || null,
      notes: form.notes,
    };
    if (form.duration_months !== '' && form.duration_months !== null) payload.duration_months = form.duration_months;
    else payload.end_date = form.end_date || null;
    if (!['Signed', 'Active'].includes(editing.status)) {
      payload.contract_value = form.contract_value;
      payload.down_payment = form.down_payment;
    }
    try {
      await api.put(`/re-contracts/${editing.id}`, payload);
      toast.success(t('realEstate.contracts.toastUpdateSuccess'));
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.contracts.toastUpdateError'));
    }
  };

  const count = (fn) => allContracts.filter(fn).length;
  const commercialFrozen = editing && ['Signed', 'Active'].includes(editing.status);

  const columns = [
    { key: 'contract_number', label: t('realEstate.contracts.colNumber'), render: (v) => <strong className="num-en">{v}</strong> },
    { key: 'customer_name', label: t('realEstate.contracts.colCustomer'), render: (v) => v || '—' },
    { key: 'deal_title', label: t('realEstate.contracts.colDeal'), render: (v, c) => <span title={`Deal #${c.deal_id}`}>{v || `#${c.deal_id}`}</span> },
    { key: 'unit', label: t('realEstate.contracts.colUnit'), render: (_, c) => (c.unit_number ? `${c.project_name || ''} • ${c.unit_number}` : '—') },
    { key: 'contract_date', label: t('realEstate.contracts.colContractDate'), render: fmtDate },
    { key: 'start_date', label: t('realEstate.contracts.colStartDate'), render: fmtDate },
    { key: 'end_date', label: t('realEstate.contracts.colEndDate'), render: fmtDate },
    {
      key: 'duration_months',
      label: t('realEstate.contracts.colDuration'),
      render: (v) => (v ? <span className="num-en">{t('realEstate.contracts.durationMonths', { count: v })}</span> : '—')
    },
    { key: 'contract_value', label: t('realEstate.contracts.colValue'), render: (v) => fmtMoney(v, t('realEstate.common.currencySuffix')) },
    { key: 'expiry', label: t('realEstate.contracts.colExpiry'), render: (_, c) => expiryBadge(c) },
    { key: 'status', label: t('realEstate.contracts.colStatus'), render: (v) => <Badge color={STATUS_COLOR[v]}>{getStatusLabel(v)}</Badge> },
    {
      key: 'actions',
      label: t('realEstate.contracts.colActions'),
      align: isRTL ? 'left' : 'right',
      render: (_, c) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: isRTL ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
          {nextStepMap[c.status] && (
            <ActionButton color={nextStepMap[c.status].color} onClick={() => transition(c, nextStepMap[c.status].status)}>
              {nextStepMap[c.status].label}
            </ActionButton>
          )}
          {c.status === 'Active' && (
            <ActionButton color="#059669" onClick={() => navigate(`/handover?deal_id=${c.deal_id}`)}>
              {t('realEstate.contracts.btnProceedHandover')}
            </ActionButton>
          )}
          {!['Completed', 'Cancelled'].includes(c.status) && (
            <ActionButton outline color="#334155" onClick={() => openEdit(c)}>
              {t('realEstate.contracts.btnEdit')}
            </ActionButton>
          )}
          <ActionButton outline color="#0284c7" onClick={() => openAttachments(c)}>
            <Paperclip size={13} style={{ marginInlineEnd: '4px' }} />
            {t('realEstate.contracts.btnAttachments')}
          </ActionButton>
          <ActionButton outline color="#2563eb" onClick={() => navigate(`/installments?deal_id=${c.deal_id}`)}>
            {t('realEstate.contracts.btnInstallments')}
          </ActionButton>
          {!['Completed', 'Cancelled'].includes(c.status) && (
            <ActionButton outline color="#b91c1c" onClick={() => transition(c, 'Cancelled')}>
              {t('realEstate.contracts.btnCancel')}
            </ActionButton>
          )}
        </div>
      )
    },
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WorkspaceHeader
        icon={<FileText size={22} color="#2563eb" />}
        title={t('realEstate.contracts.title')}
        subtitle={t('realEstate.contracts.subtitle')}
      />
      <DealFilterBanner dealId={dealId} label={allContracts[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: t('realEstate.contracts.statTotal'), value: allContracts.length },
        { label: t('realEstate.contracts.statActive'), value: count(c => c.status === 'Active'), color: '#15803d' },
        { label: t('realEstate.contracts.statExpiringSoon'), value: count(c => c.expiry_state === 'expiring_soon'), color: '#b45309' },
        { label: t('realEstate.contracts.statExpired'), value: count(c => c.expiry_state === 'expired'), color: '#b91c1c' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('realEstate.contracts.filterAll') },
        { value: 'Draft', label: t('realEstate.contracts.filterDraft') },
        { value: 'Signed', label: t('realEstate.contracts.filterSigned') },
        { value: 'Active', label: t('realEstate.contracts.filterActive') },
        { value: 'expiring_soon', label: t('realEstate.contracts.filterExpiringSoon') },
        { value: 'expired', label: t('realEstate.contracts.filterExpired') },
        { value: 'Completed', label: t('realEstate.contracts.filterCompleted') },
        { value: 'Cancelled', label: t('realEstate.contracts.filterCancelled') },
      ]} />
      <SimpleTable
        columns={columns}
        rows={contracts}
        loading={loading}
        empty={t('realEstate.contracts.empty')}
      />

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? t('realEstate.contracts.modalEditTitle', { number: editing.contract_number }) : ''}
        footer={<>
          <button className="btn-cancel" onClick={() => setEditing(null)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.cancel')}
          </button>
          <button className="btn-save" onClick={saveEdit} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.save')}
          </button>
        </>}
      >
        {editing && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>{t('realEstate.contracts.lblContractDate')}</label>
              <input type="date" style={fieldStyle} value={form.contract_date} onChange={e => setForm({ ...form, contract_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.contracts.lblStartDate')}</label>
              <input type="date" style={fieldStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.contracts.lblDurationMonths')}</label>
              <input type="number" min="0" style={fieldStyle} value={form.duration_months} onChange={e => setForm({ ...form, duration_months: e.target.value })} placeholder="e.g. 12" />
            </div>
            <div>
              <label style={labelStyle}>
                {t('realEstate.contracts.lblEndDate')} {form.duration_months !== '' && <span style={{ color: '#94a3b8' }}>{t('realEstate.contracts.lblFromDuration')}</span>}
              </label>
              <input type="date" style={fieldStyle} value={form.end_date} disabled={form.duration_months !== ''} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.contracts.lblContractValue')}</label>
              <input type="number" style={fieldStyle} value={form.contract_value} disabled={commercialFrozen} onChange={e => setForm({ ...form, contract_value: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.contracts.lblDownPayment')}</label>
              <input type="number" style={fieldStyle} value={form.down_payment} disabled={commercialFrozen} onChange={e => setForm({ ...form, down_payment: e.target.value })} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>{t('realEstate.contracts.lblNotes')}</label>
              <textarea rows="2" style={fieldStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            {commercialFrozen && (
              <div style={{ gridColumn: 'span 2', fontSize: '12px', color: '#92400e' }}>
                {t('realEstate.contracts.commercialFrozenNotice', { status: getStatusLabel(editing.status) })}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!activeAttachmentContract}
        onClose={() => setActiveAttachmentContract(null)}
        title={activeAttachmentContract ? `${t('realEstate.contracts.attachmentsTitle')} — #${activeAttachmentContract.contract_number}` : ''}
        footer={
          <button
            className="btn-cancel"
            onClick={() => setActiveAttachmentContract(null)}
            style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {t('realEstate.common.cancel')}
          </button>
        }
      >
        {activeAttachmentContract && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '13px' }}>
              <div><strong>{t('realEstate.contracts.colCustomer')}:</strong> {activeAttachmentContract.customer_name || '—'}</div>
              <div><strong>{t('realEstate.contracts.colUnit')}:</strong> {activeAttachmentContract.unit_number || '—'}</div>
              <div><strong>{t('realEstate.contracts.colValue')}:</strong> {fmtMoney(activeAttachmentContract.contract_value, t('realEstate.common.currencySuffix'))}</div>
              <Badge color={STATUS_COLOR[activeAttachmentContract.status]}>{getStatusLabel(activeAttachmentContract.status)}</Badge>
            </div>

            <FileUploader
              linkedType="contract"
              linkedId={activeAttachmentContract.id}
              onUploadSuccess={() => loadContractAttachments(activeAttachmentContract.id)}
            />

            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#334155' }}>
                {t('realEstate.contracts.attachmentsTitle')} ({contractAttachments.length})
              </div>
              {loadingAttachments ? (
                <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '13px' }}>
                  {t('common.loading')}
                </div>
              ) : contractAttachments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: '13px' }}>
                  {t('realEstate.contracts.noAttachments')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                  {contractAttachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#ffffff',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        <FileText size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div
                            style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                            title={att.original_name}
                          >
                            {att.original_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {fmtDate(att.created_at)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(att.file_path, att.original_name)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Contracts;
