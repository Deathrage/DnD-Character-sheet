import { configure } from 'mobx';

/**
 * Side-effect only: imported for what it does at module-load time, not for any binding. Every
 * module that touches the business layer must load this before constructing a `CharacterSheetBO`
 * (see `characterSheet.ts`'s `import './mobxConfig.js';`), so the configuration below is in
 * place before the first `observable(doc)` call.
 *
 * `enforceActions: 'never'` turns off MobX's warning that a write outside an `action()` is
 * disallowed. That warning exists to catch stray mutations in code that is supposed to batch
 * writes through actions — but this layer's design spec forbids MobX annotations on business
 * objects entirely (no `makeAutoObservable`, no `makeObservable`, no decorators, and by
 * extension no `action()` wrapping every setter). The setters on `CharacterSheetBO` and its
 * sibling business objects — `setName`, `setArmorClass`, and the ones later tasks add — already
 * are this layer's write boundary: each one validates through a guard (`trimmedName`,
 * `nonNegativeInt`, ...) before it ever touches `#doc`. Wrapping them in `action()` on top of
 * that would duplicate a guarantee the layer already makes structurally, for no batching benefit
 * — each setter writes exactly one field, so there is nothing to coalesce, and autosave already
 * debounces downstream. `enforceActions: 'never'` tells MobX not to warn about a pattern this
 * layer chose on purpose.
 *
 * This leaves every other MobX strict-mode diagnostic exactly at its default: `configure()`
 * merges only the keys present in the object passed to it, and `computedRequiresReaction`,
 * `reactionRequiresObservable`, and `observableRequiresReaction` — the flags that would warn
 * about reading a computed or observable outside a reactive context — default to `false`
 * (verified against the installed mobx@7.0.3 source, `dist/mobx.cjs.development.js`) and stay
 * that way here. Nothing else is being silenced.
 *
 * If a future task wants `action()`-based batching or devtools/spy tracing, change it here —
 * this is the one place MobX's global behaviour is configured for the whole business layer.
 */
configure({ enforceActions: 'never' });
