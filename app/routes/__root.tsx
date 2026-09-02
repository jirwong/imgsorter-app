import { MantineProvider } from '@mantine/core';
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AppFooter } from '../components/common/AppFooter';
import { AppHeader } from '../components/common/AppHeader';
import { Sidebar } from '../components/common/Sidebar';
import { FilePreviewDrawer } from '../components/common/FilePreviewDrawer';
import { AppProvider } from '../lib/app-context';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'imgsorter' },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <MantineProvider defaultColorScheme="dark">
          <AppProvider>
            <div className="app-shell">
              <Sidebar />
              <main>
                <AppHeader />
                <section className="content">{children}</section>
                <AppFooter />
              </main>
            </div>
            <FilePreviewDrawer />
          </AppProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
