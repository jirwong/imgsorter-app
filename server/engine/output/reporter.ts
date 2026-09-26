import type { RunSummary } from '../types/run-summary';

export interface Reporter {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  printSummary(summary: RunSummary): void;
}
