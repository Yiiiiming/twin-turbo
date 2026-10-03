import test from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD_VERSION, LEADERBOARD_LIMIT, LEADERBOARD_CITIES, normalizeCity, normalizeName,
  normalizeEntries, qualifyingRank, insertRecord } from '../leaderboard.js';

const record = (id, timeMs, options = {}) => ({ id, timeMs, name: `车手${id}`,
  laps: 3, city: 'coast', playerId: 1, mode: 'local', createdAt: 1000, ...options });
const result = (timeMs, options = {}) => ({ timeMs, laps: 3, playerId: 1,
  mode: 'local', finished: true, ...options });
const five = () => [100000, 110000, 120000, 130000, 140000].map((time, index) => record(String(index), time));

test('rules carry a version and limit usable by a shared service namespace', () => {
  assert.ok(LEADERBOARD_VERSION.includes('363-517'));
  assert.equal(LEADERBOARD_LIMIT, 5);
});

test('names are trimmed, stripped of control characters, and limited to 16 code points', () => {
  assert.equal(normalizeName(' \n车\u0000手\u007f甲\u200b\t '), '车手甲');
  assert.equal(normalizeName('😀'.repeat(20)), '😀'.repeat(16));
  assert.equal(Array.from(normalizeName('a'.repeat(15) + '😀' + 'b')).length, 16);
  assert.equal(normalizeName(' \u0000\u200b '), '');
  assert.equal(normalizeName('车\ud800手'), '车手');
  for (const value of [null, undefined, 12, {}, []]) assert.equal(normalizeName(value), '');
});

test('normalization tolerates malformed collections and drops invalid records', () => {
  for (const input of [null, undefined, '{}', {}, 1]) assert.deepEqual(normalizeEntries(input), []);
  const valid = record('good', 130000);
  const inputs = [null, [], {}, valid,
    record('nan', NaN), record('infinite', Infinity), record('negative', -1), record('zero', 0),
    record('fraction', 123.4), record('string', '130000'), record('unsafe', Number.MAX_SAFE_INTEGER + 1),
    record('laps', 130000, { laps: 4 }), record('player', 130000, { playerId: 3 }),
    record('mode', 130000, { mode: 'unknown' }), record('date', 130000, { createdAt: -1 }),
    record('name', 130000, { name: '\u0000  ' }), record('', 130000), record('bad\u0000id', 130000)];
  assert.deepEqual(normalizeEntries(inputs), [valid]);
  assert.deepEqual(normalizeEntries([valid], 4), []);
});

test('three and five lap results use independent top-five boards', () => {
  const entries = [];
  for (let index = 0; index < 8; index++) {
    entries.push(record(`three-${index}`, 150000 - index * 1000));
    entries.push(record(`five-${index}`, 250000 - index * 1000, { laps: 5 }));
  }
  const normalized = normalizeEntries(entries);
  assert.equal(normalized.length, 10);
  assert.deepEqual(normalized.map(entry => entry.laps), [3, 3, 3, 3, 3, 5, 5, 5, 5, 5]);
  assert.equal(normalizeEntries(entries, 3)[0].timeMs, 143000);
  assert.equal(normalizeEntries(entries, 5)[0].timeMs, 243000);
  assert.equal(qualifyingRank(entries, result(240000, { laps: 5 })), 1);
  assert.equal(qualifyingRank(entries, result(240000, { laps: 3 })), null);
});

test('ties preserve prior recording order rather than trusting timestamps', () => {
  const earlier = record('old', 130000, { createdAt: 9000 });
  const later = record('new', 130000, { createdAt: 1000 });
  assert.deepEqual(normalizeEntries([earlier, later]).map(entry => entry.id), ['old', 'new']);
  assert.deepEqual(insertRecord([earlier], later).map(entry => entry.id), ['old', 'new']);
});

test('a tie with the fifth existing record cannot displace it', () => {
  const entries = five();
  assert.equal(qualifyingRank(entries, result(140000)), null);
  assert.equal(qualifyingRank(entries, result(139999)), 5);
  assert.equal(qualifyingRank(entries, result(130000)), 5);
  assert.equal(qualifyingRank(entries, result(99999)), 1);
  assert.deepEqual(insertRecord(entries, record('tie', 140000)), entries);
  assert.deepEqual(insertRecord(entries, record('faster', 139999)).map(entry => entry.id), ['0', '1', '2', '3', 'faster']);
});

test('a new record may follow existing ties while unfilled places remain', () => {
  const entries = [record('first', 120000), record('second', 120000)];
  assert.equal(qualifyingRank(entries, result(120000)), 3);
  assert.equal(qualifyingRank([], result(120000)), 1);
});

test('only valid finished results qualify for the name prompt', () => {
  for (const value of [null, undefined, {}, result(0), result(-100), result(NaN), result(Infinity),
    result(123.5), result('123000'), result(120000, { finished: false }), result(120000, { finished: 1 }),
    result(120000, { finished: 'true' }), result(120000, { laps: 1 }), result(120000, { playerId: 3 })]) {
    assert.equal(qualifyingRank([], value), null);
  }
  assert.equal(qualifyingRank([], result(120000, { playerId: 2 })), 1);
});

test('AI opponents never qualify or enter stored leaderboards, but humans in AI mode can', () => {
  assert.equal(qualifyingRank([], result(120000, { mode: 'ai', playerId: 1 })), 1);
  assert.equal(qualifyingRank([], result(120000, { mode: 'ai', playerId: 2 })), null);
  assert.equal(qualifyingRank([], result(120000, { isAI: true })), null);
  assert.equal(qualifyingRank([], result(120000, { isHuman: false })), null);
  assert.deepEqual(normalizeEntries([record('ai', 120000, { mode: 'ai', playerId: 2 })]), []);
  assert.deepEqual(insertRecord([], record('ai', 120000, { mode: 'ai', playerId: 2 })), []);
  assert.equal(insertRecord([], record('human', 120000, { mode: 'ai', playerId: 1 })).length, 1);
});

test('empty names cannot be inserted, and normalized names are the stored values', () => {
  assert.deepEqual(insertRecord([], record('empty', 120000, { name: '\u0000\n ' })), []);
  const inserted = insertRecord([], record('clean', 120000, { name: '  车\t手 A  ' }));
  assert.equal(inserted[0].name, '车手 A');
});

test('records are copied and unknown data is omitted without mutating callers', () => {
  const source = { ...record('a', 120000), name: '  a  ', arbitrary: { nested: true } };
  const entries = Object.freeze([Object.freeze(source)]);
  const normalized = normalizeEntries(entries);
  assert.equal(source.name, '  a  ');
  assert.equal(normalized[0].name, 'a');
  assert.equal('arbitrary' in normalized[0], false);
  assert.notEqual(normalized[0], source);
  const inserted = insertRecord(entries, Object.freeze(record('b', 110000)));
  assert.deepEqual(inserted.map(entry => entry.id), ['b', 'a']);
  assert.equal(entries.length, 1);
});

test('same-ID retries are idempotent, while independent lap boards may reuse an ID', () => {
  const entries = [record('same', 120000)];
  assert.deepEqual(insertRecord(entries, record('same', 100000, { name: 'changed' })), entries);
  assert.deepEqual(normalizeEntries([...entries, record('same', 100000)]), entries);
  assert.equal(insertRecord(entries, record('same', 200000, { laps: 5 })).length, 2);
  assert.equal(insertRecord(entries, record('other', 110000, { name: entries[0].name })).length, 2);
});

test('inserting into one lap category preserves the other category exactly', () => {
  const other = five().map(entry => ({ ...entry, laps: 5 }));
  const inserted = insertRecord([...five(), ...other], record('new', 90000));
  assert.deepEqual(normalizeEntries(inserted, 5), other);
  assert.equal(normalizeEntries(inserted, 3)[0].id, 'new');
});

test('legacy records belong only to coast and city values are strictly validated', () => {
  assert.deepEqual(LEADERBOARD_CITIES, ['coast', 'london']);
  assert.equal(normalizeCity(undefined), 'coast');
  assert.equal(normalizeCity('london'), 'london');
  for (const value of [null, '', 'London', 'unknown', 1, {}, []]) {
    assert.equal(normalizeCity(value), null);
    assert.equal(qualifyingRank([], result(130000, { city: value })), null);
    assert.deepEqual(normalizeEntries([record('bad', 130000, { city: value })]), []);
  }
  const legacy = record('legacy', 130000); delete legacy.city;
  assert.equal(normalizeEntries([legacy], 3)[0].city, 'coast');
  assert.deepEqual(normalizeEntries([legacy], 3, 'london'), []);
  assert.equal('city' in legacy, false, 'normalizing old records does not mutate them');
  assert.deepEqual(normalizeEntries([legacy], 3, 'unknown'), []);
});

test('each city and lap count gets its own top five and qualifications never compare cities', () => {
  const entries = [];
  for (const city of LEADERBOARD_CITIES) for (const laps of [3, 5]) {
    for (let i = 0; i < 7; i++) entries.push(record(`${city}-${laps}-${i}`,
      (city === 'coast' ? 100000 : 350000) + i * 1000 + laps * 1000, { city, laps }));
  }
  for (const city of LEADERBOARD_CITIES) for (const laps of [3, 5]) {
    const ranked = normalizeEntries(entries, laps, city);
    assert.equal(ranked.length, 5);
    assert.ok(ranked.every(entry => entry.city === city && entry.laps === laps));
  }
  assert.equal(qualifyingRank(entries, result(352000, { city: 'london' })), 1);
  assert.equal(qualifyingRank(entries, result(352000, { city: 'coast' })), null);
  assert.ok(normalizeEntries(entries).every(entry => entry.city === 'coast'));
});

test('inserting in London preserves both coast boards and the other London lap board', () => {
  const coast = [...five(), ...five().map(entry => ({ ...entry, laps: 5 }))];
  const londonFive = five().map(entry => ({ ...entry, city: 'london', laps: 5, timeMs: entry.timeMs * 3 }));
  const inserted = insertRecord([...coast, ...londonFive], record('london-new', 350000, { city: 'london' }));
  assert.deepEqual(normalizeEntries(inserted), coast);
  assert.deepEqual(normalizeEntries(inserted, 5, 'london'), londonFive);
  assert.equal(normalizeEntries(inserted, 3, 'london')[0].id, 'london-new');
  assert.equal(inserted.length, 16);
  const retry = insertRecord(inserted, record('london-new', 300000, { city: 'london' }));
  assert.deepEqual(retry, inserted, 'same city/lap/ID remains idempotent');
});
