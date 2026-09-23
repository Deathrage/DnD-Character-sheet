// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { htmlToText, pasteLists } from './pasteLists.js';

describe('htmlToText', () => {
  it('keeps bullets, numbers and nesting as characters', () => {
    const html = `<p>Grants:</p>
      <ul>
        <li>Darkvision</li>
        <li><p>Fey Ancestry</p>
          <ol><li>charm</li><li>sleep</li></ol>
        </li>
      </ul>`;
    expect(htmlToText(html)).toBe(
      ['Grants:', '• Darkvision', '• Fey Ancestry', '  1. charm', '  2. sleep'].join('\n'),
    );
  });
});

function Area() {
  const [value, setValue] = useState('Intro ');
  return (
    <>
      <textarea
        aria-label="d"
        value={value}
        onPaste={pasteLists}
        onChange={(event) => setValue(event.target.value)}
      />
      <output>{value}</output>
    </>
  );
}

describe('pasteLists', () => {
  it('inserts the list at the caret and reaches onChange', () => {
    render(<Area />);
    const area = screen.getByLabelText('d') as HTMLTextAreaElement;
    area.setSelectionRange(6, 6);
    fireEvent.paste(area, {
      clipboardData: {
        getData: (type: string) => (type === 'text/html' ? '<ul><li>a</li></ul>' : ''),
      },
    });
    // React state, not area.value: setRangeText changes the DOM whether or not onChange ran.
    expect(screen.getByRole('status').textContent).toBe('Intro • a');
  });
});
