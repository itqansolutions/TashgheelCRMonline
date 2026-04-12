import React, { useState, useEffect } from 'react';
import { Search, Edit2, Trash2, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';

const DataTable = ({ columns, data, onEdit, onDelete, title, loading, actions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset to Page 1 on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Sorting Logic
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...(data || [])].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Filtering Logic
  const filteredData = sortedData.filter(item => 
    Object.values(item || {}).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  if (loading) return <div className="loading-spinner">Loading...</div>;

  return (
    <div className="table-card">
      <style>{`
        .table-card {
          background: var(--bg-card);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: var(--radius);
          border: 1px solid var(--glass-border);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          margin-top: 24px;
          transition: transform 0.3s;
        }
        .table-header {
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
          gap: 15px;
        }
        .table-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.02em;
        }
        .table-search {
          display: flex;
          align-items: center;
          background: var(--bg-main);
          border: 1px solid var(--border);
          padding: 8px 12px;
          border-radius: 8px;
          width: 300px;
          gap: 10px;
        }
        .table-search input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          width: 100%;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .data-table th {
          background: rgba(0, 0, 0, 0.02);
          padding: 16px 20px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: all 0.2s;
        }
        .data-table th:hover {
          color: var(--primary);
          background: rgba(79, 70, 229, 0.05);
        }
        .data-table td {
          padding: 16px 20px;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 1px solid var(--border);
          color: var(--text-main);
          transition: all 0.2s;
        }
        .data-table tr:hover td {
          background-color: rgba(79, 70, 229, 0.02);
          color: var(--primary);
        }
        .action-btns {
          display: flex;
          gap: 10px;
        }
        .btn-icon {
          padding: 6px;
          border-radius: 6px;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
        }
        .btn-edit { color: var(--primary); }
        .btn-delete { color: var(--danger); }
        .btn-icon:hover { background: #e2e8f0; }

        .pagination {
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border);
          font-size: 14px;
          color: var(--text-muted);
        }
        .page-btns {
          display: flex;
          gap: 8px;
        }
        .page-btn {
          padding: 8px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: white;
          font-weight: 600;
          transition: all 0.2s;
          color: var(--text-main);
        }
        .page-btn:hover:not(:disabled) {
          border-color: var(--primary);
          color: var(--primary);
          background: rgba(79, 70, 229, 0.05);
        }
        .page-btn:disabled {
          background: transparent;
          color: #cbd5e1;
          cursor: not-allowed;
          opacity: 0.5;
        }
        .status-badge {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }
      `}</style>

      <div className="table-header">
        <h3 className="table-title">{title}</h3>
        <div className="table-search">
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {col.label}
                    <ArrowUpDown size={14} />
                  </div>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.length > 0 ? (
              currentItems.map((item, index) => (
                <tr key={item.id || index}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render ? col.render(item[col.key], item) : item[col.key]}
                    </td>
                  ))}
                  <td>
                    <div className="action-btns">
                      {actions && actions(item)}
                      <button label="table edit control" className="btn-icon btn-edit" onClick={() => onEdit(item)}>
                        <Edit2 size={16} />
                      </button>
                      <button label="table delete control" className="btn-icon btn-delete" onClick={() => onDelete(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '64px 24px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '8px' }}>
                        {localStorage.getItem('lang') === 'ar' ? 'لا توجد بيانات متاحة' : 'No entries found'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '300px', margin: '0 auto' }}>
                        {localStorage.getItem('lang') === 'ar' 
                            ? 'ابدأ بإضافة أول عنصر لعرضه هنا في الجدول.' 
                            : 'Start by adding your first record to see it appear here in the table.'}
                    </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div>
          Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredData.length)} of {filteredData.length} entries
        </div>
        <div className="page-btns">
          <button 
            label="previous table entry"
            className="page-btn" 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px' }}>
            Page {currentPage} of {totalPages || 1}
          </span>
          <button 
            label="next table entry"
            className="page-btn" 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
