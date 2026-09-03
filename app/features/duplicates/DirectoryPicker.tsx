import { useState } from 'react';
import { Button, Checkbox, Group, Popover, ScrollArea, Text, TextInput } from '@mantine/core';
import { ChevronsUpDown, Search } from 'lucide-react';

export type DirectoryOption = { value: string; label: string; count: number };

export type DirectoryPickerProps = {
  applied: string[];
  options: DirectoryOption[];
  onApply: (dirs: string[]) => void;
};

export function DirectoryPicker({ applied, options, onApply }: DirectoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [draft, setDraft] = useState<string[]>([]);

  const visible = options.filter(
    (o) => !directoryQuery || o.label.toLowerCase().includes(directoryQuery.toLowerCase()),
  );

  return (
    <Popover opened={open} onChange={setOpen} width={320} position="bottom-start" shadow="md">
      <Popover.Target>
        <Button
          size="xs"
          variant="default"
          className="directory-filter"
          onClick={() => {
            setDraft(applied);
            setOpen((v) => !v);
          }}
        >
          <span>{applied.length === 0 ? 'All directories' : `${applied.length} directories`}</span>
          <ChevronsUpDown size={15} />
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TextInput
          size="xs"
          autoFocus
          placeholder="Search directories"
          value={directoryQuery}
          onChange={(event) => setDirectoryQuery(event.currentTarget.value)}
          leftSection={<Search size={13} />}
          mb="xs"
        />
        <Group justify="space-between" mb="xs">
          <Text size="xs" c="dimmed">
            Select directories
          </Text>
          <Group gap={4}>
            <Button variant="subtle" size="compact-xs" onClick={() => setDraft(visible.map((item) => item.value))}>
              Select visible
            </Button>
            <Button variant="subtle" size="compact-xs" onClick={() => setDraft([])}>
              Clear
            </Button>
          </Group>
        </Group>
        <ScrollArea h={220}>
          {visible.map((item) => (
            <div className="directory-option" key={item.value}>
              <Checkbox
                size="xs"
                checked={draft.includes(item.value)}
                onChange={() =>
                  setDraft((v) => (v.includes(item.value) ? v.filter((x) => x !== item.value) : [...v, item.value]))
                }
                label={item.label}
              />
              <Text size="xs" c="dimmed">
                {item.count}
              </Text>
            </div>
          ))}
        </ScrollArea>
        <Group justify="flex-end" mt="xs" className="picker-actions">
          <Button size="compact-xs" variant="subtle" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="compact-xs"
            color="cyan"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
