import { useState } from 'react';
import type { NameResult } from '../types.js';

interface Props {
  label: string;
  placeholder: string;
  /** The button's text, prefixed with `+`. */
  button: string;
  onAdd(value: string): NameResult;
}

/**
 * "Type a name, press Add", with the rejection shown beneath.
 *
 * The wireframe instead appended a blank row (or a category literally named "New category") and
 * let you fill it in afterwards. That is not available here: a blank name is exactly what the
 * business layer refuses (`EMPTY_NAME`), and a second default-named category would collide with
 * the first (`DUPLICATE_NAME`). There is no such thing as a half-created class or category, so
 * the name is collected before the thing exists.
 */
export function AddByName({ label, placeholder, button, onAdd }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const failure = onAdd(text);
    setError(failure);
    if (failure === null) setText('');
  };

  return (
    <>
      <div className="addrow">
        <input
          className="inp"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <button type="button" className="txtbtn" onClick={submit} disabled={text.trim() === ''}>
          + {button}
        </button>
      </div>
      {error !== null && (
        <div className="fieldError" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
