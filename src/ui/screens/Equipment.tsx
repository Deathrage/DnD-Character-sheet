import { useState, type ReactNode } from 'react';
import { AbilityPicker } from '../components/AbilityPicker.js';
import { Block } from '../components/CategorizedSection.js';
import { pasteLists } from '../components/pasteLists.js';
import { CheckRow } from '../components/CheckRow.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { formatSigned } from '../format.js';
import { usePersistedState } from '../persistedState.js';
import { abilityOf } from '../reference.js';
import type {
  AbilityKey,
  EquipmentActions,
  EquipmentItemView,
  EquipmentSlot,
  EquipmentView,
  NameResult,
  WeaponAttackView,
  WeaponView,
} from '../types.js';

interface Props {
  characterId: string;
  data: EquipmentView;
  actions: EquipmentActions;
  onClose(): void;
}

type Dialog = { kind: 'new'; slot: EquipmentSlot } | { kind: 'edit'; id: string } | null;

type BlockKey = 'attuned' | 'equipped' | 'weapons' | 'other';

/** Only a weapon's view carries the key at all, so its presence is what tells the two apart. */
const isWeapon = (item: EquipmentItemView): item is WeaponView => 'attack' in item;

/** The damage placeholder, in the new and edit dialogs alike. */
const DAMAGE_EXAMPLE = 'e.g. 1d8+3 piercing';

export function Equipment({ characterId, data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  // Per character, like the categories: whether Weapons deserves the space depends on who is
  // carrying them. Every block starts open, and only a collapse is recorded.
  const [collapsed, setCollapsed] = usePersistedState<Partial<Record<BlockKey, boolean>>>(
    `ui:${characterId}:equipment`,
    {},
  );
  const block = (key: BlockKey) => ({
    collapsed: collapsed[key] === true,
    onToggle: () => setCollapsed({ ...collapsed, [key]: collapsed[key] !== true }),
  });
  const close = () => setDialog(null);
  const editing =
    dialog?.kind === 'edit'
      ? [...data.weapons, ...data.other].find((item) => item.id === dialog.id)
      : undefined;

  const row = (item: EquipmentItemView) => {
    const attack = isWeapon(item) ? item.attack : null;
    return (
      <ItemRow
        key={item.id}
        name={item.name}
        description={item.description}
        lead={attack?.damage ?? ''}
        onOpen={() => setDialog({ kind: 'edit', id: item.id })}
        after={
          attack !== null && (
            // Short and fixed-width, so it never squeezes the name; the damage goes in the
            // preview line, which cuts off long text (spec §5.2).
            <span className="atk">
              <span className="ab">{abilityOf(attack.ability).short}</span>
              <span className="b">{formatSigned(attack.attackBonus)}</span>
            </span>
          )
        }
      />
    );
  };

  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <button type="button" className="back" onClick={onClose} aria-label="Back to sections">
            {'‹'}
          </button>
          <span className="t">Equipment</span>
        </div>

        {/* Attuned and Equipped are derived views over both lists, so they carry no add button:
            an item joins them by having its toggle set, not by being created in them. */}
        <Block
          name="Attuned Items"
          empty="Nothing attuned"
          items={data.attuned}
          renderRow={row}
          count={String(data.attuned.length)}
          {...block('attuned')}
        />
        <Block
          name="Equipped"
          empty="Nothing equipped"
          items={data.equipped}
          renderRow={row}
          count={String(data.equipped.length)}
          {...block('equipped')}
        />
        <Block
          name="Weapons"
          items={data.weapons}
          renderRow={row}
          count={String(data.weapons.length)}
          onAdd={() => setDialog({ kind: 'new', slot: 'weapons' })}
          {...block('weapons')}
        />
        <Block
          name="Other Equipment"
          items={data.other}
          renderRow={row}
          count={String(data.other.length)}
          onAdd={() => setDialog({ kind: 'new', slot: 'other' })}
          {...block('other')}
        />
      </div>

      {dialog?.kind === 'new' && (
        <NewEquipmentDialog slot={dialog.slot} actions={actions} onClose={close} />
      )}
      {editing && <EditEquipmentDialog item={editing} actions={actions} onClose={close} />}
    </div>
  );
}

/**
 * The attack fields, shared by both weapon dialogs (spec §5.2): the ability first, then — only
 * once one is chosen — the bonus and the damage. How a change is saved differs between the two
 * dialogs, so each passes its own `bonusField` and `damageField`.
 */
function AttackFields({
  attack,
  onAbility,
  bonusField,
  damageField,
}: {
  attack: WeaponAttackView | null;
  onAbility(ability: AbilityKey | null): void;
  bonusField: ReactNode;
  damageField: ReactNode;
}) {
  return (
    <>
      <span className="dlabel mt12">Attack ability</span>
      <AbilityPicker
        label="Attack ability"
        allowNone
        value={attack?.ability ?? null}
        onChange={onAbility}
      />
      {attack === null ? (
        <div className="hint tight">
          Pick the ability you attack with to enter the attack bonus and damage.
        </div>
      ) : (
        <>
          <div className="atkfields">
            <div>
              <span className="dlabel">Attack bonus</span>
              {bonusField}
            </div>
            <div>
              <span className="dlabel">Damage</span>
              {damageField}
            </div>
          </div>
          <div className="hint tight">None clears the attack bonus and damage.</div>
        </>
      )}
    </>
  );
}

function NewEquipmentDialog({
  slot,
  actions,
  onClose,
}: {
  slot: EquipmentSlot;
  actions: EquipmentActions;
  onClose(): void;
}) {
  const weapon = slot === 'weapons';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [attuned, setAttuned] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [attack, setAttack] = useState<WeaponAttackView | null>(null);

  // Mirrors `WeaponBO.setAttackAbility`: a first pick starts at +0 with no damage, a change keeps
  // both, and None clears them — so the dialog behaves exactly like editing afterwards.
  const pickAbility = (ability: AbilityKey | null) =>
    setAttack(
      ability === null
        ? null
        : { ability, attackBonus: attack?.attackBonus ?? 0, damage: attack?.damage ?? '' },
    );

  const create = () => {
    const item = { name: name.trim(), description, attuned, equipped };
    if (weapon) {
      actions.addWeapon({
        ...item,
        attack: attack === null ? null : { ...attack, damage: attack.damage.trim() },
      });
    } else {
      actions.addOther(item);
    }
    onClose();
  };

  return (
    <ResponsiveDialog
      title={weapon ? 'New weapon' : 'New equipment'}
      open
      onClose={onClose}
      footer={
        <button type="button" className="primary" disabled={name.trim() === ''} onClick={create}>
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-equipment-name">
        Name
      </label>
      <input
        id="new-equipment-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {weapon && (
        <AttackFields
          attack={attack}
          onAbility={pickAbility}
          bonusField={
            <NumberField
              label="Attack bonus"
              className="inp stat"
              signed
              value={attack?.attackBonus ?? 0}
              onChange={(attackBonus) => attack && setAttack({ ...attack, attackBonus })}
            />
          }
          damageField={
            // Local state until Create, so typing is never trimmed mid-word; the limit is the
            // schema's, applied here rather than refused on Create.
            <input
              className="inp"
              aria-label="Damage"
              placeholder={DAMAGE_EXAMPLE}
              maxLength={80}
              value={attack?.damage ?? ''}
              onChange={(event) => attack && setAttack({ ...attack, damage: event.target.value })}
            />
          }
        />
      )}
      <label className="dlabel mt12" htmlFor="new-equipment-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="new-equipment-description"
        className={weapon ? 'area brief' : 'area'}
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="chkpair">
        <CheckRow label="Attuned" checked={attuned} onChange={setAttuned} />
        <CheckRow label="Equipped" checked={equipped} onChange={setEquipped} />
      </div>
    </ResponsiveDialog>
  );
}

function EditEquipmentDialog({
  item,
  actions,
  onClose,
}: {
  item: EquipmentItemView;
  actions: EquipmentActions;
  onClose(): void;
}) {
  const weapon = isWeapon(item) ? item : null;

  return (
    <ResponsiveDialog
      title={weapon ? 'Edit weapon' : 'Edit item'}
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={item.name}
          onConfirm={() => {
            actions.removeEquipment(item.id);
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
        value={item.name}
        onCommit={(name) => actions.renameEquipment(item.id, name)}
      />
      {weapon && (
        <AttackFields
          attack={weapon.attack}
          onAbility={(ability) => actions.setWeaponAttackAbility(weapon.id, ability)}
          bonusField={
            <NumberField
              label="Attack bonus"
              className="inp stat"
              signed
              value={weapon.attack?.attackBonus ?? 0}
              onChange={(value) => actions.setWeaponAttackBonus(weapon.id, value)}
            />
          }
          damageField={
            // Commits on blur and Enter, never per keystroke: the setter trims, and trimming
            // "1d8+3 " mid-word would eat the space before "piercing" could follow it.
            <NameField
              label="Damage"
              placeholder={DAMAGE_EXAMPLE}
              value={weapon.attack?.damage ?? ''}
              onCommit={(damage): NameResult => actions.setWeaponAttackDamage(weapon.id, damage)}
            />
          }
        />
      )}
      <label className="dlabel mt12" htmlFor="equipment-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="equipment-description"
        className={weapon ? 'area brief' : 'area'}
        rows={4}
        value={item.description}
        onChange={(event) => actions.setEquipmentDescription(item.id, event.target.value)}
      />
      <div className="chkpair">
        <CheckRow
          label="Attuned"
          checked={item.attuned}
          onChange={(value) => actions.setAttuned(item.id, value)}
        />
        <CheckRow
          label="Equipped"
          checked={item.equipped}
          onChange={(value) => actions.setEquipped(item.id, value)}
        />
      </div>
    </ResponsiveDialog>
  );
}
