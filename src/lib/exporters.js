import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function safeFilePart(value) {
  return String(value || 'report').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
}

// Prevent spreadsheet formula injection when exported values are opened in
// Excel, Google Sheets or compatible software.
function safeSpreadsheetText(value) {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBDT(value) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function summarizeExpenses(expenses) {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = expenses.reduce((acc, item) => {
    const category = item.category || 'Other';
    acc[category] = (acc[category] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

  return {
    total,
    count: expenses.length,
    topCategory: topCategory ? `${topCategory[0]} (${formatBDT(topCategory[1])})` : 'N/A',
    categories,
  };
}

export function exportCSV(expenses, label = 'expenses') {
  const rows = [
    ['Date', 'Title', 'Category', 'Payment Method', 'Amount', 'Note', 'Sync Status'],
    ...expenses.map((item) => [
      item.expense_date,
      safeSpreadsheetText(item.title),
      safeSpreadsheetText(item.category),
      safeSpreadsheetText(item.payment_method || 'Cash'),
      Number(item.amount || 0),
      safeSpreadsheetText(item.note || ''),
      safeSpreadsheetText(item.sync_status || 'local'),
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');

  // UTF-8 BOM keeps Bangla and other Unicode text readable in Excel.
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${safeFilePart(label)}.csv`);
}

export function exportJSON(expenses, label = 'expense-backup') {
  const payload = {
    app: 'Personal Expense Manager',
    version: 2,
    exported_at: new Date().toISOString(),
    expenses,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${safeFilePart(label)}.json`);
}

export function exportExcel(expenses, label = 'expense-report') {
  const summary = summarizeExpenses(expenses);
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ['Metric', 'Value'],
    ['Total Expense', summary.total],
    ['Number of Entries', summary.count],
    ['Top Category', safeSpreadsheetText(summary.topCategory)],
    [],
    ['Category', 'Amount'],
    ...Object.entries(summary.categories).map(([category, amount]) => [safeSpreadsheetText(category), amount]),
  ];

  const detailRows = expenses.map((item) => ({
    Date: safeSpreadsheetText(item.expense_date),
    Title: safeSpreadsheetText(item.title),
    Category: safeSpreadsheetText(item.category),
    'Payment Method': safeSpreadsheetText(item.payment_method || 'Cash'),
    Amount: Number(item.amount || 0),
    Note: safeSpreadsheetText(item.note || ''),
    'Sync Status': safeSpreadsheetText(item.sync_status || 'local'),
  }));

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const detailSheet = XLSX.utils.json_to_sheet(detailRows, {
    header: ['Date', 'Title', 'Category', 'Payment Method', 'Amount', 'Note', 'Sync Status'],
  });

  summarySheet['!cols'] = [{ wch: 24 }, { wch: 30 }];
  detailSheet['!cols'] = [
    { wch: 13 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 42 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Expenses');
  XLSX.writeFile(workbook, `${safeFilePart(label)}.xlsx`, { compression: true });
}

export function exportPDF(expenses, label = 'expense-report') {
  const summary = summarizeExpenses(expenses);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(18);
  doc.text('Personal Expense Report', 40, 45);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 65);
  doc.text(`Report: ${String(label).slice(0, 90)}`, 40, 80);

  autoTable(doc, {
    startY: 105,
    head: [['Metric', 'Value']],
    body: [
      ['Total Expense', formatBDT(summary.total)],
      ['Number of Entries', String(summary.count)],
      ['Top Category', summary.topCategory],
    ],
    theme: 'grid',
    headStyles: { fillColor: [67, 56, 202] },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Date', 'Title', 'Category', 'Method', 'Amount', 'Note']],
    body: expenses.map((item) => [
      String(item.expense_date || '').slice(0, 10),
      String(item.title || '').slice(0, 120),
      String(item.category || '').slice(0, 80),
      String(item.payment_method || 'Cash').slice(0, 40),
      formatBDT(item.amount),
      String(item.note || '').slice(0, 260),
    ]),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [67, 56, 202] },
  });

  doc.save(`${safeFilePart(label)}.pdf`);
}
