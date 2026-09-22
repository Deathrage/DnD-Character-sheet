import { useState } from 'react';
import type { NameResult } from '../types.js';

interface Props {
  label: string;
  value: string;
  onCommit(value: string): NameResult;
  placeholder?: string;
  className?: string;
}

/**
 * A text field for a name the business layer may reject.
 *
 * It commits on blur and on Enter, not per keystroke. Not a style preference: a name setter
 * rejects an empty string (`EMPTY_NAME`) and a duplicate (`DUPLICATE_NAME`), and every rename
 * passes through both states while it is being typed — clearing the box before typing the new
 * name is empty, and "Rogu" on the way to "Rogue" is momentarily neither. Committing per
 * keystroke would make those into errors the player never made. Spec §6 gives the same reason
 * for category rename.
 *
 * A rejected commit keeps the text, so nothing the player typed is thrown away by the error.
 */
export function NameField({ label, value, onCommit, placeholder, className = 'inp' }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (draft === null || draft === value) {
      setDraft(null);
      setError(null);
      return;
    }
    const failure = onCommit(draft);
    setError(failure);
    if (failure === null) setDraft(null);
  };

  return (
    <span className="nameField">
      <input
        className={className}
        aria-label={label}
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      {error !== null && (
        <span className="fieldError" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
