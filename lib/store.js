import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const DATA_DIR = join(homedir(), '.timer');
const DATA_FILE = join(DATA_DIR, 'data.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function defaultData() {
  return { current: null, sessions: [] };
}

export function load() {
  ensureDir();
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const data = defaultData();
    save(data);
    return data;
  }
}

export function save(data) {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function genId(name) {
  const hash = createHash('sha256');
  hash.update(name + Date.now() + Math.random());
  return hash.digest('hex').slice(0, 12);
}

export function nowISO() {
  return new Date().toISOString();
}

export function msElapsed(startISO, endISO) {
  return new Date(endISO).getTime() - new Date(startISO).getTime();
}