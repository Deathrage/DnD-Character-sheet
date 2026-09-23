import type { ClipboardEvent } from 'react';

const BLOCKS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TR',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
]);

/**
 * Flattens pasted HTML to plain text, keeping list markers as characters.
 *
 * A browser's `text/plain` for a copied `<ul>` carries the items but not the bullets — the
 * marker is rendered, not text. Descriptions are plain strings, so the bullet has to become a
 * character or it is lost.
 */
export function htmlToText(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const lines = [{ prefix: '', text: '' }];
  const newline = (prefix = '') => {
    const current = lines[lines.length - 1]!;
    if (current.text.trim() === '') current.prefix = prefix || current.prefix;
    else lines.push({ prefix, text: '' });
  };

  const walk = (node: Node, depth: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1]!.text += node.textContent;
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    if (tag === 'BR') return newline();
    if (tag === 'LI') {
      const parent = node.parentElement;
      const marker =
        parent?.tagName === 'OL'
          ? `${
              Array.from(parent.children)
                .filter((c) => c.tagName === 'LI')
                .indexOf(node) + 1
            }. `
          : '• ';
      newline('  '.repeat(Math.max(depth - 1, 0)) + marker);
    } else if (BLOCKS.has(tag)) newline();
    const childDepth = tag === 'UL' || tag === 'OL' ? depth + 1 : depth;
    node.childNodes.forEach((child) => walk(child, childDepth));
    if (BLOCKS.has(tag) || tag === 'LI') newline();
  };

  walk(body, 0);
  return lines
    .map(({ prefix, text }) => prefix + text.replace(/\s+/g, ' ').trim())
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** `onPaste` for a description textarea. Only a paste containing a list is intercepted. */
export function pasteLists(event: ClipboardEvent<HTMLTextAreaElement>) {
  const html = event.clipboardData.getData('text/html');
  if (!/<li[\s>]/i.test(html)) return;
  event.preventDefault();
  const area = event.currentTarget;
  area.setRangeText(htmlToText(html), area.selectionStart, area.selectionEnd, 'end');
  // setRangeText bypasses React's value tracker, so this input event reaches onChange.
  area.dispatchEvent(new Event('input', { bubbles: true }));
}
