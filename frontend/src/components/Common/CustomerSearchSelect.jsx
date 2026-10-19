import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Phone, Tag, User, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const CustomerSearchSelect = ({
  customers = [],
  value,
  onChange,
  required = false,
  placeholder,
  disabled = false,
  style = {},
  className = ''
}) => {
  const { t, isRTL } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!value && value !== 0) return null;
    return customers.find(c => String(c.id) === String(value)) || null;
  }, [customers, value]);

  // Click outside to close & focus management
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter customers by name, phone, company, or category/classification
  const filteredCustomers = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return customers.slice(0, 100);
    return customers.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const company = (c.company_name || '').toLowerCase();
      const classification = (c.classification_name || '').toLowerCase();
      const entity = (c.entity_type || '').toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        company.includes(q) ||
        classification.includes(q) ||
        entity.includes(q)
      );
    }).slice(0, 80);
  }, [customers, searchQuery]);

  const handleSelect = (customer) => {
    onChange?.(customer ? String(customer.id) : '', customer);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('', null);
    setSearchQuery('');
  };

  const defaultPlaceholder = t('customers.searchSelectPlaceholder', isRTL ? 'اختر العميل (بحث بالاسم، رقم الموبايل أو الفئة)...' : 'Select customer (search by name, phone or category)...');

  return (
    <div
      ref={containerRef}
      className={`customer-search-select-container ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        direction: isRTL ? 'rtl' : 'ltr',
        ...style
      }}
    >
      {/* Hidden input for HTML5 required form validation */}
      <input
        type="text"
        value={value || ''}
        required={required}
        tabIndex={-1}
        style={{
          opacity: 0,
          width: '1px',
          height: '1px',
          position: 'absolute',
          top: '50%',
          left: '50%',
          pointerEvents: 'none',
          border: 'none',
          padding: 0
        }}
        onChange={() => {}}
      />

      {/* Trigger Box */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        style={{
          minHeight: '44px',
          padding: '6px 12px',
          border: isOpen ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--glass-border, #cbd5e1)',
          borderRadius: '8px',
          background: 'var(--bg-card, #ffffff)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxShadow: isOpen ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        {selectedCustomer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main, #1e293b)' }}>
              {selectedCustomer.name}
            </span>

            {selectedCustomer.company_name && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                ({selectedCustomer.company_name})
              </span>
            )}

            {selectedCustomer.phone && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: '#0369a1',
                  background: 'rgba(14, 165, 233, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: 600
                }}
                className="num-en"
              >
                <Phone size={11} />
                {selectedCustomer.phone}
              </span>
            )}

            {(selectedCustomer.classification_name || selectedCustomer.entity_type) && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: selectedCustomer.classification_color ? '#ffffff' : '#475569',
                  background: selectedCustomer.classification_color || '#e2e8f0',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 700
                }}
              >
                <Tag size={10} />
                {selectedCustomer.classification_name || selectedCustomer.entity_type}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: '13px', color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={15} style={{ opacity: 0.7 }} />
            {placeholder || defaultPlaceholder}
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {selectedCustomer && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title={t('common.clear', 'مسح الاختيار')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <X size={15} />
            </button>
          )}
          <ChevronDown
            size={16}
            style={{
              color: 'var(--text-muted, #94a3b8)',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease'
            }}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--bg-card, #ffffff)',
            borderRadius: '10px',
            border: '1px solid var(--glass-border, #cbd5e1)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Search Input Header */}
          <div
            style={{
              padding: '10px',
              borderBottom: '1px solid var(--glass-border, #f1f5f9)',
              background: 'rgba(0, 0, 0, 0.02)',
              position: 'relative'
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  [isRTL ? 'right' : 'left']: '10px',
                  color: '#94a3b8',
                  pointerEvents: 'none'
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRTL ? 'ابحث بالاسم، رقم الموبايل، أو الفئة...' : 'Search by name, phone, or category...'}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: isRTL ? '8px 34px 8px 10px' : '8px 10px 8px 34px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--glass-border, #cbd5e1)',
                  background: 'var(--bg-card, #ffffff)',
                  color: 'var(--text-main, #1e293b)',
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    [isRTL ? 'left' : 'right']: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Customer Items List */}
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '4px'
            }}
          >
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                {isRTL ? 'لا يوجد عملاء يطابقون بحثك' : 'No matching customers found'}
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const isSelected = String(c.id) === String(value);
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                      transition: 'background 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main, #1e293b)' }}>
                          {c.name}
                        </span>
                        {c.company_name && (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            ({c.company_name})
                          </span>
                        )}
                        {(c.classification_name || c.entity_type) && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 7px',
                              borderRadius: '10px',
                              fontWeight: 700,
                              color: c.classification_color ? '#ffffff' : '#475569',
                              background: c.classification_color || '#e2e8f0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                          >
                            <Tag size={9} />
                            {c.classification_name || c.entity_type}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {c.phone ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#0284c7',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            className="num-en"
                          >
                            <Phone size={11} />
                            {c.phone}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {isRTL ? 'بدون هاتف' : 'No phone'}
                          </span>
                        )}

                        {c.area_name && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            📍 {c.area_name}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={16} style={{ color: 'var(--primary, #3b82f6)', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerSearchSelect;
