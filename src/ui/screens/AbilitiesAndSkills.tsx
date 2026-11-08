import { memo } from 'react';
import { usePersistedState } from '../persistedState.js';
import { AbilityRow } from '../components/AbilityRow.js';
import { Mark } from '../components/Mark.js';
import { NumberField } from '../components/NumberField.js';
import { ABILITIES, SKILLS } from '../reference.js';
import type { AbilitiesAndSkillsActions, AbilitiesAndSkillsView, SkillView } from '../types.js';

type BlockKey = 'abilities' | 'skills';

interface Props {
  characterId: string;
  data: AbilitiesAndSkillsView;
  actions: AbilitiesAndSkillsActions;
  onClose(): void;
}

/**
 * Every number on this screen is typed by the player, including the ones a character sheet
 * normally works out for you: a modifier is not derived from its score, a saving throw is not
 * derived from proficiency, and passive perception is not derived from the perception skill.
 * That is the whole point of the app (AGENTS.md) — it is what lets a homebrew feature or a
 * house rule be written down without the sheet arguing.
 *
 * The proficiency and expertise marks are therefore *labels*, not inputs. Ticking P changes
 * nothing else on the row.
 */
export const AbilitiesAndSkills = memo(function AbilitiesAndSkills({
  characterId,
  data,
  actions,
  onClose,
}: Props) {
  // A value means collapsed, as in Equipment; both blocks start open.
  const [collapsed, setCollapsed] = usePersistedState<Partial<Record<BlockKey, boolean>>>(
    `ui:${characterId}:abilities`,
    {},
  );
  const fold = (key: BlockKey, name: string) => (
    <div className="sechead-row">
      <button
        type="button"
        className="sechead"
        onClick={() => setCollapsed({ ...collapsed, [key]: collapsed[key] !== true })}
        aria-expanded={collapsed[key] !== true}
      >
        <span className="caret" aria-hidden="true">
          {collapsed[key] === true ? '▸' : '▾'}
        </span>
        <span className="nmtxt">{name}</span>
      </button>
    </div>
  );
  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <button type="button" className="back" onClick={onClose} aria-label="Back to sections">
            {'‹'}
          </button>
          <span className="t">Abilities &amp; Skills</span>
        </div>

        <div className="topstats">
          <div className="statbox">
            <div className="lbl">Prof. Bonus</div>
            <NumberField
              label="Proficiency bonus"
              className="num big"
              value={data.proficiencyBonus}
              onChange={actions.setProficiencyBonus}
            />
          </div>
          <div className="statbox">
            <div className="lbl">Passive Perc.</div>
            <NumberField
              label="Passive perception"
              className="num big"
              value={data.passivePerception}
              onChange={actions.setPassivePerception}
            />
          </div>
          <div className="statbox">
            <div className="lbl">Speed</div>
            <NumberField
              label="Speed"
              className="num big"
              value={data.speed}
              onChange={actions.setSpeed}
            />
          </div>
        </div>

        {fold('abilities', 'Abilities')}
        {collapsed.abilities !== true && (
          <>
            <div className="abhead" aria-hidden="true">
              <span>Ability</span>
              <span>Score</span>
              <span>Mod</span>
              <span>Save</span>
            </div>
            {ABILITIES.map((ability) => (
              <AbilityRow
                key={ability.key}
                ability={ability}
                value={data.abilities[ability.key]}
                actions={actions}
              />
            ))}
          </>
        )}

        {fold('skills', 'Skills')}
        {collapsed.skills !== true &&
          SKILLS.map((skill) => (
            <SkillRow
              key={skill.key}
              skill={skill}
              value={data.skills[skill.key]}
              actions={actions}
            />
          ))}
      </div>
    </div>
  );
});

const SkillRow = memo(function SkillRow({
  skill,
  value,
  actions,
}: {
  skill: (typeof SKILLS)[number];
  value: SkillView;
  actions: AbilitiesAndSkillsActions;
}) {
  return (
    <div className="skrow">
      <span className="nm">
        <span className="lbl">{skill.label}</span>
        {/* Reference data, not stored — spec §3.2. A label, not an input. */}
        <span className="ab">{skill.ability}</span>
      </span>
      <Mark
        label={`${skill.label} proficiency`}
        letter="P"
        on={value.proficient}
        onChange={(next) => actions.setSkillProficient(skill.key, next)}
      />
      <Mark
        label={`${skill.label} expertise`}
        letter="E"
        on={value.expertise}
        onChange={(next) => actions.setSkillExpertise(skill.key, next)}
      />
      <NumberField
        label={`${skill.label} modifier`}
        className="num sk"
        value={value.modifier}
        onChange={(next) => actions.setSkillModifier(skill.key, next)}
        signed
      />
    </div>
  );
});
