/**
 * The business layer's public face. `src/ui/` imports from here and nowhere else in this
 * directory.
 *
 * Deliberately absent: every `*Data` alias from `./types.js`. Those are the stored shapes, and
 * exporting one would put the document's structure back into UI signatures — which is the thing
 * this layer exists to prevent. `nodeBO.js`, `namedItem.js`, `observableList.js` and
 * `mobxConfig.js` stay internal for the same reason: they are implementation-sharing mechanisms
 * (a base class, a MobX-push helper, a side-effecting config import), not shapes or types a UI
 * consumer would ever need to name. `CategorizedBO` and `CategorizedItemBO` are absent for a
 * related reason: both are generic over a `*Data` shape, so neither can be named at all without
 * an alias this barrel withholds on purpose. `FeatsAndTraitsBO` and `SpellListBO` are the
 * already-applied aliases a UI consumer actually wants. `categorized.js`'s `moveTo` takes a
 * `CategoryBO` directly —
 * a UI caller passes a `CategoryBO` it already has — so there is no separate destination type to
 * export either.
 */
export { CharacterSheetBO } from './characterSheet.js';
export { RuleViolation, type RuleCode } from './errors.js';
export { ClassesBO, ClassBO, type NewClass } from './classes.js';
export { HitPointsBO } from './hitPoints.js';
export { HitDicesBO, HitDieBO } from './hitDices.js';
export { JournalAndNotesBO, JournalDayBO } from './journalAndNotes.js';
export { InventoryBO, CoinsBO, InventoryItemBO, type NewInventoryItem } from './inventory.js';
export { EquipmentBO, EquipmentItemBO, type NewEquipmentItem } from './equipment.js';
export { CategoryBO, type NewNamedItem } from './categorized.js';
export { FeatBO, type FeatsAndTraitsBO } from './featsAndTraits.js';
export { SpellBO, type SpellLevel, type SpellListBO } from './spellList.js';
export { CountersBO, CounterBO, SpellSlotBO } from './counters.js';
export {
  AbilitiesAndSkillsBO,
  AbilityBO,
  SkillBO,
  type AbilityKey,
  type SkillKey,
} from './abilitiesAndSkills.js';
