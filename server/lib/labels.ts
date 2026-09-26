export const ROOT_LABELS = [
  { prefix: '@fixtures/Media/2025', label: 'C:/Media/2025' },
  { prefix: '@fixtures/Media/2024', label: 'C:/Media/2024' },
  { prefix: '@fixtures/Camera Imports', label: 'D:/Camera Imports' },
] as const;

export function mapPathToDisplay(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  for (const { prefix, label } of ROOT_LABELS) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return label + normalized.slice(prefix.length);
    }
  }
  return normalized;
}

export function rootLabelOf(mappedPath: string): string {
  const lower = mappedPath.toLowerCase();
  for (const { label } of ROOT_LABELS) {
    if (lower.startsWith(label.toLowerCase())) return label;
  }
  const first = mappedPath.split('/')[0] ?? mappedPath;
  return first;
}
