import test from 'node:test';
import assert from 'node:assert/strict';
import { displayNickname, setNicknameText, submissionNickname, limitNicknameInput } from '../src/display-names.js';
import { normalizeName, leaderboardNameKey } from '../src/leaderboard.js';

test('display labels fit twelve Unicode code points including ellipsis and preserve duplicate suffixes',()=>{
  for(const name of ['abcdefghijklmnop','赛车'.repeat(8),'🚗'.repeat(16)]){
    assert.equal(Array.from(displayNickname(name)).length,12);
    assert.equal(displayNickname(name),Array.from(name).slice(0,11).join('')+'…');
    for(const suffix of ['1','2','12']){
      const shown=displayNickname(name,suffix);
      assert.equal(Array.from(shown).length,12);assert.ok(shown.endsWith('…'+suffix));
    }
    assert.equal(normalizeName(name),name,'display policy never changes legacy sixteen-character normalization');
  }
  assert.equal(displayNickname('Emery','2'),'Emery2');
  assert.equal(displayNickname('abcdefghijkl'),'abcdefghijkl');
  assert.equal(leaderboardNameKey('ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰ'),'abcdefghijklmnop');
});

test('short display retains the full name as plain-text hover metadata',()=>{
  const attributes=new Map(),node={setAttribute:(key,value)=>attributes.set(key,value)};
  setNicknameText(node,'abcdefghijklmnop','2');
  assert.equal(node.textContent,'abcdefghij…2');
  assert.equal(attributes.get('title'),'abcdefghijklmnop2');
  assert.equal(attributes.get('translate'),'no');
});

test('new nicknames use twelve Unicode code points while an unchanged legacy identity survives',()=>{
  const legacy='abcdefghijklmnop',newValue='🚗'.repeat(15);
  assert.equal(submissionNickname(newValue),'🚗'.repeat(12));
  assert.equal(submissionNickname('  赛车'.repeat(1)+'手'.repeat(20)),'赛车'+'手'.repeat(10));
  assert.equal(submissionNickname(legacy,legacy),legacy);
  assert.equal(submissionNickname(legacy+'X',legacy),'abcdefghijkl');
  const input={value:legacy};limitNicknameInput(input,legacy);assert.equal(input.value,legacy);
  input.value=newValue;limitNicknameInput(input,legacy);assert.equal(input.value,'🚗'.repeat(12));
});
