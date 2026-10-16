import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeTerminalText, writeStderrLine } from './terminal-text.js';

describe('sanitizeTerminalText', () => {
  it('leaves ordinary text unchanged, including tabs, newlines and non-ASCII', () => {
    const text = 'ID\tNAME\ntest_1\tCheckout — declined card 😀 日本 ü';
    expect(sanitizeTerminalText(text)).toBe(text);
  });

  it('strips CSI sequences whole (colour, erase line, cursor movement)', () => {
    expect(sanitizeTerminalText('\x1b[32mpassed\x1b[0m')).toBe('passed');
    expect(sanitizeTerminalText('a\x1b[2Kb')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b[1;38;5;196mb')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b[3Ab')).toBe('ab');
  });

  it('strips OSC sequences with either terminator (title, clipboard, hyperlink)', () => {
    expect(sanitizeTerminalText('a\x1b]0;PWNED\x07b')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b]52;c;ZWNobyBvd25lZA==\x07b')).toBe('ab');
    expect(sanitizeTerminalText('\x1b]8;;https://x.test\x1b\\link\x1b]8;;\x1b\\')).toBe('link');
  });

  it('swallows an unterminated OSC to the end, as a terminal would', () => {
    expect(sanitizeTerminalText('a\x1b]52;c;ZWNobw==')).toBe('a');
  });

  it('strips DCS/APC strings and two-byte escapes', () => {
    expect(sanitizeTerminalText('a\x1bPq#0;2;0;0;0\x1b\\b')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b_payload\x1b\\b')).toBe('ab');
    expect(sanitizeTerminalText('a\x1bcb')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b(0b')).toBe('ab');
  });

  it('strips the single-byte C1 forms of CSI and OSC', () => {
    expect(sanitizeTerminalText('a\x9b31mb')).toBe('ab');
    expect(sanitizeTerminalText('a\x9d0;title\x07b')).toBe('ab');
  });

  it('drops a bare carriage return but keeps CRLF line breaks as LF', () => {
    expect(sanitizeTerminalText('real row\rfake row')).toBe('real rowfake row');
    expect(sanitizeTerminalText('line 1\r\nline 2')).toBe('line 1\nline 2');
  });

  it('drops remaining C0 controls, DEL and C1 controls', () => {
    expect(sanitizeTerminalText('a\x00b\x07c\x08d\x0be\x0cf\x7fg\x85h\x1b')).toBe('abcdefgh');
  });

  it('neutralizes the forged-row payload from the issue', () => {
    const name =
      'Checkout\x1b]0;PWNED\x07\x1b]52;c;ZWNobyBvd25lZA==\x07 flow\x1b[2K\r\x1b[32mall tests passed\x1b[0m';
    expect(sanitizeTerminalText(name)).toBe('Checkout flowall tests passed');
  });
});

describe('writeStderrLine', () => {
  const realWrite = process.stderr.write.bind(process.stderr);
  afterEach(() => {
    process.stderr.write = realWrite;
  });

  it('writes one sanitized line with a trailing newline', () => {
    const chunks: string[] = [];
    process.stderr.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;
    writeStderrLine('Run failed: \x1b]0;PWNED\x07expected heading');
    expect(chunks).toEqual(['Run failed: expected heading\n']);
  });
});
