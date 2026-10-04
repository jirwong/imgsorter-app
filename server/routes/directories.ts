import { createServerFn } from '@tanstack/react-start';

export const getDirectoriesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getDirectoryIndex } = await import('../lib/directory-index');
  return { tree: getDirectoryIndex() };
});
