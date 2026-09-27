import { useId, type ReactNode } from 'react';
import { ICONS } from '../components/icons.js';
import { SECTIONS, WIRED_SECTIONS, type SectionKey } from '../types.js';

interface Props {
  onOpen(section: SectionKey): void;
  onExport(): void;
  onOpenRawJson(): void;
  /** Which entries are live. The first slice wires one; the other six render inert. */
  wired?: readonly SectionKey[];
  /**
   * The line under each entry: what that section holds ("7 items · 45 gp"). Absent, or missing a
   * key, falls back to the section's fixed subtitle — the stories, and any screen without a sheet.
   */
  summaries?: Partial<Record<SectionKey, string>>;
  /** Absent hides the button — the stories and any screen without a cloud. */
  onUpload?(): void;
  /** The last upload's line: "Uploaded 24 Sep, 18:03" or the reason it failed. */
  uploadNotice?: string | null;
  /** Signed out, or the sign-in check still running: the button is shown but cannot be pressed. */
  uploadDisabled?: boolean;
  /**
   * Why it is disabled, when there is something to say. Both a tooltip and a visible line: a
   * phone has no hover, so a tooltip alone would never be seen there.
   */
  uploadHint?: string | null;
}

export function HubGrid({
  onOpen,
  onExport,
  onOpenRawJson,
  wired = WIRED_SECTIONS,
  summaries,
  onUpload,
  uploadDisabled = false,
  uploadHint = null,
  uploadNotice,
}: Props) {
  return (
    <div className="bottom">
      {/* The sheet's contents, as a rulebook's: one entry per section, each saying what it holds
          so the hub is worth reading before anything is tapped. */}
      <ul className="contents">
        {SECTIONS.map((section) => {
          const enabled = wired.includes(section.key);
          return (
            <Entry
              key={section.key}
              icon={section.icon}
              title={section.title}
              line={enabled ? (summaries?.[section.key] ?? section.subtitle) : 'not built yet'}
              // `aria-disabled` rather than `disabled`: the entry is present and readable — it
              // is the map of what this character sheet holds — it just does not go anywhere
              // yet. A `disabled` button is skipped by the tab order, which would hide six of
              // the seven sections from a keyboard or screen reader entirely.
              inert={!enabled}
              onClick={() => {
                if (enabled) onOpen(section.key);
              }}
            />
          );
        })}
      </ul>
      {/* Above the rule, what the sheet holds; below it, what can be done with the sheet — the
          same rows, so they are plainly buttons, but past a divider, so plainly not sections. */}
      <hr className="hubrule" />
      {/* Copies of the sheet leaving this device. */}
      <ul className="contents paperwork">
        {onUpload !== undefined && (
          <Entry
            icon={ICONS.cloud}
            title="Upload to cloud"
            // The reason it cannot be pressed first — a phone has no hover, so the tooltip alone
            // would never be seen — then how the last upload went, then what it does.
            line={
              uploadDisabled && uploadHint !== null
                ? uploadHint
                : (uploadNotice ?? 'Save a dated copy to your Google account.')
            }
            disabled={uploadDisabled}
            {...(uploadDisabled && uploadHint !== null ? { tooltip: uploadHint } : {})}
            onClick={onUpload}
          />
        )}
        <Entry
          icon={ICONS.export}
          title="Export as .json"
          line="A file you can keep, share or import again."
          onClick={onExport}
        />
      </ul>
      {/* Not a transfer: the document itself, opened here. A group of its own so it is never
          read as a third way of saving a copy. */}
      <ul className="contents paperwork">
        <Entry
          icon={ICONS.json}
          title="Open raw JSON"
          line="The stored document, to read or repair by hand."
          onClick={onOpenRawJson}
        />
      </ul>
    </div>
  );
}

/**
 * One row of the hub: a glyph, a title, and the line under it. Named by the title alone, the line
 * as the description — "Inventory, 7 items · 45 gp", not one run-on name that changes with every
 * edit.
 */
function Entry({
  icon,
  title,
  line,
  inert = false,
  disabled = false,
  tooltip,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  line: string;
  inert?: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick(): void;
}) {
  const id = useId();
  return (
    <li>
      <button
        type="button"
        className="centry"
        aria-disabled={inert || undefined}
        disabled={disabled}
        title={tooltip}
        aria-labelledby={`${id}t`}
        aria-describedby={`${id}s`}
        onClick={onClick}
      >
        <span className="ico" aria-hidden="true">
          {icon}
        </span>
        <span className="ctext">
          <span className="mt" id={`${id}t`}>
            {title}
          </span>
          <span className="ms" id={`${id}s`}>
            {line}
          </span>
        </span>
      </button>
    </li>
  );
}
