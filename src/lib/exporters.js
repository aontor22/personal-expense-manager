import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function safeFilePart(value) {
  return String(value || 'report').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
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
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount || 0);
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
      item.title,
      item.category,
      item.payment_method || 'Cash',
      item.amount,
      item.note || '',
      item.sync_status || 'local',
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilePart(label)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(expenses, label = 'expense-backup') {
  const payload = {
    app: 'Personal Expense Manager',
    exported_at: new Date().toISOString(),
    expenses,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilePart(label)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportExcel(expenses, label = 'expense-report') {
  const summary = summarizeExpenses(expenses);

  const workbook = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet(
    expenses.map((item) => ({
      Date: item.expense_date,
      Title: item.title,
      Category: item.category,
      'Payment Method': item.payment_method || 'Cash',
      Amount: Number(item.amount || 0),
      Note: item.note || '',
      'Sync Status': item.sync_status || 'local',
    }))
  );

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Metric', 'Value'],
    ['Total Expense', summary.total],
    ['Number of Entries', summary.count],
    ['Top Category', summary.topCategory],
    [],
    ['Category', 'Amount'],
    ...Object.entries(summary.categories).map(([category, amount]) => [category, amount]),
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Expenses');
  XLSX.writeFile(workbook, `${safeFilePart(label)}.xlsx`);
}

export function exportPDF(expenses, label = 'expense-report') {
  const summary = summarizeExpenses(expenses);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(18);
  doc.text('Personal Expense Report', 40, 45);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 65);
  doc.text(`Report: ${label}`, 40, 80);

  autoTable(doc, {
    startY: 105,
    head: [['Metric', 'Value']],
    body: [
      ['Total Expense', formatBDT(summary.total)],
      ['Number of Entries', String(summary.count)],
      ['Top Category', summary.topCategory],
    ],
    theme: 'grid',
    headStyles: { fillColor: [17, 24, 39] },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Date', 'Title', 'Category', 'Method', 'Amount', 'Note']],
    body: expenses.map((item) => [
      item.expense_date,
      item.title,
      item.category,
      item.payment_method || 'Cash',
      formatBDT(item.amount),
      item.note || '',
    ]),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [17, 24, 39] },
  });

  doc.save(`${safeFilePart(label)}.pdf`);
}
