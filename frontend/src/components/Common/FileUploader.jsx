import React, { useState } from 'react';
import { Upload, X, File, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const FileUploader = ({ linkedType, linkedId, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return toast.error('Please select a file');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('linked_type', linkedType);
    formData.append('linked_id', linkedId);

    setUploading(true);
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('File uploaded successfully');
      setFile(null);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-uploader">
      <style>{`
        .file-uploader {
          border: 2px dashed var(--border);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          background: var(--bg-main);
          transition: border-color 0.2s;
        }
        .file-uploader:hover {
          border-color: var(--primary);
        }
        .upload-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }
        .upload-icon {
          width: 48px;
          height: 48px;
          background: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .file-info {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 14px;
          color: var(--text-main);
          background: white;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .btn-upload-submit {
          margin-top: 16px;
          background: var(--primary);
          color: white;
          padding: 8px 24px;
          border-radius: 8px;
          font-weight: 600;
          transition: opacity 0.2s;
        }
        .btn-upload-submit:disabled { opacity: 0.5; }
      `}</style>

      {!file ? (
        <label className="upload-label">
          <div className="upload-icon">
            <Upload size={24} />
          </div>
          <div>
            <p style={{ fontWeight: '600', fontSize: '14px' }}>Click to upload or drag and drop</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>PDF, PNG, JPG or DOCX (max. 5MB)</p>
          </div>
          <input type="file" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="file-info">
            <File size={16} color="var(--primary)" />
            <span>{file.name}</span>
            <button label="remove upload attachment" onClick={() => setFile(null)} style={{ color: 'var(--danger)', background: 'transparent' }}>
              <X size={16} />
            </button>
          </div>
          <button label="submit upload attachment"
            className="btn-upload-submit" 
            onClick={handleUpload} 
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Confirm Upload'}
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
