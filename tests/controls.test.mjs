import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, DEFAULT_BINDINGS, ControlBindings, allowedKey, keyLabel } from '../controls.js';

const memoryStorage = initial => {
  const values = new Map(initial === undefined ? [] : [['twin-turbo-controls-v1', initial]]);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const customMap = [
  { accelerate: 'KeyI', brake: 'KeyK', left: 'KeyJ', right: 'KeyL', boost: 'ShiftRight', rescue: 'KeyU' },
  { accelerate: 'Numpad8', brake: 'Numpad5', left: 'Numpad4', right: 'Numpad6', boost: 'NumpadEnter', rescue: 'Numpad0' },
];

test('custom physical keys translate to all ten engine controls, with rescue handled separately', () => {
  const bindings = new ControlBindings(memoryStorage(JSON.stringify(customMap)));
  const pressed = new Set(customMap.flatMap(player => Object.values(player)));
  assert.deepEqual(bindings.frameKeys(pressed), new Set(DEFAULT_BINDINGS.flatMap(player => ACTIONS.filter(action => action !== 'rescue').map(action => player[action]))));
  assert.deepEqual(bindings.frameKeys(new Set(['KeyU', 'Numpad0'])), new Set());
  assert.deepEqual(bindings.frameKeys(new Set(['KeyW', 'ArrowUp', 'KeyZ'])), new Set(), 'old defaults and unrelated keys cannot drive after remapping');
  assert.equal(bindings.code(1, 'rescue'), 'KeyU'); assert.equal(bindings.code(2, 'rescue'), 'Numpad0');
});

test('solo mode maps either physical control set to the human P1 without driving AI', () => {
  const bindings = new ControlBindings(memoryStorage(JSON.stringify(customMap)));
  const pressed = new Set(customMap.flatMap(player => Object.values(player)));
  assert.deepEqual(bindings.frameKeys(pressed, true), new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']));
  assert.deepEqual(bindings.frameKeys(new Set(Object.values(customMap[1])), true), new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']));
  assert.equal(bindings.recognizes('Numpad8'), true, 'both user control sets remain recognized');
});

test('one changed key persists and restores without mutating the frozen defaults', () => {
  const storage = memoryStorage(), first = new ControlBindings(storage);
  assert.deepEqual(first.set(1, 'accelerate', 'KeyI'), { ok: true, persisted: true });
  const restored = new ControlBindings(storage); assert.equal(restored.code(1, 'accelerate'), 'KeyI');
  assert.equal(restored.recognizes('KeyI'), true); assert.equal(restored.recognizes('KeyW'), false);
  assert.equal(DEFAULT_BINDINGS[0].accelerate, 'KeyW');
  assert.equal(first.reset(), true); assert.deepEqual(new ControlBindings(storage).bindings, DEFAULT_BINDINGS);
  assert.equal(first.code(1, 'accelerate'), 'KeyW'); assert.equal(restored.code(1, 'accelerate'), 'KeyI');
});

test('duplicate keys across both players and invalid player or action never change bindings', () => {
  const storage = memoryStorage(), bindings = new ControlBindings(storage), before = structuredClone(bindings.bindings);
  for (const args of [[1, 'accelerate', 'KeyS'], [1, 'left', 'ArrowLeft'], [2, 'boost', 'KeyQ'], [0, 'left', 'KeyI'], [3, 'left', 'KeyI'], [1, 'fly', 'KeyI']]) {
    assert.equal(bindings.set(...args).ok, false); assert.deepEqual(bindings.bindings, before);
  }
  assert.equal(storage.values.size, 0, 'rejected edits do not write storage');
  assert.equal(bindings.set(1, 'accelerate', 'KeyW').ok, true, 'reselecting the same key is valid');
});

test('reserved keys and key-combination strings are rejected while supported physical codes remain distinct', () => {
  const bindings = new ControlBindings();
  for (const code of ['Space', 'Escape', 'Tab', 'MetaLeft', 'ControlLeft', 'AltRight', 'F5', 'CapsLock', 'Delete', 'Control+KeyA', 'a', '', undefined, null]) {
    assert.equal(allowedKey(code), false, String(code)); assert.equal(bindings.set(1, 'accelerate', code).ok, false);
  }
  for (const code of ['KeyZ', 'Digit7', 'Numpad7', 'ArrowLeft', 'ShiftLeft', 'ShiftRight', 'Enter', 'NumpadEnter', 'NumpadAdd', 'Slash', 'Backquote']) assert.equal(allowedKey(code), true, code);
  assert.equal(bindings.set(1, 'boost', 'ShiftRight').ok, true, 'left and right Shift are separate physical keys');
});

test('corrupt, incomplete, duplicate, and unsupported saved mappings recover a complete default set', () => {
  const duplicate = structuredClone(customMap); duplicate[1].left = duplicate[0].left;
  const reserved = structuredClone(customMap); reserved[0].accelerate = 'Space';
  const incomplete = structuredClone(customMap); delete incomplete[1].rescue;
  for (const raw of ['not json', 'null', '{}', '42', '"text"', '[]', JSON.stringify([customMap[0]]), JSON.stringify(duplicate), JSON.stringify(reserved), JSON.stringify(incomplete)]) {
    const storage = memoryStorage(raw), bindings = new ControlBindings(storage);
    assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS, raw);
    assert.equal(storage.values.get('twin-turbo-controls-v1'), raw, 'loading does not destroy invalid saved data');
  }
});

test('unavailable storage keeps remapping usable for the current session and reset restores defaults', () => {
  const failingStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  for (const storage of [undefined, failingStorage]) {
    const bindings = new ControlBindings(storage); assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
    assert.deepEqual(bindings.set(1, 'accelerate', 'KeyI'), { ok: true, persisted: false });
    assert.deepEqual(bindings.frameKeys(new Set(['KeyI'])), new Set(['KeyW']));
    assert.equal(bindings.reset(), false); assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
  }
});

test('saved mappings ignore extra metadata and key labels distinguish arrows, punctuation and number pads', () => {
  const saved = structuredClone(customMap); saved[0].extra = 'ignored';
  assert.deepEqual(new ControlBindings(memoryStorage(JSON.stringify(saved))).bindings, customMap);
  assert.equal(keyLabel('ArrowUp'), '↑'); assert.equal(keyLabel('KeyI'), 'I'); assert.equal(keyLabel('Digit7'), '7');
  assert.equal(keyLabel('Numpad7'), '小键盘 7'); assert.equal(keyLabel('Slash'), '/'); assert.equal(keyLabel('ShiftRight'), '右 Shift');
  assert.equal(keyLabel('NumpadEnter'), '小键盘 Enter'); assert.equal(keyLabel(undefined), '—');
});
