import { notifications } from '@mantine/notifications';

export function copyToClipboard(text: string, successMessage: string, errorMessage: string): void {
  if (!navigator.clipboard) {
    notifications.show({ color: 'red', message: errorMessage });
    return;
  }
  void navigator.clipboard
    .writeText(text)
    .then(() => notifications.show({ color: 'cyan', message: successMessage }))
    .catch(() => notifications.show({ color: 'red', message: errorMessage }));
}
