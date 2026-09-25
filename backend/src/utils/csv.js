// Export CSV compatible Excel : séparateur « ; », BOM UTF-8, protection anti-formule.
export function toCsv(rows, { delimiter = ';' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '\uFEFF';
  const columns = Object.keys(list[0]);
  const cell = value => {
    let text = value === null || value === undefined ? ''
      : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // neutralise les formules tableur
    return `"${text.replaceAll('"', '""')}"`;
  };
  const header = columns.map(cell).join(delimiter);
  const body = list.map(row => columns.map(column => cell(row[column])).join(delimiter)).join('\r\n');
  return `\uFEFF${header}\r\n${body}`;
}
