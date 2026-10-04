import { describe, expect, it, vi } from 'vitest';
import { createThumbnailService, type ThumbnailDeps } from './thumbnails';

function makeDeps(overrides: Partial<ThumbnailDeps> = {}) {
  const written: string[] = [];
  const resize = vi.fn(async () => Buffer.from('img'));
  const deps: ThumbnailDeps = {
    cacheDir: 'C:/cache',
    getEntryPath: () => 'C:/Media/a.jpg',
    statFile: () => ({ size: 100, mtimeMs: 1000 }),
    resize,
    readCache: () => null,
    writeCache: (file) => {
      written.push(file);
    },
    readSetting: () => true,
    removeCacheFiles: () => 0,
    ...overrides,
  };
  return { deps, resize, written };
}

const dataUrl = (data: string): string => `data:image/webp;base64,${Buffer.from(data).toString('base64')}`;

describe('createThumbnailService', () => {
  it('returns a cached preview without resizing', async () => {
    const { deps, resize } = makeDeps({ readCache: () => Buffer.from('cached') });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({ 1: dataUrl('cached') });
    expect(resize).not.toHaveBeenCalled();
  });

  it('generates and caches a preview when enabled', async () => {
    const { deps, resize, written } = makeDeps();
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({ 1: dataUrl('img') });
    expect(resize).toHaveBeenCalledWith('C:/Media/a.jpg');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/\.webp$/);
  });

  it('returns nothing when disabled and not cached', async () => {
    const { deps, resize } = makeDeps({ readSetting: () => false });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({});
    expect(resize).not.toHaveBeenCalled();
  });

  it('serves a cached preview when disabled', async () => {
    const { deps } = makeDeps({ readSetting: () => false, readCache: () => Buffer.from('cached') });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({ 1: dataUrl('cached') });
  });

  it('skips non-image files', async () => {
    const { deps, resize } = makeDeps({ getEntryPath: () => 'C:/Media/clip.mp4' });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({});
    expect(resize).not.toHaveBeenCalled();
  });

  it('skips unknown ids and missing files', async () => {
    const unknown = createThumbnailService(makeDeps({ getEntryPath: () => null }).deps);
    expect(await unknown.getThumbnails([1])).toEqual({});
    const missing = createThumbnailService(makeDeps({ statFile: () => null }).deps);
    expect(await missing.getThumbnails([1])).toEqual({});
  });

  it('skips a file that fails to resize', async () => {
    const resize = vi.fn(async () => {
      throw new Error('bad image');
    });
    const { deps } = makeDeps({ resize });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({});
  });

  it('clears the cache', () => {
    const service = createThumbnailService(makeDeps({ removeCacheFiles: () => 3 }).deps);
    expect(service.clearCache()).toBe(3);
  });
});
