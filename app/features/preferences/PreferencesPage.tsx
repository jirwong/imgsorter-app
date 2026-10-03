import { useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, Group, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { DEFAULT_APP_CONFIG } from '../../lib/app-config-defaults';
import { normalizeDirectoryPath } from '../../lib/directory-path';
import { saveApplicationSettings, saveDirectories } from '../../../server/routes/preferences';
import { pickDirectory } from '../../../server/routes/native';
import type { AppConfig, ApplicationConfig, IndexedDirectory } from '../../lib/types';

function metaKey(path: string): string {
  return normalizeDirectoryPath(path).toLowerCase();
}

function formatScanTime(iso: string | undefined): string {
  if (!iso) return 'Not scanned yet';
  return `Last scan ${new Date(iso).toLocaleString()}`;
}

export function PreferencesPage({ config, counts }: { config: AppConfig; counts: Record<string, number> }) {
  const router = useRouter();
  const [indexed, setIndexed] = useState<IndexedDirectory[]>(config.directories.indexed);
  const [ignored, setIgnored] = useState<string[]>(config.directories.ignored);
  const [indexedPath, setIndexedPath] = useState('');
  const [ignoredPath, setIgnoredPath] = useState('');
  const [message, setMessage] = useState('');
  const [application, setApplication] = useState<ApplicationConfig>(config.application);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('application');
  const [browsing, setBrowsing] = useState<'indexed' | 'ignored' | null>(null);

  const activeCount = useMemo(() => indexed.filter((item) => item.enabled).length, [indexed]);

  const persistDirectories = async (nextIndexed: IndexedDirectory[], nextIgnored: string[]): Promise<void> => {
    const result = await saveDirectories({ data: { indexed: nextIndexed, ignored: nextIgnored } });
    setIndexed(result.directories.indexed);
    setIgnored(result.directories.ignored);
    await router.invalidate();
  };

  const addIndexed = () => {
    const path = indexedPath.trim();
    if (!path) {
      setMessage('Enter an indexed directory path first.');
      return;
    }
    if (indexed.some((item) => item.path === path) || ignored.includes(path)) {
      setMessage('That directory is already configured.');
      return;
    }
    setMessage('');
    setIndexedPath('');
    void persistDirectories([...indexed, { path, enabled: true }], ignored);
  };

  const addIgnored = () => {
    const path = ignoredPath.trim();
    if (!path) {
      setMessage('Enter an ignored directory path first.');
      return;
    }
    if (indexed.some((item) => item.path === path) || ignored.includes(path)) {
      setMessage('That directory is already configured.');
      return;
    }
    setMessage('');
    setIgnoredPath('');
    void persistDirectories(indexed, [...ignored, path]);
  };

  const resetDefaults = () => {
    setApplication(DEFAULT_APP_CONFIG.application);
    setSaved(false);
  };

  const browse = async (target: 'indexed' | 'ignored'): Promise<void> => {
    setBrowsing(target);
    try {
      const result = await pickDirectory();
      if (result.status === 'picked') {
        if (target === 'indexed') setIndexedPath(result.path);
        else setIgnoredPath(result.path);
        return;
      }
      if (result.status === 'canceled') return;
      const pickerMessage =
        result.status === 'busy'
          ? 'A folder dialog is already open.'
          : result.status === 'timeout'
            ? 'The folder dialog timed out.'
            : result.status === 'unsupported'
              ? 'The folder picker is not available.'
              : 'The folder picker failed.';
      notifications.show({ color: 'red', message: pickerMessage });
    } finally {
      setBrowsing(null);
    }
  };

  const saveApplication = async (): Promise<void> => {
    const result = await saveApplicationSettings({ data: application });
    setApplication(result.application);
    setSaved(true);
    await router.invalidate();
  };

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Preferences"
        subtitle="Explore preferences across your indexed media library."
      />
      <div className="preferences-page">
        <div className="preferences-intro">
          <div>
            <Text className="eyebrow">PREFERENCES</Text>
            <h2>Library indexing</h2>
            <Text c="dimmed" size="sm">
              Configure application behavior and directory scope.
            </Text>
          </div>
        </div>
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value ?? 'application')} className="preferences-tabs">
          <Tabs.List>
            <Tabs.Tab value="application">Application configuration</Tabs.Tab>
            <Tabs.Tab value="directories">Directories</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {activeTab === 'directories' && (
          <>
            <Card className="directories-panel">
              <Group justify="space-between" mb="md">
                <div>
                  <Text className="eyebrow">INDEXED DIRECTORIES</Text>
                  <h3>Directories included in scans</h3>
                </div>
                <Badge color="cyan">{activeCount} active</Badge>
              </Group>
              <Group align="flex-end" mb="md">
                <TextInput
                  className="directory-add-input"
                  label="Add indexed directory"
                  placeholder="C:/Media/Projects"
                  value={indexedPath}
                  onChange={(event) => setIndexedPath(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addIndexed();
                  }}
                />
                <Button
                  variant="default"
                  loading={browsing === 'indexed'}
                  disabled={browsing !== null}
                  aria-label="Browse for indexed directory"
                  onClick={() => void browse('indexed')}
                >
                  Browse…
                </Button>
                <Button onClick={addIndexed}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {indexed.map((item) => (
                  <div className="preference-row" key={item.path}>
                    <Checkbox
                      checked={item.enabled}
                      onChange={() =>
                        void persistDirectories(
                          indexed.map((current) =>
                            current.path === item.path ? { ...current, enabled: !current.enabled } : current,
                          ),
                          ignored,
                        )
                      }
                      aria-label={`Enable ${item.path}`}
                    />
                    <FolderOpen size={16} />
                    <div className="preference-path">
                      <Text size="sm">{item.path}</Text>
                      <Text size="xs" c="dimmed">
                        {counts[item.path] ?? 0} files ·{' '}
                        {formatScanTime(config.directoryMeta[metaKey(item.path)]?.lastScannedAt)}
                      </Text>
                    </div>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() =>
                        void persistDirectories(
                          indexed.filter((current) => current.path !== item.path),
                          ignored,
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="directories-panel">
              <Group justify="space-between" mb="md">
                <div>
                  <Text className="eyebrow">GLOBALLY IGNORED DIRECTORIES</Text>
                  <h3>Excluded from every scan</h3>
                </div>
                <Badge variant="light">{ignored.length} ignored</Badge>
              </Group>
              <Text size="xs" c="orange" mb="md">
                Ignored directories always take precedence over indexed directories.
              </Text>
              <Group align="flex-end" mb="md">
                <TextInput
                  className="directory-add-input"
                  label="Add globally ignored directory"
                  placeholder="C:/Media/Projects/Cache"
                  value={ignoredPath}
                  onChange={(event) => setIgnoredPath(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addIgnored();
                  }}
                />
                <Button
                  variant="default"
                  loading={browsing === 'ignored'}
                  disabled={browsing !== null}
                  aria-label="Browse for ignored directory"
                  onClick={() => void browse('ignored')}
                >
                  Browse…
                </Button>
                <Button onClick={addIgnored}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {ignored.map((path) => (
                  <div className="preference-row" key={path}>
                    <ShieldCheck size={16} />
                    <div className="preference-path">
                      <Text size="sm">{path}</Text>
                      <Text size="xs" c="dimmed">
                        Global exclusion
                      </Text>
                    </div>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() =>
                        void persistDirectories(
                          indexed,
                          ignored.filter((item) => item !== path),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {activeTab === 'application' && (
          <Card className="indexing-settings-card application-panel">
            <Group justify="space-between" mb="md">
              <div>
                <Text className="eyebrow">INDEXING SETTINGS</Text>
                <h3>Application configuration</h3>
              </div>
              {saved && <Badge color="cyan">Saved</Badge>}
            </Group>
            <div className="settings-grid">
              <TextInput
                label="Local database name"
                description="Fixed at server/data/imgsorter.db."
                value="server/data/imgsorter.db"
                disabled
              />
              <TextInput
                label="File extensions"
                description="Comma-separated extensions to include."
                value={application.extensions}
                onChange={(event) => {
                  setApplication((current) => ({ ...current, extensions: event.currentTarget.value }));
                  setSaved(false);
                }}
              />
            </div>
            <div className="settings-options">
              <div className="setting-row">
                <div>
                  <Text size="sm">Process configured directories</Text>
                  <Text size="xs" c="dimmed">
                    Scan and index files from enabled directories.
                  </Text>
                </div>
                <Switch
                  checked={application.processDirectories}
                  onChange={(event) => {
                    setApplication((current) => ({ ...current, processDirectories: event.currentTarget.checked }));
                    setSaved(false);
                  }}
                  aria-label="Process configured directories"
                />
              </div>
              <div className="setting-row">
                <div>
                  <Text size="sm">Update duplicate records</Text>
                  <Text size="xs" c="dimmed">
                    Rebuild the duplicate summary after indexing.
                  </Text>
                </div>
                <Switch
                  checked={application.updateRecords}
                  onChange={(event) => {
                    setApplication((current) => ({ ...current, updateRecords: event.currentTarget.checked }));
                    setSaved(false);
                  }}
                  aria-label="Update duplicate records"
                />
              </div>
              <div className="setting-row">
                <div>
                  <Text size="sm">Resync directories</Text>
                  <Text size="xs" c="dimmed">
                    Remove entries for files that no longer exist or moved outside the app.
                  </Text>
                </div>
                <Switch
                  checked={application.resyncDirectories}
                  onChange={(event) => {
                    const resyncDirectories = event.currentTarget.checked;
                    setApplication((current) => ({
                      ...current,
                      resyncDirectories,
                      verifyFiles: resyncDirectories ? current.verifyFiles : false,
                    }));
                    setSaved(false);
                  }}
                  aria-label="Resync directories"
                />
              </div>
              {application.resyncDirectories && (
                <div className="setting-row">
                  <div>
                    <Text size="sm">Verify actual files</Text>
                    <Text size="xs" c="dimmed">
                      Check each stored entry directly against the filesystem. More accurate, but slower.
                    </Text>
                  </div>
                  <Switch
                    checked={application.verifyFiles}
                    onChange={(event) => {
                      setApplication((current) => ({ ...current, verifyFiles: event.currentTarget.checked }));
                      setSaved(false);
                    }}
                    aria-label="Verify actual files"
                  />
                </div>
              )}
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={resetDefaults}>
                Reset to defaults
              </Button>
              <Button color="cyan" onClick={() => void saveApplication()}>
                Save preferences
              </Button>
            </Group>
          </Card>
        )}

        {message && (
          <Text size="xs" c="orange">
            {message}
          </Text>
        )}
      </div>
    </>
  );
}
