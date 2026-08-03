import { FILE_PREFIXES, FileExt } from './types';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIAL = '!@#$%^&*()-_=+[]{}|;:<>,.?/~`';
const ALL_CHARS = UPPER + LOWER + DIGITS + SPECIAL;
const ALL_LEN = ALL_CHARS.length;

const generatedPasswords = new Set<string>();

function secureRandomInt(max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateFilename(ext: FileExt): string {
  const prefix = FILE_PREFIXES[secureRandomInt(FILE_PREFIXES.length)];
  const numLen = secureRandomInt(2) + 3;
  let num = '';
  for (let i = 0; i < numLen; i++) {
    num += DIGITS[secureRandomInt(10)];
  }
  return `${prefix}${num}.${ext}`;
}

export function generatePassword(): string {
  const oddLengths = [17, 19, 21, 23, 25, 27, 29, 31];
  const length = oddLengths[secureRandomInt(oddLengths.length)];

  let password: string;
  let attempts = 0;

  do {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);

    const chars: string[] = [];
    for (let i = 0; i < length; i++) {
      chars.push(ALL_CHARS[bytes[i] % ALL_LEN]);
    }

    const positions = shuffleArray([0, 1, 2, 3]);
    chars[positions[0]] = UPPER[secureRandomInt(UPPER.length)];
    chars[positions[1]] = LOWER[secureRandomInt(LOWER.length)];
    chars[positions[2]] = DIGITS[secureRandomInt(DIGITS.length)];
    chars[positions[3]] = SPECIAL[secureRandomInt(SPECIAL.length)];

    password = chars.join('');
    attempts++;
  } while (generatedPasswords.has(password) && attempts < 100);

  generatedPasswords.add(password);
  return password;
}

export function loadExistingPasswords(passwords: string[]): void {
  for (const p of passwords) {
    generatedPasswords.add(p);
  }
}
