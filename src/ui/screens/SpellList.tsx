import { useState } from 'react';
import { AbilityPicker } from '../components/AbilityPicker.js';
import { pasteLists } from '../components/pasteLists.js';
import { CategorizedSection } from '../components/CategorizedSection.js';
import { CheckRow } from '../components/CheckRow.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { formatSigned } from '../format.js';
import {
  ABILITIES,
  SPELL_LEVELS,
  abilityOf,
  spellLevelBadge,
  spellLevelName,
} from '../reference.js';
import { CategorySelect, locate, type Located } from './categoryPicker.js';
import type {
  AbilityKey,
  CategoryView,
  SpellcastingView,
  SpellListActions,
  SpellListView,
  SpellLevel,
  SpellView,
} from '../types.js';

interface Props {
  characterId: string;
  data: SpellListView;
  actions: SpellListActions;
  onClose(): void;
}

type Dialog =
  | { kind: 'new'; categoryId: string | null }
  | { kind: 'edit'; id: string }
  | { kind: 'addCasting' }
  | { kind: 'editCasting'; ability: AbilityKey }
  | null;

export function SpellList({ characterId, data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const editing = dialog?.kind === 'edit' ? locate(data, dialog.id) : undefined;
  // Resolved from the view, like `editing`, so an entry that vanishes underneath its dialog — a
  // raw-JSON commit rebuilds the whole sheet — simply unmounts it.
  const editingCasting =
    dialog?.kind === 'editCasting'
      ? data.spellcasting.find((entry) => entry.ability === dialog.ability)
      : undefined;

  return (
    <>
      <CategorizedSection
        characterId={characterId}
        title="Spell List"
        data={data}
        actions={actions}
        onClose={onClose}
        onAdd={(categoryId) => setDialog({ kind: 'new', categoryId })}
        count={(spells) =>
          `${spells.filter((spell) => spell.prepared).length}/${spells.length} prepared`
        }
        renderRow={(spell) => (
          <ItemRow
            name={spell.name}
            description={spell.description}
            dim={!spell.prepared}
            onOpen={() => setDialog({ kind: 'edit', id: spell.id })}
            before={
              // Prepared toggles from the row, not only from the dialog: it is the one field
              // that changes on every long rest, for every spell at once.
              <button
                type="button"
                className={spell.prepared ? 'prep on' : 'prep'}
                aria-pressed={spell.prepared}
                aria-label={`${spell.name} prepared`}
                onClick={() => actions.setSpellPrepared(spell.id, !spell.prepared)}
              />
            }
            after={<span className="lvlbadge">{spellLevelBadge(spell.level)}</span>}
          />
        )}
      >
        <Spellcasting
          entries={data.spellcasting}
          onAdd={() => setDialog({ kind: 'addCasting' })}
          onOpen={(ability) => setDialog({ kind: 'editCasting', ability })}
        />
      </CategorizedSection>

      {dialog?.kind === 'new' && (
        <NewSpellDialog
          categoryId={dialog.categoryId}
          categories={data.categories}
          onCreate={actions.addSpell}
          onClose={close}
        />
      )}
      {dialog?.kind === 'addCasting' && (
        <AddSpellcastingDialog
          used={data.spellcasting.map((entry) => entry.ability)}
          onCreate={actions.addSpellcasting}
          onClose={close}
        />
      )}
      {editingCasting && (
        <EditSpellcastingDialog entry={editingCasting} actions={actions} onClose={close} />
      )}
      {editing && (
        <EditSpellDialog
          located={editing}
          categories={data.categories}
          actions={actions}
          onClose={close}
        />
      )}
    </>
  );
}

function LevelSelect({
  value,
  onChange,
}: {
  value: SpellLevel;
  onChange(level: SpellLevel): void;
}) {
  return (
    <>
      <label className="dlabel" htmlFor="spell-level">
        Level
      </label>
      <select
        id="spell-level"
        className="inp"
        value={String(value)}
        // Round-trips through the string the option carries: `'c'` stays a string and the rest
        // become numbers again, which is the union the schema accepts.
        onChange={(event) =>
          onChange(event.target.value === 'c' ? 'c' : (Number(event.target.value) as SpellLevel))
        }
      >
        {SPELL_LEVELS.map((level) => (
          <option key={String(level)} value={String(level)}>
            {spellLevelName(level)}
          </option>
        ))}
      </select>
    </>
  );
}

function NewSpellDialog({
  categoryId,
  categories,
  onCreate,
  onClose,
}: {
  categoryId: string | null;
  categories: CategoryView<SpellView>[];
  onCreate: SpellListActions['addSpell'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<SpellLevel>('c');
  const [prepared, setPrepared] = useState(false);
  const [target, setTarget] = useState(categoryId);

  return (
    <ResponsiveDialog
      title="New spell"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate(target, { name: name.trim(), description, level, prepared });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-spell-name">
        Name
      </label>
      <input
        id="new-spell-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="dlabel mt12" htmlFor="new-spell-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="new-spell-description"
        className="area"
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="row2">
        <div className="col">
          <LevelSelect value={level} onChange={setLevel} />
        </div>
        <div className="col">
          <CategorySelect value={target} categories={categories} onChange={setTarget} />
        </div>
      </div>
      <CheckRow label="Prepared" checked={prepared} onChange={setPrepared} />
    </ResponsiveDialog>
  );
}

function EditSpellDialog({
  located,
  categories,
  actions,
  onClose,
}: {
  located: Located<SpellView>;
  categories: CategoryView<SpellView>[];
  actions: SpellListActions;
  onClose(): void;
}) {
  const { item: spell, categoryId } = located;

  return (
    <ResponsiveDialog
      title="Edit spell"
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={spell.name}
          onConfirm={() => {
            actions.removeSpell(spell.id);
            onClose();
          }}
        >
          Delete
        </ConfirmDelete>
      }
    >
      <span className="dlabel">Name</span>
      <NameField
        label="Name"
        value={spell.name}
        onCommit={(name) => actions.renameSpell(spell.id, name)}
      />
      <label className="dlabel mt12" htmlFor="spell-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="spell-description"
        className="area"
        rows={4}
        value={spell.description}
        onChange={(event) => actions.setSpellDescription(spell.id, event.target.value)}
      />
      <div className="row2">
        <div className="col">
          <LevelSelect
            value={spell.level}
            onChange={(level) => actions.setSpellLevel(spell.id, level)}
          />
        </div>
        <div className="col">
          <CategorySelect
            value={categoryId}
            categories={categories}
            onChange={(id) => actions.moveSpell(spell.id, id)}
          />
        </div>
      </div>
      <CheckRow
        label="Prepared"
        checked={spell.prepared}
        onChange={(prepared) => actions.setSpellPrepared(spell.id, prepared)}
      />
    </ResponsiveDialog>
  );
}

/**
 * The spellcasting block above the categories (spec §5.1): one chip per ability, wrapping onto a
 * new line rather than scrolling — a chip scrolled out of sight would hide a number the player
 * may need every turn. Add is hidden once every ability has an entry.
 */
function Spellcasting({
  entries,
  onAdd,
  onOpen,
}: {
  entries: SpellcastingView[];
  onAdd(): void;
  onOpen(ability: AbilityKey): void;
}) {
  return (
    <>
      <div className="sechead-row">
        <span className="sechead static">Spellcasting</span>
        {entries.length < ABILITIES.length && (
          <button type="button" className="txtbtn" onClick={onAdd}>
            + Add
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="castempty">No spellcasting ability yet — tap “Add”.</div>
      ) : (
        <div className="castchips">
          {entries.map((entry) => {
            const ability = abilityOf(entry.ability);
            return (
              <button
                key={entry.ability}
                type="button"
                className="castchip"
                aria-label={`${ability.name} spellcasting: attack ${formatSigned(entry.attackBonus)}, save DC ${entry.saveDc}`}
                onClick={() => onOpen(entry.ability)}
              >
                <span className="ab">{ability.short}</span>
                <span className="tl">Atk</span>
                <b>{formatSigned(entry.attackBonus)}</b>
                <span className="sep" aria-hidden="true">
                  |
                </span>
                <span className="tl">DC</span>
                <b>{entry.saveDc}</b>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The two numbers, side by side, in both spellcasting dialogs. */
function CastingNumbers({
  attackBonus,
  saveDc,
  onAttackBonus,
  onSaveDc,
}: {
  attackBonus: number;
  saveDc: number;
  onAttackBonus(value: number): void;
  onSaveDc(value: number): void;
}) {
  return (
    <div className="row2">
      <div className="col">
        <span className="dlabel">Spell attack</span>
        <NumberField
          label="Spell attack"
          className="inp stat"
          signed
          value={attackBonus}
          onChange={onAttackBonus}
        />
      </div>
      <div className="col">
        <span className="dlabel">Save DC</span>
        <NumberField label="Save DC" className="inp stat" value={saveDc} onChange={onSaveDc} />
      </div>
    </div>
  );
}

/**
 * Ability first: the numbers appear once one is picked, and Create writes all three at once, so
 * an entry never exists before the player has seen its fields.
 */
function AddSpellcastingDialog({
  used,
  onCreate,
  onClose,
}: {
  used: AbilityKey[];
  onCreate: SpellListActions['addSpellcasting'];
  onClose(): void;
}) {
  const [ability, setAbility] = useState<AbilityKey | null>(null);
  const [attackBonus, setAttackBonus] = useState(0);
  const [saveDc, setSaveDc] = useState(0);
  const taken = used.map((key) => ` ${abilityOf(key).name} already has an entry.`).join('');

  return (
    <ResponsiveDialog
      title="Add spellcasting"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={ability === null}
          onClick={() => {
            if (ability === null) return;
            onCreate(ability, { attackBonus, saveDc });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <span className="dlabel">Ability</span>
      <AbilityPicker label="Ability" value={ability} disabled={used} onChange={setAbility} />
      {ability === null ? (
        <div className="hint tight">Pick the ability you cast with.{taken}</div>
      ) : (
        <CastingNumbers
          attackBonus={attackBonus}
          saveDc={saveDc}
          onAttackBonus={setAttackBonus}
          onSaveDc={setSaveDc}
        />
      )}
    </ResponsiveDialog>
  );
}

/** The ability is the entry's identity, so it is not editable here: delete and add another. */
function EditSpellcastingDialog({
  entry,
  actions,
  onClose,
}: {
  entry: SpellcastingView;
  actions: SpellListActions;
  onClose(): void;
}) {
  const { name } = abilityOf(entry.ability);

  return (
    <ResponsiveDialog
      title={name}
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={`${name} spellcasting`}
          onConfirm={() => {
            actions.removeSpellcasting(entry.ability);
            onClose();
          }}
        >
          Delete
        </ConfirmDelete>
      }
    >
      <div className="hint" style={{ marginTop: 0 }}>
        Spellcasting with {name}. To use another ability, delete this and add one.
      </div>
      <CastingNumbers
        attackBonus={entry.attackBonus}
        saveDc={entry.saveDc}
        onAttackBonus={(value) => actions.setSpellAttackBonus(entry.ability, value)}
        onSaveDc={(value) => actions.setSpellSaveDc(entry.ability, value)}
      />
    </ResponsiveDialog>
  );
}
