import { describe, expect, it, vi } from 'vitest';
import { createHiddenService } from './hidden';

function makeDeps(initial: string[] = []) {
  let hidden = [...initial];
  return {
    getHidden: vi.fn(() => hidden),
    setHidden: vi.fn((paths: string[]) => {
      hidden = paths;
      return hidden;
    }),
  };
}

describe('createHiddenService', () => {
  it('returns the stored hidden paths', () => {
    const deps = makeDeps(['C:/Media/A.jpg']);
    expect(createHiddenService(deps).get()).toEqual(['C:/Media/A.jpg']);
  });

  it('adds a path when hiding', () => {
    const deps = makeDeps(['C:/Media/A.jpg']);
    expect(createHiddenService(deps).hide('C:/Media/B.jpg')).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
  });

  it('removes a path when unhiding, regardless of separator or case', () => {
    const deps = makeDeps(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
    expect(createHiddenService(deps).unhide('c:\\media\\a.jpg')).toEqual(['C:/Media/B.jpg']);
  });

  it('clears all hidden paths', () => {
    const deps = makeDeps(['C:/Media/A.jpg']);
    expect(createHiddenService(deps).clear()).toEqual([]);
  });
});
