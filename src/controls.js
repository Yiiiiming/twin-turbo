export const ACTIONS = Object.freeze(['accelerate', 'brake', 'left', 'right', 'boost', 'rescue']);
export const ACTION_LABELS = Object.freeze({accelerate:'加速',brake:'刹车 / 倒车',left:'向左',right:'向右',boost:'氮气',rescue:'回到赛道'});
export const DEFAULT_BINDINGS = Object.freeze([
  Object.freeze({accelerate:'KeyW',brake:'KeyS',left:'KeyA',right:'KeyD',boost:'ShiftLeft',rescue:'KeyQ'}),
  Object.freeze({accelerate:'ArrowUp',brake:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',boost:'Enter',rescue:'Slash'}),
]);
const STORAGE_KEY = 'twin-turbo-controls-v1';
const fresh = () => DEFAULT_BINDINGS.map(player => ({...player}));
export function allowedKey(code) {
  return /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Enter|NumpadEnter|Numpad(Add|Subtract|Multiply|Divide|Decimal)|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/.test(code || '');
}
export function keyLabel(code) {
  const names = {ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'左 Shift',ShiftRight:'右 Shift',Enter:'Enter',NumpadEnter:'小键盘 Enter',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backquote:'`',NumpadAdd:'小键盘 +',NumpadSubtract:'小键盘 −',NumpadMultiply:'小键盘 ×',NumpadDivide:'小键盘 ÷',NumpadDecimal:'小键盘 .'};
  return names[code] || (/^Numpad/.test(code) ? `小键盘 ${code.slice(6)}` : code?.replace(/^(Key|Digit)/, '') || '—');
}
export class ControlBindings {
  constructor(storage) {
    this.storage = storage; this.bindings = fresh();
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY));
      const codes = saved?.flatMap(player => ACTIONS.map(action => player?.[action]));
      if (saved?.length === 2 && codes?.length === 12 && codes.every(allowedKey) && new Set(codes).size === 12) this.bindings = saved.map(player=>Object.fromEntries(ACTIONS.map(action=>[action,player[action]])));
    } catch {}
  }
  set(player, action, code) {
    if (![1,2].includes(player) || !ACTIONS.includes(action) || !allowedKey(code)) return {ok:false,message:'请选择字母、数字、方向键、Shift、Enter 或标点键；空格和 Esc 留给开始与暂停。'};
    for (let i=0;i<2;i++) for (const other of ACTIONS) {
      if ((i !== player-1 || other !== action) && this.bindings[i][other] === code) return {ok:false,message:`${keyLabel(code)} 已用于 P${i+1} 的${ACTION_LABELS[other]}，请换一个键。`};
    }
    this.bindings[player-1][action] = code;
    return {ok:true,persisted:this.persist()};
  }
  persist() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.bindings)); return Boolean(this.storage); } catch { return false; } }
  reset() { this.bindings = fresh(); return this.persist(); }
  code(player,action) { return this.bindings[player-1][action]; }
  label(player,action) { return keyLabel(this.code(player,action)); }
  recognizes(code) { return this.bindings.some(player=>Object.values(player).includes(code)); }
  frameKeys(pressed, solo=false) {
    const result = new Set();
    for (let i=0;i<2;i++) for (const action of ACTIONS) if(action !== 'rescue' && pressed.has(this.bindings[i][action])) result.add(DEFAULT_BINDINGS[solo ? 0 : i][action]);
    return result;
  }
}
