/**
 * Neutralize terminal control sequences in text bound for a human's terminal.
 *
 * Text-mode output interpolates strings the server hands back — test and
 * project names, step text, run failure messages, error `message` /
 * `nextAction` — and none of them are typed by the person running the CLI.
 * Teammates in a shared workspace author them, and AI generation from crawled
 * pages and PRDs writes many more. Written raw, an escape sequence in one of
 * them is executed by the terminal rather than displayed: OSC 52 overwrites the
 * system clipboard, OSC 0/2 retitles the window, and `CSI 2K` + `\r` erases the
 * line so a row can be replaced with forged output ("all tests passed").
 *
 * Applied at the text boundaries only — `Output.print`'s text branch,
 * `Output.error`'s text branch, the top-level error renderer in `index.ts`,
 * and the default stderr line writer the commands share
 * ({@link writeStderrLine}). Never to `--output json` (`JSON.stringify`
 * already escapes C0 controls, and success data must round-trip byte for
 * byte) nor to `Output.writeChunk`, which streams `test code get` verbatim for
 * redirection to a file. The ticker's own in-place redraw writes its ANSI
 * through a separate raw writer, so it is unaffected.
 */

/**
 * A whole escape sequence, so a coloured string reads `passed`, not `[32mpassed[0m`
 * once the ESC byte alone is dropped:
 *  - CSI `ESC [ params intermediates final` (colour, cursor movement, erase);
 *  - OSC `ESC ] … BEL|ST` (title, clipboard, hyperlinks);
 *  - DCS / SOS / PM / APC `ESC P|X|^|_ … ST`;
 *  - any other `ESC intermediates final` (charset selection, `ESC c` reset);
 *  - the single-byte C1 forms of CSI (U+009B) and OSC (U+009D).
 * An unterminated string sequence runs to the end of the text, which is what a
 * terminal would swallow too.
 */
const ESCAPE_SEQUENCE_RE =
  // eslint-disable-next-line no-control-regex
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[PX^_][^\x1b]*(?:\x1b\\)?|[ -/]*[0-~])?|\x9b[0-?]*[ -/]*[@-~]|\x9d[^\x07\x1b\x9c]*(?:\x07|\x9c)?/g;

/**
 * Control characters left after the sequences are gone: C0 other than tab and
 * newline (so multi-line messages and tab-aligned text still render), DEL, and
 * C1. A bare `\r` is included — it returns the cursor to column 0, which is
 * enough on its own to overwrite what a line already printed.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

export function sanitizeTerminalText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(ESCAPE_SEQUENCE_RE, '').replace(CONTROL_CHAR_RE, '');
}

/**
 * Default stderr line writer for commands: one logical line plus a newline,
 * sanitized. stderr carries only human-facing lines here — JSON error
 * envelopes are written by `Output.error` and `index.ts`, not through this.
 */
export function writeStderrLine(line: string): void {
  process.stderr.write(`${sanitizeTerminalText(line)}\n`);
}
