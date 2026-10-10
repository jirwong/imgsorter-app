export function normalizeDirectoryPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

export function normalizeDirectoryKey(value: string): string {
  return normalizeDirectoryPath(value).toLowerCase();
}
