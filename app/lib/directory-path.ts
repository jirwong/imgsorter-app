export function normalizeDirectoryPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}
