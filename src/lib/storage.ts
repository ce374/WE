import { AppData } from './types';
import { loadExistingPasswords } from './generators';

const STORAGE_KEY = 'we_data';

function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/;/g, '\\;')
    .replace(/[\r\n\t]/g, ' ');
}

function unesc(s: string): string {
  let r = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === '\\' || next === '|' || next === ';') {
        r += next;
        i += 2;
        continue;
      }
    }
    r += s[i];
    i++;
  }
  return r;
}

function encodeDest(d: { storageType: string; folderPath: string }): string {
  return `${esc(d.storageType)}:${esc(d.folderPath)}`;
}

function splitUnescaped(s: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && (s[i+1] === '\\' || s[i+1] === '|' || s[i+1] === ';')) {
      cur += s[i] + s[i+1];
      i += 2;
    } else if (s[i] === sep) {
      parts.push(cur);
      cur = '';
      i++;
    } else {
      cur += s[i];
      i++;
    }
  }
  parts.push(cur);
  return parts;
}

function decodeDest(s: string): { storageType: string; folderPath: string } {
  const idx = s.indexOf(':');
  if (idx === -1) return { storageType: unesc(s), folderPath: '' };
  return { storageType: unesc(s.substring(0, idx)), folderPath: unesc(s.substring(idx + 1)) };
}

export function dataToText(data: AppData): string {
  const lines: string[] = [];
  for (const w of data.we0s) {
    lines.push(`W|${esc(w.name)}|${esc(w.type)}`);
    for (const c of w.cells) {
      const dests = c.destinations.map(encodeDest).join(';');
      lines.push(`C|${esc(w.name)}|${esc(c.filename)}|${esc(c.password)}|${esc(c.description)}|${dests}`);
    }
  }
  return lines.join('\n');
}

export function textToData(text: string): AppData {
  const data: AppData = { we0s: [] };
  const we0Map = new Map<string, AppData['we0s'][number]>();
  const passwords: string[] = [];

  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw;
    if (!line.trim()) continue;

    const marker = line.substring(0, 2);
    if (marker !== 'W|' && marker !== 'C|') continue;

    // split on unescaped | only
    const parts: string[] = [];
    let cur = '';
    let j = 2; // skip marker
    while (j < line.length) {
      if (line[j] === '\\' && j + 1 < line.length && (line[j+1] === '\\' || line[j+1] === '|' || line[j+1] === ';')) {
        cur += line[j] + line[j+1];
        j += 2;
      } else if (line[j] === '|') {
        parts.push(cur);
        cur = '';
        j++;
      } else {
        cur += line[j];
        j++;
      }
    }
    parts.push(cur);

    if (marker === 'W|' && parts.length >= 2) {
      const name = unesc(parts[0]);
      const type = unesc(parts[1]);
      const we0 = { name, type, cells: [] };
      data.we0s.push(we0);
      we0Map.set(name, we0);
    } else if (marker === 'C|' && parts.length >= 2) {
      const parentName = unesc(parts[0]);
      const we0 = we0Map.get(parentName);
      if (we0) {
        const filename = unesc(parts[1] || '');
        const password = unesc(parts[2] || '');
        const description = unesc(parts[3] || '');
        const destStr = parts[4] || '';
        passwords.push(password);
        const destinations = destStr
          ? splitUnescaped(destStr, ';').map(decodeDest).filter(d => d.storageType)
          : [];
        we0.cells.push({ filename, password, description, destinations });
      }
    }
  }

  loadExistingPasswords(passwords);
  return data;
}

export function loadData(): AppData {
  if (typeof window === 'undefined') return { we0s: [] };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { we0s: [] };
  try {
    return textToData(raw);
  } catch {
    return { we0s: [] };
  }
}

export function saveData(data: AppData): void {
  if (typeof window === 'undefined') return;
  const text = dataToText(data);
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // storage full
  }
}
