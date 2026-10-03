import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { PreferencesPage } from '../features/preferences/PreferencesPage';
import { getAppConfig } from '../../server/routes/preferences';

export const Route = createFileRoute('/preferences')({
  loader: async () => getAppConfig(),
  component: PreferencesRoute,
});

function PreferencesRoute() {
  const config = useLoaderData({ from: '/preferences' });
  return <PreferencesPage config={config} />;
}
