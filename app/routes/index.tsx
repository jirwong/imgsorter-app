import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  return <main>Placeholder — Overview lands here in Task 6.</main>;
}
