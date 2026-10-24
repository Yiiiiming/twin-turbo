import { normalizeName } from './leaderboard.js';

export const NICKNAME_LIMIT = 12;

/** Presentation only. Leave persisted names and lookup identity unchanged. */
export function displayNickname(value, suffix = '') {
  const name=typeof value==='string'?value:'',tail=String(suffix),letters=Array.from(name);
  const room=Math.max(0,NICKNAME_LIMIT-Array.from(tail).length);
  if(letters.length<=room)return name+tail;
  return letters.slice(0,Math.max(0,room-1)).join('')+'…'+tail;
}
export function setNicknameText(node,value,suffix=''){
  const full=String(value||'')+suffix;
  node.textContent=displayNickname(value,suffix);
  node.setAttribute('title',full);
  node.setAttribute('translate','no');
  return node;
}
/** Unchanged legacy prefill is an existing identity, not a new nickname. */
export function submissionNickname(value,legacyName=''){
  if(legacyName&&value===legacyName)return normalizeName(legacyName);
  return Array.from(normalizeName(value)).slice(0,NICKNAME_LIMIT).join('');
}
export function limitNicknameInput(input,legacyName=''){
  if(legacyName&&input.value===legacyName)return;
  input.value=Array.from(input.value).slice(0,NICKNAME_LIMIT).join('');
}
