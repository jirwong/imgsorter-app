import '@tanstack/react-start/server-only';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import type { ThumbnailMap } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { thumbCacheDir, virtualToReal } from './db-path';
import { getEntryPathById } from './queries';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const THUMB_WIDTH = 256;

export type ThumbnailDeps = {
  cacheDir: string;
  getEntryPath: (id: number) => string | null;
  statFile: (path: string) => { size: number; mtimeMs: number } | null;
  resize: (path: string) => Promise<Buffer>;
  readCache: (file: string) => Buffer | null;
  writeCache: (file: string, data: Buffer) => void;
  readSetting: () => boolean;
  removeCacheFiles: () => number;
};

export type ThumbnailService = {
  getThumbnails: (ids: number[]) => Promise<ThumbnailMap>;
  clearCache: () => number;
};

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function cacheKey(path: string, size: number, mtimeMs: number): string {
  return createHash('sha256')
    .update(`${normalizeDirectoryPath(path).toLowerCase()}:${size}:${mtimeMs}`)
    .digest('hex');
}

function toDataUrl(data: Buffer): string {
  return `data:image/webp;base64,${data.toString('base64')}`;
}

export function createThumbnailService(deps: ThumbnailDeps): ThumbnailService {
  async function previewFor(id: number, enabled: boolean): Promise<[number, string] | null> {
    const stored = deps.getEntryPath(id);
    if (!stored) return null;
    const realPath = stored.startsWith('@fixtures') ? virtualToReal(stored) : stored;
    if (!isImagePath(realPath)) return null;
    const stat = deps.statFile(realPath);
    if (!stat) return null;
    const file = join(deps.cacheDir, `${cacheKey(realPath, stat.size, stat.mtimeMs)}.webp`);
    const cached = deps.readCache(file);
    if (cached) return [id, toDataUrl(cached)];
    if (!enabled) return null;
    try {
      const data = await deps.resize(realPath);
      deps.writeCache(file, data);
      return [id, toDataUrl(data)];
    } catch {
      return null;
    }
  }

  return {
    getThumbnails: async (ids) => {
      if (ids.length === 0) return {};
      const enabled = deps.readSetting();
      const entries = await Promise.all(ids.map((id) => previewFor(id, enabled)));
      const result: ThumbnailMap = {};
      for (const entry of entries) {
        if (entry) result[entry[0]] = entry[1];
      }
      return result;
    },
    clearCache: () => deps.removeCacheFiles(),
  };
}

function defaultDeps(): ThumbnailDeps {
  const cacheDir = thumbCacheDir();
  return {
    cacheDir,
    getEntryPath: (id) => getEntryPathById(id),
    statFile: (path) => {
      try {
        const stat = statSync(path);
        return { size: stat.size, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    },
    resize: async (path) => {
      const data = await sharp(path)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 75 })
        .toBuffer();
      return data;
    },
    readCache: (file) => {
      try {
        return readFileSync(file);
      } catch {
        return null;
      }
    },
    writeCache: (file, data) => {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(file, data);
      } catch {
        return;
      }
    },
    readSetting: () => appConfigStore.get().application.generatePreviews,
    removeCacheFiles: () => {
      if (!existsSync(cacheDir)) return 0;
      let removed = 0;
      for (const name of readdirSync(cacheDir)) {
        try {
          rmSync(join(cacheDir, name), { force: true });
          removed += 1;
        } catch {
          continue;
        }
      }
      return removed;
    },
  };
}

export const thumbnails = createThumbnailService(defaultDeps());
