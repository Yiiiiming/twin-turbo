// Keep the existing select as the data source; all visible controls belong to
// the game so the operating system cannot replace the menu's appearance.
export function enhanceTrackSelect(document) {
  const select = document.getElementById('records-track-choice');
  const trigger = document.getElementById('records-track-trigger');
  const list = document.getElementById('records-track-options');
  const label = document.getElementById('records-track-value');
  const panel = document.getElementById('records-center');
  if (!select || !trigger || !list || !label || !panel) return;
  const wrapper = trigger.parentElement, view = document.defaultView;
  let active = 0, items = [], search = '', searchedAt = 0;
  function close() {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    search = '';
  }
  function highlight(index, scroll = true) {
    active = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((item, i) => item.classList.toggle('is-active', i === active));
    if (items[active] && !list.hidden) {
      trigger.setAttribute('aria-activedescendant', items[active].id);
      if (scroll) items[active].scrollIntoView({ block: 'nearest' });
    }
  }
  function sync() {
    const options = Array.from(select.options);
    const selected = options.findIndex(option => option.value === select.value);
    label.textContent = options[selected]?.textContent || '';
    trigger.disabled = select.disabled || !options.length;
    items = options.map((option, index) => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'track-select-option';
      item.id = `records-track-option-${index}`;
      item.tabIndex = -1;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === selected));
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      item.addEventListener('pointermove', () => highlight(index, false));
      // Keep DOM focus on the combobox for keyboard and assistive navigation.
      item.addEventListener('mousedown', event => event.preventDefault());
      item.addEventListener('click', () => choose(index));
      return item;
    });
    list.replaceChildren(...items);
    highlight(selected < 0 ? 0 : selected, false);
  }
  function fit() {
    if (list.hidden) return;
    const bounds = trigger.getBoundingClientRect();
    const bottom = Math.min(panel.getBoundingClientRect().bottom, view.innerHeight);
    wrapper.style.setProperty('--track-menu-height', `${Math.max(44, bottom - bounds.bottom - 24)}px`);
  }
  function open() {
    sync();
    if (trigger.disabled) return;
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    fit(); highlight(active);
  }
  function choose(index) {
    const option = select.options[index];
    if (!option || option.disabled) return;
    const changed = select.value !== option.value;
    select.value = option.value;
    close(); sync(); trigger.focus({ preventScroll: true });
    if (changed) select.dispatchEvent(new view.Event('change', { bubbles: true }));
  }
  trigger.addEventListener('click', () => list.hidden ? open() : close());
  trigger.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') {
      if (!list.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const wasClosed = list.hidden;
      if (wasClosed) open();
      if (event.key === 'Home') highlight(0);
      else if (event.key === 'End') highlight(items.length - 1);
      else if (!wasClosed && event.key === 'ArrowDown') highlight(active + 1);
      else if (!wasClosed && event.key === 'ArrowUp') highlight(active - 1);
      else if (!wasClosed && ['Enter', ' '].includes(event.key)) choose(active);
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault(); event.stopPropagation();
      const now = Date.now(); search = now - searchedAt > 700 ? event.key : search + event.key;
      searchedAt = now;
      if (list.hidden) open();
      const start = search.length === 1 ? active + 1 : active;
      for (let n = 0; n < items.length; n++) {
        const index = (start + n) % items.length;
        if (items[index].textContent.toLocaleLowerCase().startsWith(search.toLocaleLowerCase())) { highlight(index); break; }
      }
    }
  });
  document.addEventListener('pointerdown', event => { if (!wrapper.contains(event.target)) close(); });
  wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
  select.addEventListener('change', sync);
  new view.MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true });
  new view.MutationObserver(() => { close(); sync(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  view.addEventListener('resize', fit);
  panel.addEventListener('scroll', fit, { passive: true });
  select.hidden = true; trigger.hidden = false; sync();
}
