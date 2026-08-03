export type We0PresetType = 'person' | 'random' | 'others' | 'custom';
export type FileExt = '7z' | 'zip';

export const WE0_TYPES: We0PresetType[] = ['person', 'random', 'others', 'custom'];
export const STORAGE_TYPES = ['sd card', 'drive', 'custom'] as const;
export const FILE_EXTS: FileExt[] = ['7z', 'zip'];
export const FILE_PREFIXES = ['zw', 'zq', 'zx', 'zy'] as const;

export interface Destination {
  storageType: string;
  folderPath: string;
}

export interface Cell {
  filename: string;
  password: string;
  description: string;
  destinations: Destination[];
}

export interface We0 {
  name: string;
  type: string;
  cells: Cell[];
}

export interface AppData {
  we0s: We0[];
}

export type ViewType = 'main' | 'create' | 'detail' | 'add' | 'edit';
