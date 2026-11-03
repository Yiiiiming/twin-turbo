// This standalone entry point runs before the game and never waits for a race or WebGL.
// The offline edition does not include it. No URLs, referrers or game data are sent.
(() => {
  'use strict';
  const production = 'https://yiiiiming.github.io';
  const endpoint = 'https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site/api/traffic/visit';
  const key = 'twin-turbo.traffic.daily.v1';
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const optedOut = () => navigator.globalPrivacyControl === true ||
    [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack].some(value => value === '1' || value === 'yes');

  if (location.origin !== production || !['/twin-turbo/', '/twin-turbo/index.html'].includes(location.pathname) ||
      optedOut() || navigator.webdriver === true || typeof window.crypto?.randomUUID !== 'function' ||
      typeof window.fetch !== 'function') return;

  const installed = Symbol.for('twin-turbo.traffic.installed');
  if (document[installed]) return;
  document[installed] = true;
  const calendar = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  function chicagoDay() {
    const parts = Object.fromEntries(calendar.formatToParts(new Date()).map(p => [p.type, p.value]));
    return parts.year + '-' + parts.month + '-' + parts.day;
  }
  function dailyBrowser(day) {
    try {
      const storage = window.localStorage;
      const prefix = day + '/';
      const entry = storage.getItem(key) || '';
      if (entry.startsWith(prefix) && uuidV4.test(entry.slice(prefix.length))) return entry.slice(prefix.length);
      const wanted = prefix + window.crypto.randomUUID();
      storage.setItem(key, wanted); // One replaceable daily ID; no cross-day browser identity.
      const actual = storage.getItem(key) || '';
      return actual.startsWith(prefix) && uuidV4.test(actual.slice(prefix.length)) ? actual.slice(prefix.length) : null;
    } catch { return null; } // A blocked store can contribute an opening, but not an estimated unique visitor.
  }
  async function record() {
    if (optedOut()) return;
    const day = chicagoDay();
    const getVisitor = () => day === chicagoDay() ? dailyBrowser(day) : null;
    let visitorId;
    try {
      visitorId = navigator.locks ? await navigator.locks.request(key, getVisitor) : getVisitor();
    } catch { visitorId = getVisitor(); }
    const body = JSON.stringify({day, visitorId, viewId: window.crypto.randomUUID()});
    async function send(retry) {
      if (day !== chicagoDay() || optedOut()) return;
      try {
        const response = await window.fetch(endpoint, {
          method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
          keepalive: true, headers: {'Content-Type': 'application/json'}, body
        });
        if (response.status !== 408 && response.status < 500) return;
      } catch { /* A lost reply can still mean the server counted this view. Reuse the same ID. */ }
      if (!retry) setTimeout(() => { void send(true).catch(() => {}); }, 1200);
    }
    await send(false);
  }
  function onVisible() {
    if (document.visibilityState !== 'visible' || document.prerendering) return;
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('prerenderingchange', onVisible);
    void Promise.resolve().then(record).catch(() => {});
  }
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('prerenderingchange', onVisible);
  onVisible();
})();
