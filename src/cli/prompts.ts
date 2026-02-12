/**
 * Terminal UI primitives — interactive selection with arrow keys.
 *
 * Zero external dependencies. Uses raw stdin mode for keypress detection.
 */

import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SelectOption<T = string> {
  label: string;
  value: T;
  description?: string;
}

// ANSI escape codes
const ESC = '\x1B[';
const CLEAR_LINE = `${ESC}2K`;
const CURSOR_UP = (n: number) => `${ESC}${n}A`;
const CURSOR_HIDE = `${ESC}?25l`;
const CURSOR_SHOW = `${ESC}?25h`;
const DIM = `${ESC}2m`;
const RESET = `${ESC}0m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const BOLD = `${ESC}1m`;

// ═══════════════════════════════════════════════════════════════
// SELECT (single choice with arrow keys)
// ═══════════════════════════════════════════════════════════════

/**
 * Show an interactive single-select list.
 * User navigates with ↑/↓ arrows and confirms with Enter.
 */
export function select<T = string>(options: {
  message: string;
  choices: SelectOption<T>[];
  defaultIndex?: number;
}): Promise<T> {
  const { message, choices, defaultIndex = 0 } = options;

  return new Promise((resolve, reject) => {
    if (choices.length === 0) {
      reject(new Error('No choices provided'));
      return;
    }

    let cursor = Math.min(defaultIndex, choices.length - 1);
    let rendered = false;

    const render = () => {
      // Move cursor up to overwrite previous render
      if (rendered) {
        stdout.write(CURSOR_UP(choices.length));
      }

      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        const isActive = i === cursor;
        const pointer = isActive ? `${CYAN}❯${RESET}` : ' ';
        const label = isActive ? `${BOLD}${choice.label}${RESET}` : `${DIM}${choice.label}${RESET}`;
        const desc = choice.description ? `  ${DIM}${choice.description}${RESET}` : '';
        stdout.write(`${CLEAR_LINE}  ${pointer} ${label}${desc}\n`);
      }

      rendered = true;
    };

    // Print header
    stdout.write(
      `  ${GREEN}?${RESET} ${BOLD}${message}${RESET} ${DIM}(↑↓ to select, Enter to confirm)${RESET}\n`
    );

    stdout.write(CURSOR_HIDE);
    render();

    // Enable raw mode to detect individual keypresses
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onKeypress = (data: Buffer) => {
      const key = data.toString();

      // Arrow up
      if (key === '\x1B[A' || key === 'k') {
        cursor = cursor > 0 ? cursor - 1 : choices.length - 1;
        render();
        return;
      }

      // Arrow down
      if (key === '\x1B[B' || key === 'j') {
        cursor = cursor < choices.length - 1 ? cursor + 1 : 0;
        render();
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        // Show final selection inline
        stdout.write(CURSOR_UP(choices.length));
        for (let i = 0; i < choices.length; i++) {
          stdout.write(`${CLEAR_LINE}\n`);
        }
        stdout.write(CURSOR_UP(choices.length + 1)); // +1 for the header
        stdout.write(
          `${CLEAR_LINE}  ${GREEN}✔${RESET} ${BOLD}${message}${RESET} ${CYAN}${choices[cursor].label}${RESET}\n`
        );
        resolve(choices[cursor].value);
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        stdout.write('\n');
        process.exit(0);
      }

      // q / Escape to cancel
      if (key === '\x1B' || key === 'q') {
        cleanup();
        stdout.write('\n  Cancelled.\n');
        process.exit(0);
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdout.write(CURSOR_SHOW);
    };

    stdin.on('data', onKeypress);
  });
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM (Y/n)
// ═══════════════════════════════════════════════════════════════

/**
 * Show a yes/no confirmation prompt.
 */
export function confirm(options: { message: string; defaultValue?: boolean }): Promise<boolean> {
  const { message, defaultValue = true } = options;
  const hint = defaultValue ? 'Y/n' : 'y/N';

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });

    rl.question(
      `  ${GREEN}?${RESET} ${BOLD}${message}${RESET} ${DIM}(${hint})${RESET} `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === '') {
          resolve(defaultValue);
        } else {
          resolve(trimmed === 'y' || trimmed === 'yes');
        }
      }
    );
  });
}

// ═══════════════════════════════════════════════════════════════
// TEXT INPUT
// ═══════════════════════════════════════════════════════════════

/**
 * Show a text input prompt.
 */
export function textInput(options: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}): Promise<string> {
  const { message, placeholder, defaultValue, required = false } = options;
  const hint = defaultValue
    ? `${DIM}(${defaultValue})${RESET} `
    : placeholder
      ? `${DIM}(${placeholder})${RESET} `
      : '';

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });

    rl.question(`  ${GREEN}?${RESET} ${BOLD}${message}${RESET} ${hint}`, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!trimmed && defaultValue) {
        resolve(defaultValue);
        return;
      }
      if (required && !trimmed) {
        reject(new Error(`${message} is required.`));
        return;
      }
      resolve(trimmed);
    });
  });
}
