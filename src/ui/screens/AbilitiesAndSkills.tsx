import { NumberField } from '../components/NumberField.js';
import { ABILITIES, SKILLS } from '../reference.js';
import type { AbilitiesAndSkillsActions, AbilitiesAndSkillsView } from '../types.js';

interface Props {
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
export function AbilitiesAndSkills({ data, actions, onClose }: Props) {
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

        <div className="sechead-row">
          <span className="sechead static">Abilities</span>
        </div>
        <div className="abhead" aria-hidden="true">
          <span>Ability</span>
          <span>Score</span>
          <span>Mod</span>
          <span>Save</span>
        </div>
        {ABILITIES.map((ability) => {
          const value = data.abilities[ability.key];
          return (
            <div className="abrow" key={ability.key}>
              <span className="an">{ability.short}</span>
              <NumberField
                label={`${ability.short} score`}
                value={value.score}
                onChange={(next) => actions.setAbilityScore(ability.key, next)}
              />
              <NumberField
                label={`${ability.short} modifier`}
                value={value.modifier}
                onChange={(next) => actions.setAbilityModifier(ability.key, next)}
                signed
              />
              <div className="savecell">
                <Mark
                  label={`${ability.short} saving throw proficiency`}
                  letter="P"
                  on={value.savingThrowProficient}
                  onChange={(next) => actions.setSavingThrowProficient(ability.key, next)}
                />
                <NumberField
                  label={`${ability.short} saving throw`}
                  value={value.savingThrowModifier}
                  onChange={(next) => actions.setSavingThrowModifier(ability.key, next)}
                  signed
                />
              </div>
            </div>
          );
        })}

        <div className="sechead-row">
          <span className="sechead static">Skills</span>
        </div>
        {SKILLS.map((skill) => {
          const value = data.skills[skill.key];
          return (
            <div className="skrow" key={skill.key}>
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
        })}
      </div>
    </div>
  );
}

/** The wireframe's `.mk` square, as a toggle button so it reads as one to a screen reader. */
function Mark({
  label,
  letter,
  on,
  onChange,
}: {
  label: string;
  letter: string;
  on: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <button
      type="button"
      className={on ? 'mk on' : 'mk'}
      aria-label={label}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      {letter}
    </button>
  );
}
