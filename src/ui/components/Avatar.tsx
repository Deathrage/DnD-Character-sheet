import { useState } from 'react';
import { initialOf } from '../format.js';

interface Props {
  /** The account's name, or its email address when it has none. */
  name: string | null | undefined;
  /** Google's profile picture, or `null` for the initial-letter placeholder. */
  photoUrl: string | null;
}

/**
 * The signed-in account. Decorative: its name is always beside it, so it has no alt text.
 *
 * A picture that fails to load — offline, since it lives on Google's servers and is never
 * precached, or a link Google has since retired — falls back to the initial rather than a broken
 * image. `no-referrer`, because Google's image host refuses some requests that carry one.
 */
export function Avatar({ name, photoUrl }: Props) {
  // Remembered per URL, so signing in as someone else gets their picture a fresh chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = photoUrl !== null && photoUrl !== failedUrl;
  return (
    <span className="mavatar" aria-hidden="true">
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
