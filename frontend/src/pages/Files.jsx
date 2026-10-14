import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';
import { FileText, Download, Trash2, Search, Link as LinkIcon, User, Handshake, CheckCircle } from 'lucide-react';
import DataTable from '../components/Common/DataTable';

const Files = () => {
  const { t, isRTL } = useLanguage();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/files');
      setFiles(res.data.data);
    } catch (err) {
      toast.error(t('files.toastLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDownload = (filePath, originalName) => {
    // Construct the absolute URL to the static file with authentication token
    const token = localStorage.getItem('token');
    const cleanPath = (filePath || '').replace(/\\/g, '/');
    const baseUrl = api.defaults.baseURL.replace('/api', '');
    const separator = cleanPath.includes('?') ? '&' : '?';
    const url = `${baseUrl}/${cleanPath}${token ? `${separator}token=${encodeURIComponent(token)}` : ''}`;
    
    // Create a temporary link and click it to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', originalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('files.confirmDelete'))) {
      try {
        await api.delete(`/files/${id}`);
        toast.success(t('files.toastDeleted'));
        fetchFiles(false);
      } catch (err) {
        toast.error(t('files.toastDeleteFailed'));
      }
    }
  };

  const columns = [
    { 
      key: 'original_name', 
      label: t('files.colName'),
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: '#f8fafc', color: 'var(--text-muted)' }}>
            <FileText size={16} />
          </div>
          <span style={{ fontWeight: '600' }}>{val}</span>
        </div>
      )
    },
    { 
      key: 'linked_type', 
      label: t('files.colAttachedTo'),
      render: (val, item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          {val === 'customer' && <User size={14} color="#2563eb" />}
          {val === 'deal' && <Handshake size={14} color="#f59e0b" />}
          {val === 'task' && <CheckCircle size={14} color="#16a34a" />}
          <span>{t(`files.attachedTypes.${val}`, val)}</span>
        </div>
      )
    },
    { 
      key: 'created_at', 
      label: t('files.colUploadedOn'),
      render: (val) => <span className="num-en">{val ? new Date(val).toLocaleDateString('en-CA') : '—'}</span>
    }
  ];

  return (
    <div className="files-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .btn-download { color: var(--primary); background: #eff6ff; padding: 6px; border-radius: 6px; }
        .btn-download:hover { background: #dbeafe; }
      `}</style>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '800' }}>{t('files.title')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t('files.subtitle')}</p>
      </div>

      <DataTable 
        title={t('files.tableTitle')}
        columns={columns}
        data={files}
        loading={loading}
        onEdit={(item) => handleDownload(item.file_path, item.original_name)}
        onDelete={handleDelete}
      />
    </div>
  );
};

export default Files;
