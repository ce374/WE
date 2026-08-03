'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AppData, We0, Co2, Destination, We0PresetType, FileExt, ViewType } from '@/lib/types';
import { WE0_TYPES, CO2_PRESETS, FILE_EXTS } from '@/lib/types';
import { generateFilename, generatePassword, loadExistingPasswords } from '@/lib/generators';
import { loadData, saveData } from '@/lib/storage';
import { exportTXT, importTXT, exportCSV, importCSV, exportXLSX, importXLSX, detectFormat, downloadFile, mergeData } from '@/lib/formats';

const STORAGE_SUGGESTIONS = ['sd card', 'drive', 'usb', 'nas', 'cloud', 'external'];
const FLASH_CONFIRM_TEXT = 'flash everything';

export default function Home() {
  // === STATE ===
  const [data, setData] = useState<AppData>({ we0s: [] });
  const initRef = useRef(false);
  const [view, setView] = useState<ViewType>('main');
  const [selWe0, setSelWe0] = useState('');
  const [selCo2, setSelCo2] = useState('');
  const [editIdx, setEditIdx] = useState(-1);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState('');
  const [revealedPw, setRevealedPw] = useState<Set<string>>(new Set());

  // flash
  const [flashOpen, setFlashOpen] = useState(false);
  const [flashInput, setFlashInput] = useState('');

  // create we0 form
  const [cName, setCName] = useState('');
  const [cType, setCType] = useState<We0PresetType>('person');
  const [cCustom, setCCustom] = useState('');

  // create co2 form
  const [kName, setKName] = useState('');

  // entry form
  const [fFn, setFFn] = useState('');
  const [fExt, setFExt] = useState<FileExt>('7z');
  const [fPw, setFPw] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fDests, setFDests] = useState<Destination[]>([{ storageType: 'sd card', folderPath: '' }]);
  const [fShowPw, setFShowPw] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashRef = useRef<HTMLInputElement>(null);

  // === EFFECTS ===
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const d = loadData();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(d);
    loadExistingPasswords(d.we0s.flatMap(w => w.co2s.flatMap(k => k.cells.map(c => c.password))));
  }, []);

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (flashOpen && flashRef.current) flashRef.current.focus();
  }, [flashOpen]);

  // === HELPERS ===
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const goBack = useCallback(() => {
    if (view === 'create') setView('main');
    else if (view === 'detail') setView('main');
    else if (view === 'co2-create') setView('detail');
    else if (view === 'co2-detail') setView('detail');
    else if (view === 'add' || view === 'edit') setView('co2-detail');
    setConfirmDel('');
  }, [view]);

  // === COMPUTED ===
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, We0[]> = {};
    for (const w of data.we0s) {
      if (!map[w.type]) { map[w.type] = []; order.push(w.type); }
      map[w.type].push(w);
    }
    return { order, map };
  }, [data]);

  const curWe0 = useMemo(() => data.we0s.find(w => w.name === selWe0), [data, selWe0]);
  const curCo2 = useMemo(() => curWe0?.co2s.find(c => c.name === selCo2), [curWe0, selCo2]);

  // === WE0 HANDLERS ===
  const openWe0 = (name: string) => { setSelWe0(name); setView('detail'); setConfirmDel(''); };

  const goCreate = () => { setCName(''); setCType('person'); setCCustom(''); setView('create'); };

  const createWe0 = () => {
    const name = cName.trim();
    if (!name) { showToast('enter a name'); return; }
    if (data.we0s.some(w => w.name === name)) { showToast('name exists'); return; }
    const type = cType === 'custom' ? cCustom.trim() : cType;
    if (!type) { showToast('enter type name'); return; }
    setData(prev => ({ we0s: [...prev.we0s, { name, type, co2s: [] }] }));
    showToast('created');
    goBack();
  };

  const deleteWe0 = () => {
    setData(prev => ({ we0s: prev.we0s.filter(w => w.name !== selWe0) }));
    showToast('deleted');
    setView('main'); setConfirmDel('');
  };

  // === CO2 HANDLERS ===
  const openCo2 = (name: string) => { setSelCo2(name); setView('co2-detail'); setConfirmDel(''); };

  const goCreateCo2 = () => { setKName(''); setView('co2-create'); };

  const createCo2Preset = (name: string) => {
    if (!curWe0) return;
    if (curWe0.co2s.some(k => k.name === name)) { showToast('name exists'); return; }
    setData(prev => ({
      we0s: prev.we0s.map(w => {
        if (w.name !== selWe0) return w;
        return { ...w, co2s: [...w.co2s, { name, cells: [] }] };
      })
    }));
    showToast('created');
  };

  const createCo2 = () => {
    const name = kName.trim();
    if (!name) { showToast('enter a name'); return; }
    createCo2Preset(name);
    goBack();
  };

  const deleteCo2 = () => {
    setData(prev => ({
      we0s: prev.we0s.map(w => {
        if (w.name !== selWe0) return w;
        return { ...w, co2s: w.co2s.filter(k => k.name !== selCo2) };
      })
    }));
    showToast('deleted');
    setView('detail'); setConfirmDel('');
  };

  // === CELL HANDLERS ===
  const goAdd = () => {
    setFFn(generateFilename('7z'));
    setFExt('7z');
    setFPw(generatePassword());
    setFDesc('');
    setFDests([{ storageType: 'sd card', folderPath: '' }]);
    setFShowPw(false);
    setEditIdx(-1);
    setView('add');
  };

  const goEdit = (idx: number) => {
    const cell = curCo2?.cells[idx];
    if (!cell) return;
    setFFn(cell.filename);
    setFExt(cell.filename.endsWith('.zip') ? 'zip' : '7z');
    setFPw(cell.password);
    setFDesc(cell.description);
    setFDests(cell.destinations.length > 0 ? cell.destinations.map(d => ({ ...d })) : [{ storageType: 'sd card', folderPath: '' }]);
    setFShowPw(false);
    setEditIdx(idx);
    setView('edit');
  };

  const saveEntry = () => {
    if (!fFn.trim()) { showToast('generate a filename'); return; }
    const dests = fDests.filter(d => d.storageType.trim() || d.folderPath.trim());
    const cell = {
      filename: fFn.trim(),
      password: fPw,
      description: fDesc.trim(),
      destinations: dests,
    };

    setData(prev => ({
      we0s: prev.we0s.map(w => {
        if (w.name !== selWe0) return w;
        return {
          ...w,
          co2s: w.co2s.map(k => {
            if (k.name !== selCo2) return k;
            const cells = [...k.cells];
            if (editIdx >= 0) cells[editIdx] = cell;
            else cells.push(cell);
            return { ...k, cells };
          })
        };
      })
    }));
    showToast(editIdx >= 0 ? 'updated' : 'added');
    setView('co2-detail');
  };

  const deleteCell = (idx: number) => {
    setData(prev => ({
      we0s: prev.we0s.map(w => {
        if (w.name !== selWe0) return w;
        return {
          ...w,
          co2s: w.co2s.map(k => {
            if (k.name !== selCo2) return k;
            return { ...k, cells: k.cells.filter((_, i) => i !== idx) };
          })
        };
      })
    }));
    showToast('deleted');
    setConfirmDel('');
  };

  const toggleReveal = (fn: string) => {
    setRevealedPw(prev => {
      const next = new Set(prev);
      if (next.has(fn)) next.delete(fn); else next.add(fn);
      return next;
    });
  };

  const copyPw = (pw: string) => { navigator.clipboard.writeText(pw).then(() => showToast('copied')); };

  const genFn = () => { setFFn(generateFilename(fExt)); };
  const genPw = () => { setFPw(generatePassword()); setFShowPw(false); };

  const addDest = () => { if (fDests.length >= 4) return; setFDests(prev => [...prev, { storageType: 'sd card', folderPath: '' }]); };
  const removeDest = (i: number) => { setFDests(prev => prev.filter((_, idx) => idx !== i)); };
  const updateDest = (i: number, key: keyof Destination, val: string) => { setFDests(prev => prev.map((d, idx) => idx === i ? { ...d, [key]: val } : d)); };

  // === FLASH ===
  const openFlash = () => { setFlashOpen(true); setFlashInput(''); };
  const cancelFlash = () => { setFlashOpen(false); setFlashInput(''); };
  const executeFlash = () => {
    if (flashInput.trim().toLowerCase() !== FLASH_CONFIRM_TEXT) { showToast('type exactly: ' + FLASH_CONFIRM_TEXT); return; }
    setData({ we0s: [] });
    setFlashOpen(false); setFlashInput('');
    setView('main');
    showToast('everything flashed');
  };

  // === EXPORT / IMPORT ===
  const doExportTXT = () => {
    if (!data.we0s.length) { showToast('nothing to export'); return; }
    const d = new Date().toISOString().slice(0, 10);
    downloadFile(exportTXT(data), `we_${d}.txt`);
    showToast('exported txt');
  };

  const doExportCSV = () => {
    if (!data.we0s.length) { showToast('nothing to export'); return; }
    const d = new Date().toISOString().slice(0, 10);
    downloadFile(exportCSV(data), `we_${d}.csv`);
    showToast('exported csv');
  };

  const doExportXLSX = async () => {
    if (!data.we0s.length) { showToast('nothing to export'); return; }
    try {
      const blob = await exportXLSX(data);
      const d = new Date().toISOString().slice(0, 10);
      downloadFile(blob, `we_${d}.xlsx`);
      showToast('exported xlsx');
    } catch { showToast('export failed'); }
  };

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const fmt = detectFormat(file.name, text);
      let imported: AppData;
      if (fmt === 'xlsx') {
        const buf = await file.arrayBuffer();
        imported = await importXLSX(buf);
      } else {
        imported = fmt === 'csv' ? importCSV(text) : importTXT(text);
      }
      const before = data.we0s.reduce((a, w) => a + w.co2s.reduce((b, k) => b + k.cells.length, 0), 0);
      const merged = mergeData(data, imported);
      const after = merged.we0s.reduce((a, w) => a + w.co2s.reduce((b, k) => b + k.cells.length, 0), 0);
      setData(merged);
      showToast(`imported: +${after - before} entries`);
    } catch { showToast('import failed'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  // === RENDER ===
  let content: React.ReactNode;

  if (view === 'create') {
    content = (
      <div className="max-w-[640px] mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button className="z-link" onClick={goBack}>[&lt;]</button>
          <span className="text-sm font-medium">create we0</span>
        </div>
        <hr className="z-divider" />
        <div className="mt-4 space-y-4">
          <div>
            <div className="z-label">name</div>
            <input className="z-input" value={cName} onChange={e => setCName(e.target.value)} placeholder="my archive" autoFocus onKeyDown={e => e.key === 'Enter' && createWe0()} />
          </div>
          <div>
            <div className="z-label">type</div>
            <div className="flex gap-2 flex-wrap">
              {WE0_TYPES.map(t => (
                <button key={t} className={`z-btn z-btn-sm ${cType === t ? '' : 'z-btn-ghost'}`} onClick={() => setCType(t)}>[{t}]</button>
              ))}
            </div>
            {cType === 'custom' && (
              <input className="z-input mt-2" placeholder="type name" value={cCustom} onChange={e => setCCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && createWe0()} />
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button className="z-btn" onClick={createWe0}>[create]</button>
            <button className="z-btn z-btn-ghost" onClick={goBack}>[cancel]</button>
          </div>
        </div>
      </div>
    );
  } else if (view === 'co2-create') {
    content = (
      <div className="max-w-[640px] mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button className="z-link" onClick={goBack}>[&lt;]</button>
          <span className="text-sm font-medium">create co2</span>
        </div>
        <hr className="z-divider" />
        <div className="mt-4 space-y-4">
          <div>
            <div className="z-label">quick create</div>
            <div className="flex gap-2 flex-wrap">
              {CO2_PRESETS.map(p => (
                <button key={p} className="z-btn z-btn-sm" onClick={() => createCo2Preset(p)}>[{p}]</button>
              ))}
            </div>
          </div>
          <div>
            <div className="z-label">or enter name</div>
            <div className="flex gap-2">
              <input className="z-input flex-1 min-w-0" value={kName} onChange={e => setKName(e.target.value)} placeholder="custom category name" autoFocus onKeyDown={e => e.key === 'Enter' && createCo2()} />
              <button className="z-btn z-btn-sm" onClick={createCo2}>[create]</button>
            </div>
          </div>
        </div>
      </div>
    );
  } else if ((view === 'add' || view === 'edit') && curCo2) {
    content = (
      <div className="max-w-[640px] mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button className="z-link" onClick={goBack}>[&lt;]</button>
          <span className="text-sm font-medium">{view === 'add' ? 'add entry' : 'edit entry'}</span>
        </div>
        <hr className="z-divider" />
        <div className="mt-4 space-y-4">
          <div>
            <div className="z-label">file name</div>
            <div className="flex gap-2 items-center flex-wrap">
              <input className="z-input flex-1 min-w-0" value={fFn} onChange={e => setFFn(e.target.value)} placeholder="filename" />
              <select className="z-select" value={fExt} onChange={e => setFExt(e.target.value as FileExt)}>
                {FILE_EXTS.map(ext => <option key={ext} value={ext}>{ext}</option>)}
              </select>
              <button className="z-btn z-btn-sm" onClick={genFn}>[gen]</button>
            </div>
          </div>
          <div>
            <div className="z-label">password ({fPw.length} chars)</div>
            <div className="flex gap-2 items-center flex-wrap">
              <input className="z-input flex-1 min-w-0 font-mono text-xs" type={fShowPw ? 'text' : 'password'} value={fPw} onChange={e => setFPw(e.target.value)} />
              <button className="z-btn z-btn-sm" onClick={genPw}>[gen]</button>
              <button className="z-btn z-btn-sm" onClick={() => copyPw(fPw)}>[copy]</button>
              <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => setFShowPw(v => !v)}>[{fShowPw ? 'hide' : 'show'}]</button>
            </div>
          </div>
          <div>
            <div className="z-label">description</div>
            <textarea className="z-input resize-y" rows={2} value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="what is in the archive" />
          </div>
          <div>
            <div className="z-label">destinations ({fDests.length}/4)</div>
            <div className="space-y-2">
              {fDests.map((d, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input list="storage-suggest" className="z-input shrink-0" style={{ width: '7rem' }} value={d.storageType} onChange={e => updateDest(i, 'storageType', e.target.value)} placeholder="type" />
                  <input className="z-input flex-1 min-w-0" value={d.folderPath} onChange={e => updateDest(i, 'folderPath', e.target.value)} placeholder="folder/path" />
                  {fDests.length > 1 && (
                    <button className="z-btn z-btn-sm z-btn-danger" onClick={() => removeDest(i)}>[-]</button>
                  )}
                </div>
              ))}
            </div>
            {fDests.length < 4 && (
              <button className="z-btn z-btn-sm z-btn-ghost mt-2" onClick={addDest}>[+dest]</button>
            )}
            <datalist id="storage-suggest">
              {STORAGE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="z-btn" onClick={saveEntry}>[save]</button>
            <button className="z-btn z-btn-ghost" onClick={goBack}>[cancel]</button>
          </div>
        </div>
      </div>
    );
  } else if (view === 'co2-detail' && curCo2) {
    content = (
      <div className="max-w-[640px] mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <button className="z-link shrink-0" onClick={goBack}>[&lt;]</button>
            <span className="text-sm font-medium truncate">{curWe0?.name}</span>
            <span style={{ color: 'var(--muted-foreground)' }}>/</span>
            <span className="text-sm font-medium truncate">{curCo2.name}</span>
          </div>
          <div className="flex gap-2 shrink-0">
            {confirmDel === 'co2' ? (
              <>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>delete?</span>
                <button className="z-btn z-btn-sm z-btn-danger" onClick={deleteCo2}>[yes]</button>
                <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => setConfirmDel('')}>[no]</button>
              </>
            ) : (
              <button className="z-btn z-btn-sm z-btn-danger" onClick={() => setConfirmDel('co2')}>[del]</button>
            )}
          </div>
        </div>
        <hr className="z-divider" />
        <div className="flex gap-2 mt-4 mb-4">
          <button className="z-btn z-btn-sm" onClick={goAdd}>[+add]</button>
        </div>
        {curCo2.cells.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>no entries</div>
        ) : (
          <div className="space-y-3 z-scroll" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            {curCo2.cells.map((cell, idx) => {
              const revealed = revealedPw.has(cell.filename);
              return (
                <div key={cell.filename + idx} className="p-3" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-mono">
                    <span className="font-medium">{cell.filename}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>|</span>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>[{cell.password.length} chars]</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>|</span>
                    <span className="text-xs flex-1 min-w-0" style={{ wordBreak: 'break-word' }}>{cell.description || '---'}</span>
                  </div>
                  {revealed && (
                    <div className="font-mono text-xs mt-1 p-1 select-all" style={{ background: 'var(--muted)', wordBreak: 'break-all' }}>
                      {cell.password}
                    </div>
                  )}
                  {cell.destinations.length > 0 && (
                    <div className="mt-1 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--muted-foreground)' }}>
                      {cell.destinations.map((d, di) => (
                        <span key={di}>[{d.storageType}] {d.folderPath || '---'}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => toggleReveal(cell.filename)}>[{revealed ? 'hide' : 'show'}]</button>
                    <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => copyPw(cell.password)}>[copy pw]</button>
                    <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => goEdit(idx)}>[edit]</button>
                    {confirmDel === `cell-${idx}` ? (
                      <>
                        <button className="z-btn z-btn-sm z-btn-danger" onClick={() => deleteCell(idx)}>[yes]</button>
                        <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => setConfirmDel('')}>[no]</button>
                      </>
                    ) : (
                      <button className="z-btn z-btn-sm z-btn-danger" onClick={() => setConfirmDel(`cell-${idx}`)}>[del]</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (view === 'detail' && curWe0) {
    const totalCells = curWe0.co2s.reduce((a, k) => a + k.cells.length, 0);
    content = (
      <div className="max-w-[640px] mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <button className="z-link shrink-0" onClick={goBack}>[&lt;]</button>
            <span className="text-sm font-medium truncate">{curWe0.name}</span>
            <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>:: {curWe0.type} ({totalCells})</span>
          </div>
          <div className="flex gap-2 shrink-0">
            {confirmDel === 'we0' ? (
              <>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>delete?</span>
                <button className="z-btn z-btn-sm z-btn-danger" onClick={deleteWe0}>[yes]</button>
                <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => setConfirmDel('')}>[no]</button>
              </>
            ) : (
              <button className="z-btn z-btn-sm z-btn-danger" onClick={() => setConfirmDel('we0')}>[del]</button>
            )}
          </div>
        </div>
        <hr className="z-divider" />
        <div className="flex gap-2 mt-4 mb-4">
          <button className="z-btn z-btn-sm" onClick={goCreateCo2}>[+create co2]</button>
        </div>
        {curWe0.co2s.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>no co2s yet</div>
        ) : (
          <div className="mt-2 space-y-1 z-scroll" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            {curWe0.co2s.map(co2 => (
              <div key={co2.name} className="z-link text-sm py-1 cursor-pointer flex items-center justify-between" onClick={() => openCo2(co2.name)}>
                <span>[/] {co2.name} ({co2.cells.length})</span>
                {confirmDel === `co2-${co2.name}` ? (
                  <span className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button className="z-btn z-btn-sm z-btn-danger" onClick={() => { setSelCo2(co2.name); deleteCo2(); }}>[yes]</button>
                    <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => setConfirmDel('')}>[no]</button>
                  </span>
                ) : (
                  <button className="z-btn z-btn-sm z-btn-danger" onClick={e => { e.stopPropagation(); setConfirmDel(`co2-${co2.name}`); }}>[del]</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else {
    // MAIN VIEW
    content = (
      <div className="max-w-[640px] mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 gap-2">
          <span className="text-lg font-bold tracking-wider">we</span>
          <div className="flex gap-2 flex-wrap justify-end">
            <button className="z-btn z-btn-sm" onClick={doExportTXT}>[txt]</button>
            <button className="z-btn z-btn-sm" onClick={doExportCSV}>[csv]</button>
            <button className="z-btn z-btn-sm" onClick={doExportXLSX}>[xlsx]</button>
            <button className="z-btn z-btn-sm z-btn-ghost" onClick={() => fileRef.current?.click()}>[import]</button>
            <input ref={fileRef} type="file" className="hidden" accept=".txt,.csv,.xlsx" onChange={doImport} />
          </div>
        </div>
        <hr className="z-divider" />

        {flashOpen ? (
          <div className="mt-4 p-3" style={{ border: '1px solid #c33' }}>
            <div className="z-label" style={{ color: '#c33' }}>/flash/</div>
            <div className="text-xs mt-1 mb-2" style={{ color: 'var(--muted-foreground)' }}>
              this will permanently delete all we0s and entries.
              type <span className="font-mono" style={{ color: '#c33' }}>&quot;{FLASH_CONFIRM_TEXT}&quot;</span> to confirm.
            </div>
            <div className="flex gap-2 items-center">
              <input ref={flashRef} className="z-input flex-1 min-w-0" value={flashInput} onChange={e => setFlashInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') executeFlash(); if (e.key === 'Escape') cancelFlash(); }} placeholder={FLASH_CONFIRM_TEXT} />
              <button className="z-btn z-btn-sm z-btn-danger" onClick={executeFlash} disabled={flashInput.trim().toLowerCase() !== FLASH_CONFIRM_TEXT} style={{ opacity: flashInput.trim().toLowerCase() === FLASH_CONFIRM_TEXT ? 1 : 0.4 }}>[flash]</button>
              <button className="z-btn z-btn-sm z-btn-ghost" onClick={cancelFlash}>[cancel]</button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button className="z-btn z-btn-sm z-btn-danger" onClick={openFlash}>[flash]</button>
          </div>
        )}

        <div className="mt-4">
          <button className="z-btn z-btn-sm" onClick={goCreate}>[+create we0]</button>
        </div>
        {grouped.order.length === 0 ? (
          <div className="mt-6 text-xs" style={{ color: 'var(--muted-foreground)' }}>no we0s yet</div>
        ) : (
          <div className="mt-4 space-y-4 z-scroll" style={{ maxHeight: 'calc(100vh - 240px)' }}>
            {grouped.order.map(type => (
              <div key={type}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>/{type}/</div>
                {grouped.map[type].map(we0 => {
                  const total = we0.co2s.reduce((a, k) => a + k.cells.length, 0);
                  return (
                    <div key={we0.name} className="z-link text-sm py-1 cursor-pointer" onClick={() => openWe0(we0.name)}>
                      [/] {we0.name} ({total})
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <>{content}{toast && <div className="z-toast">{toast}</div>}</>;
}
