import toast from 'react-hot-toast';

/**
 * Exports data to an Excel-compatible CSV file with UTF-8 BOM
 * Guarantees proper rendering of Arabic characters in Microsoft Excel
 */
export function exportCustomersToExcel(customersList = [], filename = 'customers_export.csv') {
  if (!customersList || customersList.length === 0) {
    toast.error('No data available to export');
    return;
  }

  const headers = [
    'Customer Name',
    'Classification',
    'Phone',
    'Email',
    'Company / Job',
    'Source',
    'Meta Form',
    'Form ID',
    'Notes & Answers',
    'Address',
    'Status',
    'Created At'
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = customersList.map(c => [
    escapeCsv(c.name || ''),
    escapeCsv(c.classification_name || ''),
    escapeCsv(c.phone || ''),
    escapeCsv(c.email || ''),
    escapeCsv(c.company_name || ''),
    escapeCsv(c.source_name || c.source || 'Direct'),
    escapeCsv(c.meta_form_name || ''),
    escapeCsv(c.meta_form_id || ''),
    escapeCsv(c.notes || ''),
    escapeCsv(c.address || ''),
    escapeCsv(c.status || ''),
    escapeCsv(c.created_at ? new Date(c.created_at).toLocaleString('en-US') : '')
  ]);

  // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel opens UTF-8 text correctly
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.setAttribute('download', cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.success(`Successfully exported ${customersList.length} records to Excel`);
}
