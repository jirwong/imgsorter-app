import { createFileRoute } from '@tanstack/react-router';
import { PreferencesPage } from '../features/preferences/PreferencesPage';

export const Route = createFileRoute('/preferences')({
  component: PreferencesPage,
});
