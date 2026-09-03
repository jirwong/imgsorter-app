import '@mantine/core/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import '../styles.css';
import { AppFooter } from '../components/common/AppFooter';
import { AppHeader } from '../components/common/AppHeader';
import { Sidebar } from '../components/common/Sidebar';
import { FilePreviewDrawer } from '../components/common/FilePreviewDrawer';
import { AppProvider } from '../lib/app-context';

const theme = createTheme({
  primaryColor: 'cyan',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  headings: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  defaultRadius: 'md',
  colors: {
    cyan: [
      '#e1fbff',
      '#baf3fa',
      '#82e9f2',
      '#48dbe8',
      '#18c7d8',
      '#08aabc',
      '#07899b',
      '#086d7d',
      '#0b5967',
      '#0e4651',
    ],
  },
});

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
        <MantineProvider theme={theme} defaultColorScheme="dark">
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
