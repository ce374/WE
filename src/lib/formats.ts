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
    for (const k of w.co2s) {
      lines.push('[K]');
      lines.push(`parent:${sanitizeForTxt(w.name)}`);
      lines.push(`co2:${sanitizeForTxt(k.name)}`);
      lines.push('');
      for (const c of k.cells) {
        lines.push('[C]');
        lines.push(`parent:${sanitizeForTxt(w.name)}`);
        lines.push(`co2:${sanitizeForTxt(k.name)}`);
        lines.push(`filename:${sanitizeForTxt(c.filename)}`);
        lines.push(`password:${sanitizeForTxt(c.password)}`);
        lines.push(`description:${sanitizeForTxt(c.description)}`);
        const dests = c.destinations.map(d => `${sanitizeForTxt(d.storageType)}:${sanitizeForTxt(d.folderPath)}`).join(';');
        lines.push(`destinations:${dests}`);
        lines.push('');
      }
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
      const we0: We0 = { name: fields.name, type: fields.type || 'others', co2s: [] };
      data.we0s.push(we0);
      we0Map.set(we0.name, we0);
    } else if (blockType === 'K' && fields.parent && fields.co2) {
      const we0 = we0Map.get(fields.parent);
      if (we0) {
        we0.co2s.push({ name: fields.co2, cells: [] });
      }
    } else if (blockType === 'C' && fields.parent && fields.co2) {
      const we0 = we0Map.get(fields.parent);
      if (we0) {
        const co2 = we0.co2s.find(c => c.name === fields.co2);
        if (co2) {
          const destStr = fields.destinations || '';
          const destinations = destStr
            ? destStr.split(';').map(decodeDest).filter(d => d.storageType)
            : [];
          co2.cells.push({
            filename: fields.filename || '',
            password: fields.password || '',
            description: fields.description || '',
            destinations,
          });
        }
      }
    }
    for (const k in fields) delete fields[k];
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '[W]') {
      processBlock();
      blockType = 'W';
    } else if (line === '[K]') {
      processBlock();
      blockType = 'K';
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

const CSV_HEADER = 'record_type,we0_name,co2_name,type,filename,password,description,destinations';

export function exportCSV(data: AppData): string {
  const rows: string[] = [CSV_HEADER];

  for (const w of data.we0s) {
    rows.push([
      csvEscape('W'),
      csvEscape(w.name),
      '',
      csvEscape(w.type),
      '', '', '', '',
    ].join(','));

    for (const k of w.co2s) {
      rows.push([
        csvEscape('K'),
        csvEscape(w.name),
        csvEscape(k.name),
        '', '', '', '', '',
      ].join(','));

      for (const c of k.cells) {
        const dests = c.destinations.map(d => `${d.storageType}:${d.folderPath}`).join(';');
        rows.push([
          csvEscape('C'),
          csvEscape(w.name),
          csvEscape(k.name),
          '',
          csvEscape(c.filename),
          csvEscape(c.password),
          csvEscape(c.description),
          csvEscape(dests),
        ].join(','));
      }
    }
  }

  return rows.join('\n') + '\n';
}

export function importCSV(text: string): AppData {
  const rows = parseCSV(text);
  const data: AppData = { we0s: [] };
  const we0Map = new Map<string, We0>();

  const header = rows[0] || [];
  const hasHeader = header.includes('record_type');

  let colRecordType = 0;
  let colWe0Name = 1;
  let colCo2Name = 2;
  let colType = 3;
  let colFilename = 4;
  let colPassword = 5;
  let colDescription = 6;
  let colDestinations = 7;

  if (hasHeader) {
    const h = header.map(x => String(x).trim());
    colRecordType = h.indexOf('record_type');
    colWe0Name = h.indexOf('we0_name');
    colCo2Name = h.indexOf('co2_name');
    colType = h.indexOf('type');
    colFilename = h.indexOf('filename');
    colPassword = h.indexOf('password');
    colDescription = h.indexOf('description');
    colDestinations = h.indexOf('destinations');
  }

  const startRow = hasHeader ? 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const recordType = String(row[colRecordType] || '');

    if (recordType === 'W') {
      const we0: We0 = {
        name: String(row[colWe0Name] || ''),
        type: String(row[colType] || 'others'),
        co2s: [],
      };
      data.we0s.push(we0);
      we0Map.set(we0.name, we0);
    } else if (recordType === 'K') {
      const we0 = we0Map.get(String(row[colWe0Name] || ''));
      if (we0) {
        const co2Name = String(row[colCo2Name] || '');
        if (co2Name) we0.co2s.push({ name: co2Name, cells: [] });
      }
    } else if (recordType === 'C') {
      const we0 = we0Map.get(String(row[colWe0Name] || ''));
      if (we0) {
        const co2Name = String(row[colCo2Name] || '');
        const co2 = we0.co2s.find(c => c.name === co2Name);
        if (co2) {
          const destStr = String(row[colDestinations] || '');
          const destinations = destStr
            ? destStr.split(';').map(decodeDest).filter(d => d.storageType)
            : [];
          co2.cells.push({
            filename: String(row[colFilename] || ''),
            password: String(row[colPassword] || ''),
            description: String(row[colDescription] || ''),
            destinations,
          });
        }
      }
    }
  }

  return data;
}

// --- XLSX Export/Import ---

const XLSX_HEADER = ['record_type', 'we0_name', 'co2_name', 'type', 'filename', 'password', 'description', 'destinations'];

export async function exportXLSX(data: AppData): Promise<Blob> {
  const XLSX = await import('xlsx');

  const rows: (string | number)[][] = [XLSX_HEADER];

  for (const w of data.we0s) {
    rows.push(['W', w.name, '', w.type, '', '', '', '']);
    for (const k of w.co2s) {
      rows.push(['K', w.name, k.name, '', '', '', '', '']);
      for (const c of k.cells) {
        const dests = c.destinations.map(d => `${d.storageType}:${d.folderPath}`).join(';');
        rows.push(['C', w.name, k.name, '', c.filename, c.password, c.description, dests]);
      }
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
  const h = header.map(x => String(x).trim());
  const hasHeader = h.includes('record_type');

  let colRecordType = 0;
  let colWe0Name = 1;
  let colCo2Name = 2;
  let colType = 3;
  let colFilename = 4;
  let colPassword = 5;
  let colDescription = 6;
  let colDestinations = 7;

  if (hasHeader) {
    colRecordType = h.indexOf('record_type');
    colWe0Name = h.indexOf('we0_name');
    colCo2Name = h.indexOf('co2_name');
    colType = h.indexOf('type');
    colFilename = h.indexOf('filename');
    colPassword = h.indexOf('password');
    colDescription = h.indexOf('description');
    colDestinations = h.indexOf('destinations');
  }

  const startRow = hasHeader ? 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const recordType = String(row[colRecordType] || '');

    if (recordType === 'W') {
      const we0: We0 = {
        name: String(row[colWe0Name] || ''),
        type: String(row[colType] || 'others'),
        co2s: [],
      };
      data.we0s.push(we0);
      we0Map.set(we0.name, we0);
    } else if (recordType === 'K') {
      const we0 = we0Map.get(String(row[colWe0Name] || ''));
      if (we0) {
        const co2Name = String(row[colCo2Name] || '');
        if (co2Name) we0.co2s.push({ name: co2Name, cells: [] });
      }
    } else if (recordType === 'C') {
      const we0 = we0Map.get(String(row[colWe0Name] || ''));
      if (we0) {
        const co2Name = String(row[colCo2Name] || '');
        const co2 = we0.co2s.find(c => c.name === co2Name);
        if (co2) {
          const destStr = String(row[colDestinations] || '');
          const destinations = destStr
            ? destStr.split(';').map(decodeDest).filter(d => d.storageType)
            : [];
          co2.cells.push({
            filename: String(row[colFilename] || ''),
            password: String(row[colPassword] || ''),
            description: String(row[colDescription] || ''),
            destinations,
          });
        }
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
      const co2Map = new Map<string, AppData['we0s'][number]['co2s'][number]>();
      for (const c of existingWe0.co2s) co2Map.set(c.name, c);

      for (const impCo2 of imp.co2s) {
        const existingCo2 = co2Map.get(impCo2.name);
        if (existingCo2) {
          const cellFilenames = new Set(existingCo2.cells.map(c => c.filename));
          for (const cell of impCo2.cells) {
            if (!cellFilenames.has(cell.filename)) {
              existingCo2.cells.push(cell);
              cellFilenames.add(cell.filename);
            }
          }
        } else {
          const newCo2 = { ...impCo2, cells: [...impCo2.cells] };
          existingWe0.co2s.push(newCo2);
          co2Map.set(newCo2.name, newCo2);
        }
      }
    } else {
      merged.we0s.push({ ...imp, co2s: imp.co2s.map(c => ({ ...c, cells: [...c.cells] })) });
      we0Map.set(imp.name, merged.we0s[merged.we0s.length - 1]);
    }
  }

  return merged;
}
