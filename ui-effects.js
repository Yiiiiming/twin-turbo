import { enhanceTrackSelect } from './track-select.js';
import { initLandmarkHologram } from './landmark-hologram.js';

enhanceTrackSelect(document);
initLandmarkHologram(document);

// Subtle three-ring pointer trail, derived from the chosen Canva waiting-room UI.
// Decoration only: never captures input; fades after inactivity while driving.
const stage = document.getElementById('race-stage');
if (stage && typeof window.matchMedia === 'function') {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const trail = document.createElement('div');
  trail.className = 'pointer-orbits';
  trail.setAttribute('aria-hidden', 'true');
  const rings = [0, 1, 2].map(() => {
    const ring = document.createElement('i'); trail.appendChild(ring); return ring;
  });
  stage.appendChild(trail);
  const points = rings.map(() => ({ x: 0, y: 0 }));
  let x = 0, y = 0, frame = 0, previous = 0, lastMove = 0, started = false;
  function hide() { trail.classList.remove('visible'); started = false; if (frame) cancelAnimationFrame(frame); frame = 0; }
  function draw(now) {
    frame = 0;
    if (reduced.matches || document.hidden) { hide(); return; }
    const driving = ['racing', 'countdown'].includes(document.body.dataset.raceState);
    if (driving && now - lastMove > 1500) { hide(); return; }
    const elapsed = Math.min(40, now - previous || 16.7); previous = now;
    let distance = 0;
    points.forEach((point, i) => {
      const amount = 1 - Math.pow(1 - [.28, .17, .095][i], elapsed / 16.7);
      point.x += (x - point.x) * amount; point.y += (y - point.y) * amount;
      rings[i].style.transform = `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%)`;
      distance += Math.abs(point.x - x) + Math.abs(point.y - y);
    });
    if (distance > .2 || driving) frame = requestAnimationFrame(draw);
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !finePointer.matches || reduced.matches) { hide(); return; }
    const host = event.target.closest?.('dialog[open]') || stage;
    if (trail.parentNode !== host) host.appendChild(trail);
    x = event.clientX; y = event.clientY; lastMove = performance.now();
    if (!started) { points.forEach(point => { point.x = x; point.y = y; }); started = true; }
    trail.classList.add('visible');
    if (!frame) frame = requestAnimationFrame(draw);
  }, { passive: true });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('blur', hide);
  function updatePointerMode() {
    document.body.classList.toggle('orbit-cursor', finePointer.matches && !reduced.matches);
    hide();
  }
  reduced.addEventListener?.('change', updatePointerMode);
  finePointer.addEventListener?.('change', updatePointerMode);
  updatePointerMode();
}
