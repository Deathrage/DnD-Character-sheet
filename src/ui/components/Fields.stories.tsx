import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { NameField } from './NameField.js';
import { NumberField } from './NumberField.js';

/**
 * The two fields that carry the business layer's input contract, shown live because what they
 * do is invisible in a static render: `NumberField` keeps half-typed text to itself, and
 * `NameField` commits on blur and keeps a rejected name in the box.
 */
const meta = {
  title: 'Components/Fields',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Numbers: Story = {
  render: function Numbers() {
    const [hp, setHp] = useState(38);
    const [modifier, setModifier] = useState(-1);
    const [dice, setDice] = useState(3);
    return (
      <div className="sv" style={{ maxWidth: 360 }}>
        <div className="sechead-row">
          <span className="sechead static">Unsigned</span>
        </div>
        <div className="hpwrap">
          <NumberField label="Current hit points" value={hp} onChange={setHp} />
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Committed value: <b>{hp}</b>. Clear the box: the value does not change, and tabbing away
          restores it — an empty field is a keystroke, not a zero.
        </div>

        <div className="sechead-row">
          <span className="sechead static">Signed</span>
        </div>
        <div className="hpwrap">
          <NumberField label="Modifier" value={modifier} onChange={setModifier} signed />
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Committed value: <b>{modifier}</b>. A signed field always shows an explicit sign, per
          <code> Model.ts</code>.
        </div>

        <div className="sechead-row">
          <span className="sechead static">With a stepper</span>
        </div>
        <div className="hpwrap">
          <NumberField label="Hit dice remaining" value={dice} onChange={setDice} stepper />
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Committed value: <b>{dice}</b>. Step down to zero and the minus disables itself — an
          unsigned setter throws on a negative, so the button says no before the tap rather than
          after. Type a partial number first, then tap: the step starts from the stored value.
        </div>
      </div>
    );
  },
};

export const Names: Story = {
  render: function Names() {
    const [name, setName] = useState('Rogue (Arcane Trickster)');
    return (
      <div className="sv" style={{ maxWidth: 360 }}>
        <div className="sechead-row">
          <span className="sechead static">Commits on blur</span>
        </div>
        <NameField
          label="Class name"
          value={name}
          onCommit={(next) => {
            if (next.trim() === '') return 'a name must not be empty';
            if (next.trim() === 'Wizard (Evoker)')
              return 'a class named "Wizard (Evoker)" already exists';
            setName(next.trim());
            return null;
          }}
        />
        <div className="hint">
          Committed value: <b>{name}</b>. Type <code>Wizard (Evoker)</code> and blur to see a
          rejection: the message appears and the text you typed stays put.
        </div>
      </div>
    );
  },
};
