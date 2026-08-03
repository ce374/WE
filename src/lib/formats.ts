import { AppData, We0 } from './types';

// --- CSV helpers ---

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        field = '';
        if (row.some(f => f.trim() !== '')) rows.push(row);
        row = [];
        if (ch === '\r' && next === '\n') i++;
      } else {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

function decodeDest(s: string): { storageType: string; folderPath: string } {
  const idx = s.indexOf(':');
  if (idx === -1) return { storageType: s, folderPath: '' };
  return { storageType: s.substring(0, idx), folderPath: s.substring(idx + 1) };
}

// --- TXT Export/Import ---

function sanitizeForTxt(s: string): string {
  return s.replace(/[\r\n]/g, ' ');
}

export function exportTXT(data: AppData): string {
  const lines: string[] = [];
  for (const w of data.we0s) {
    lines.push('[W]');
    lines.push(`name:${sanitizeForTxt(w.name)}`);
    lines.push(`type:${sanitizeForTxt(w.type)}`);
    lines.push('');
    for (const c of w.cells) {
      lines.push('[C]');
      lines.push(`parent:${sanitizeForTxt(w.name)}`);
      lines.push(`filename:${sanitizeForTxt(c.filename)}`);
      lines.push(`password:${sanitizeForTxt(c.password)}`);
      lines.push(`description:${sanitizeForTxt(c.description)}`);
      const dests = c.destinations.map(d => `${sanitizeForTxt(d.storageType)}:${sanitizeForTxt(d.folderPath)}`).join(';');
      lines.push(`destinations:${dests}`);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function importTXT(text: string): AppData {
  const data: AppData = { we0s: [] };
  const we0Map = new Map<string, We0>();
  let blockType = '';
  const fields: Record<string, string> = {};

  function processBlock() {
    if (blockType === 'W' && fields.name) {
      const we0: We0 = { name: fields.name, type: fields.type || 'others', cells: [] };
      data.we0s.push(we0);
      we0Map.set(we0.name, we0);
    } else if (blockType === 'C' && fields.parent) {
      const we0 = we0Map.get(fields.parent);
      if (we0) {
        const destStr = fields.destinations || '';
        const destinations = destStr
          ? destStr.split(';').map(decodeDest).filter(d => d.storageType)
          : [];
        we0.cells.push({
          filename: fields.filename || '',
          password: fields.password || '',
          description: fields.description || '',
          destinations,
        });
      }
    }
    for (const k in fields) delete fields[k];
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '[W]') {
      processBlock();
      blockType = 'W';
    } else if (line === '[C]') {
      processBlock();
      blockType = 'C';
    } else if (line) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        fields[line.substring(0, idx).trim()] = line.substring(idx + 1);
      }
    }
  }
  processBlock();

  return data;
}

// --- CSV Export/Import ---

const CSV_HEADER = 'record_type,we0_name,type,filename,password,description,destinations';

export function exportCSV(data: AppData): string {
  const rows: string[] = [CSV_HEADER];

  for (const w of data.we0s) {
    rows.push([
      csvEscape('W'),
      csvEscape(w.name),
      csvEscape(w.type),
      '', '', '', '',
    ].join(','));

    for (const c of w.cells) {
      const dests = c.destinations.map(d => `${d.storageType}:${d.folderPath}`).join(';');
      rows.push([
        csvEscape('C'),
        csvEscape(w.name),
        '',
        csvEscape(c.filename),
        csvEscape(c.password),
        csvEscape(c.description),
        csvEscape(dests),
      ].join(','));
    }
  }

  return rows.join('\n') + '\n';
}

export function importCSV(text: string): AppData {
  const rows = parseCSV(text);
  const data: AppData = { we0s: [] };
  const we0Map = new Map<string, We0>();

  // detect header format to find column indices
  const header = rows[0] || [];
  const isNewFormat = header.includes('filename') && header.includes('password');

  // column index maps for new format
  let colRecordType = 0;
  let colWe0Name = 1;
  let colType = 2;
  let colFilename = 3;
  let colPassword = 4;
  let colDescription = 5;
  let colDestinations = 6;

  if (isNewFormat) {
    colRecordType = header.indexOf('record_type');
    colWe0Name = header.indexOf('we0_name');
    colType = header.indexOf('type');
    colFilename = header.indexOf('filename');
    colPassword = header.indexOf('password');
    colDescription = header.indexOf('description');
    colDestinations = header.indexOf('destinations');
  }

  const startRow = isNewFormat || header[0] === 'record_type' ? 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const recordType = row[colRecordType] || '';

    if (recordType === 'W') {
      const we0: We0 = {
        name: row[colWe0Name] || '',
        type: row[colType] || 'others',
        cells: [],
      };
      data.we0s.push(we0);
      we0Map.set(we0.name, we0);
    } else if (recordType === 'C') {
      const we0 = we0Map.get(row[colWe0Name] || '');
      if (we0) {
        const destStr = row[colDestinations] || '';
        const destinations = destStr
          ? destStr.split(';').map(decodeDest).filter(d => d.storageType)
          : [];
        we0.cells.push({
          filename: row[colFilename] || '',
          password: row[colPassword] || '',
          description: row[colDescription] || '',
          destinations,
        });
      }
    }
  }

  return data;
}

// --- XLSX Export/Import ---

const XLSX_HEADER = ['record_type', 'we0_name', 'type', 'filename', 'password', 'description', 'destinations'];

export async function exportXLSX(data: AppData): Promise<Blob> {
  const XLSX = await import('xlsx');

  const rows: (string | number)[][] = [XLSX_HEADER];

  for (const w of data.we0s) {
    rows.push(['W', w.name, w.type, '', '', '', '']);
    for (const c of w.cells) {
      const dests = c.destinations.map(d => `${d.storageType}:${d.folderPath}`).join(';');
      rows.push(['C', w.name, '', c.filename, c.password, c.description, dests]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'data');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function importXLSX(buffer: ArrayBuffer): Promise<AppData> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

  const data: AppData = { we0s: [] };
  const we0Map = new Map<string, We0>();

  const header = rows[0] || [];
  const isNewFormat = header.some(h => String(h) === 'filename');

  let colRecordType = 0;
  let colWe0Name = 1;
  let colType = 2;
  let colFilename = 3;
  let colPassword = 4;
  let colDescription = 5;
  let colDestinations = 6;

  if (isNewFormat) {
    colRecordType = header.indexOf('record_type');
    colWe0Name = header.indexOf('we0_name');
    colType = header.indexOf('type');
    colFilename = header.indexOf('filename');
    colPassword = header.indexOf('password');
    colDescription = header.indexOf('description');
    colDestinations = header.indexOf('destinations');
  }

  const startRow = isNewFormat || String(header[0]) === 'record_type' ? 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const recordType = String(row[colRecordType] || '');

    if (recordType === 'W') {
      const we0: We0 = {
        name: String(row[colWe0Name] || ''),
        type: String(row[colType] || 'others'),
        cells: [],
      };
      data.we0s.push(we0);
      we0Map.set(we0.name, we0);
    } else if (recordType === 'C') {
      const we0 = we0Map.get(String(row[colWe0Name] || ''));
      if (we0) {
        const destStr = String(row[colDestinations] || '');
        const destinations = destStr
          ? destStr.split(';').map(decodeDest).filter(d => d.storageType)
          : [];
        we0.cells.push({
          filename: String(row[colFilename] || ''),
          password: String(row[colPassword] || ''),
          description: String(row[colDescription] || ''),
          destinations,
        });
      }
    }
  }

  return data;
}

// --- Helpers ---

export function detectFormat(filename: string, content?: string): 'txt' | 'csv' | 'xlsx' {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (ext === 'txt') return 'txt';
  if (content) {
    if (content.includes('[W]') || content.includes('W|')) return 'txt';
    if (content.includes('record_type') || content.includes('we0_name')) return 'csv';
  }
  return 'txt';
}

export function downloadFile(content: string | Blob, filename: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mergeData(existing: AppData, imported: AppData): AppData {
  const merged = { ...existing };
  const we0Map = new Map<string, We0>();
  for (const w of merged.we0s) we0Map.set(w.name, w);

  for (const imp of imported.we0s) {
    const existingWe0 = we0Map.get(imp.name);
    if (existingWe0) {
      const cellFilenames = new Set(existingWe0.cells.map(c => c.filename));
      for (const cell of imp.cells) {
        if (!cellFilenames.has(cell.filename)) {
          existingWe0.cells.push(cell);
          cellFilenames.add(cell.filename);
        }
      }
    } else {
      merged.we0s.push({ ...imp, cells: [...imp.cells] });
      we0Map.set(imp.name, merged.we0s[merged.we0s.length - 1]);
    }
  }

  return merged;
}