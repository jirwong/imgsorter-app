import { Button } from '@mantine/core';

export type KeepToggleProps = {
  keeper: boolean;
  onToggle: () => void;
};

export function KeepToggle({ keeper, onToggle }: KeepToggleProps) {
  return (
    <Button size="compact-xs" variant={keeper ? 'filled' : 'subtle'} onClick={onToggle}>
      {keeper ? 'Keeper' : 'Keep'}
    </Button>
  );
}
