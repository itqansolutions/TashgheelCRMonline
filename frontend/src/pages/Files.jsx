import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FileText, Download, Trash2, Search, Link as LinkIcon, User, Handshake, CheckCircle } from 'lucide-react';
import DataTable from '../components/Common/DataTable';

const Files = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/files');
      setFiles(res.data.data);
    } catch (err) {
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDownload = (filePath, originalName) => {
    // Construct the absolute URL to the static file
    const url = `${api.defaults.baseURL.replace('/api', '')}/${filePath}`;
    
    // Create a temporary link and click it to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', originalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this file permanently?')) {
      try {
        await api.delete(`/files/${id}`);
        toast.success('File deleted');
        fetchFiles(false);
      } catch (err) {
        toast.error('Delete failed');
      }
    }
  };

  const columns = [
    { 
      key: 'original_name', 
      label: 'File Name',
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
      label: 'Attached To',
      render: (val, item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          {val === 'customer' && <User size={14} color="#2563eb" />}
          {val === 'deal' && <Handshake size={14} color="#f59e0b" />}
          {val === 'task' && <CheckCircle size={14} color="#16a34a" />}
          <span style={{ textTransform: 'capitalize' }}>{val}</span>
        </div>
      )
    },
    { 
      key: 'created_at', 
      label: 'Uploaded On',
      render: (val) => new Date(val).toLocaleDateString()
    }
  ];

  return (
    <div className="files-page">
      <style>{`
        .btn-download { color: var(--primary); background: #eff6ff; padding: 6px; border-radius: 6px; }
        .btn-download:hover { background: #dbeafe; }
      `}</style>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '800' }}>File Management</h2>
        <p style={{ color: 'var(--text-muted)' }}>Access all documents, images, and attachments across the system.</p>
      </div>

      <DataTable 
        title="All System Attachments"
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
