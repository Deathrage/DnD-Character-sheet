import { AbilitiesAndSkills } from './AbilitiesAndSkills.js';
import { Counters } from './Counters.js';
import { Equipment } from './Equipment.js';
import { FeatsAndTraits } from './FeatsAndTraits.js';
import { HubGrid } from './HubGrid.js';
import { Inventory } from './Inventory.js';
import { JournalAndNotes } from './JournalAndNotes.js';
import { SpellList } from './SpellList.js';
import { VitalsHeader } from './VitalsHeader.js';
import type {
  AbilitiesAndSkillsActions,
  AbilitiesAndSkillsView,
  CharacterView,
  CountersActions,
  CountersView,
  EquipmentActions,
  EquipmentView,
  FeatsAndTraitsActions,
  FeatsAndTraitsView,
  InventoryActions,
  InventoryView,
  JournalAndNotesActions,
  JournalAndNotesView,
  SectionKey,
  SpellListActions,
  SpellListView,
  VitalsActions,
} from '../types.js';

/**
 * Everything the seven sections render, and everything they call.
 *
 * One object per section rather than fourteen props on the hub: the hub does not read any of it,
 * it only picks which section is on screen and hands that section its own pair. When this is
 * wired, each pair is built once from the matching `CharacterSheetBO` subtree.
 */
export interface SheetData {
  character: CharacterView;
  journalAndNotes: JournalAndNotesView;
  inventory: InventoryView;
  featsAndTraits: FeatsAndTraitsView;
  equipment: EquipmentView;
  spellList: SpellListView;
  counters: CountersView;
  abilitiesAndSkills: AbilitiesAndSkillsView;
}

export interface SheetActions {
  vitals: VitalsActions;
  journalAndNotes: JournalAndNotesActions;
  inventory: InventoryActions;
  featsAndTraits: FeatsAndTraitsActions;
  equipment: EquipmentActions;
  spellList: SpellListActions;
  counters: CountersActions;
  abilitiesAndSkills: AbilitiesAndSkillsActions;
}

interface Props {
  data: SheetData;
  actions: SheetActions;
  /** `null` is the grid. Controlled, so `/c/:id/:section` can drive it. */
  section: SectionKey | null;
  onSectionChange(section: SectionKey | null): void;
  onBack(): void;
  onExport(): void;
  onOpenRawJson(): void;
  /** Which tiles are live. Defaults to all seven; a story stands sections down again. */
  wiredSections?: readonly SectionKey[];
  /** Absent hides the button — the stories and any screen without a cloud. */
  onUpload?(): void;
  /** The last upload's line: "Uploaded 24 Sep, 18:03" or the reason it failed. */
  uploadNotice?: string | null;
  uploadDisabled?: boolean;
  uploadHint?: string | null;
}

/**
 * The hub: vitals pinned at the top, the section grid below, and a section replacing the grid
 * when one is open.
 *
 * `section` is a prop rather than local state so that the router owns it — spec §7 routes
 * `/c/:id/:section` precisely so the phone's Back button pops the section and then the hub
 * without special-casing.
 */
export function CharacterHub({
  data,
  actions,
  section,
  onSectionChange,
  onBack,
  onExport,
  onOpenRawJson,
  wiredSections,
  onUpload,
  uploadNotice,
  uploadDisabled,
  uploadHint,
}: Props) {
  const close = () => onSectionChange(null);

  return (
    <div className="app">
      <VitalsHeader character={data.character} actions={actions.vitals} onBack={onBack} />
      {section === null ? (
        <HubGrid
          onOpen={onSectionChange}
          onExport={onExport}
          onOpenRawJson={onOpenRawJson}
          {...(wiredSections ? { wired: wiredSections } : {})}
          {...(onUpload ? { onUpload } : {})}
          uploadNotice={uploadNotice ?? null}
          uploadDisabled={uploadDisabled ?? false}
          uploadHint={uploadHint ?? null}
        />
      ) : (
        <Section section={section} data={data} actions={actions} onClose={close} />
      )}
    </div>
  );
}

function Section({
  section,
  data,
  actions,
  onClose,
}: {
  section: SectionKey;
  data: SheetData;
  actions: SheetActions;
  onClose(): void;
}) {
  switch (section) {
    case 'journal':
      return (
        <JournalAndNotes
          data={data.journalAndNotes}
          actions={actions.journalAndNotes}
          onClose={onClose}
        />
      );
    case 'inventory':
      return <Inventory data={data.inventory} actions={actions.inventory} onClose={onClose} />;
    case 'feats':
      return (
        <FeatsAndTraits
          characterId={data.character.id}
          data={data.featsAndTraits}
          actions={actions.featsAndTraits}
          onClose={onClose}
        />
      );
    case 'equipment':
      return (
        <Equipment
          characterId={data.character.id}
          data={data.equipment}
          actions={actions.equipment}
          onClose={onClose}
        />
      );
    case 'spells':
      return (
        <SpellList
          characterId={data.character.id}
          data={data.spellList}
          actions={actions.spellList}
          onClose={onClose}
        />
      );
    case 'counters':
      return (
        <Counters
          characterId={data.character.id}
          data={data.counters}
          actions={actions.counters}
          onClose={onClose}
        />
      );
    case 'abilities':
      return (
        <AbilitiesAndSkills
          data={data.abilitiesAndSkills}
          actions={actions.abilitiesAndSkills}
          onClose={onClose}
        />
      );
  }
}
