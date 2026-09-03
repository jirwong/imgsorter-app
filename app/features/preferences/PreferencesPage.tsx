import { useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, Group, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { PageHeading } from '../../components/common/PageHeading';
import { preferences as defaultPreferences } from '../../lib/mock-data';

type IndexedRow = { path: string; enabled: boolean; lastScan: string; files: string };

export function PreferencesPage() {
  const [indexed, setIndexed] = useState<IndexedRow[]>(defaultPreferences.indexed);
  const [ignored, setIgnored] = useState<string[]>(defaultPreferences.ignored);
  const [indexedPath, setIndexedPath] = useState('');
  const [ignoredPath, setIgnoredPath] = useState('');
  const [message, setMessage] = useState('');
  const [databaseName, setDatabaseName] = useState(defaultPreferences.databaseName);
  const [extensions, setExtensions] = useState(defaultPreferences.extensions);
  const [processDirectories, setProcessDirectories] = useState(true);
  const [updateRecords, setUpdateRecords] = useState(true);
  const [resyncDirectories, setResyncDirectories] = useState(false);
  const [verifyFiles, setVerifyFiles] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('application');

  const activeCount = useMemo(() => indexed.filter((item) => item.enabled).length, [indexed]);

  const resetDefaults = () => {
    setDatabaseName(defaultPreferences.databaseName);
    setExtensions(defaultPreferences.extensions);
    setProcessDirectories(true);
    setUpdateRecords(true);
    setResyncDirectories(false);
    setVerifyFiles(false);
    setSaved(false);
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
    setIndexed((items) => [...items, { path, enabled: true, lastScan: 'Not scanned yet', files: '—' }]);
    setIndexedPath('');
    setMessage('Indexed directory added.');
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
    setIgnored((items) => [...items, path]);
    setIgnoredPath('');
    setMessage('Ignored directory added.');
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
                <Button onClick={addIndexed}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {indexed.map((item) => (
                  <div className="preference-row" key={item.path}>
                    <Checkbox
                      checked={item.enabled}
                      onChange={() =>
                        setIndexed((items) =>
                          items.map((current) =>
                            current.path === item.path ? { ...current, enabled: !current.enabled } : current,
                          ),
                        )
                      }
                      aria-label={`Enable ${item.path}`}
                    />
                    <FolderOpen size={16} />
                    <div className="preference-path">
                      <Text size="sm">{item.path}</Text>
                      <Text size="xs" c="dimmed">
                        {item.files} files · Last scan {item.lastScan}
                      </Text>
                    </div>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() => setIndexed((items) => items.filter((current) => current.path !== item.path))}
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
                      onClick={() => setIgnored((items) => items.filter((item) => item !== path))}
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
                description="SQLite database used to store indexed file metadata."
                value={databaseName}
                onChange={(event) => {
                  setDatabaseName(event.currentTarget.value);
                  setSaved(false);
                }}
              />
              <TextInput
                label="File extensions"
                description="Comma-separated extensions to include."
                value={extensions}
                onChange={(event) => {
                  setExtensions(event.currentTarget.value);
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
                  checked={processDirectories}
                  onChange={(event) => setProcessDirectories(event.currentTarget.checked)}
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
                  checked={updateRecords}
                  onChange={(event) => setUpdateRecords(event.currentTarget.checked)}
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
                  checked={resyncDirectories}
                  onChange={(event) => {
                    setResyncDirectories(event.currentTarget.checked);
                    if (!event.currentTarget.checked) setVerifyFiles(false);
                  }}
                  aria-label="Resync directories"
                />
              </div>
              {resyncDirectories && (
                <div className="setting-row">
                  <div>
                    <Text size="sm">Verify actual files</Text>
                    <Text size="xs" c="dimmed">
                      Check each stored entry directly against the filesystem. More accurate, but slower.
                    </Text>
                  </div>
                  <Switch
                    checked={verifyFiles}
                    onChange={(event) => setVerifyFiles(event.currentTarget.checked)}
                    aria-label="Verify actual files"
                  />
                </div>
              )}
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={resetDefaults}>
                Reset to defaults
              </Button>
              <Button color="cyan" onClick={() => setSaved(true)}>
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
