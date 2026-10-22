// Subtle three-ring pointer trail, derived from the chosen Canva waiting-room UI.
// Decoration only: no input capture and no work during a running race.
const stage = document.getElementById('race-stage');
if (stage && typeof window.matchMedia === 'function') {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    if (reduced.matches || document.hidden || ['racing', 'countdown'].includes(document.body.dataset.raceState)) { hide(); return; }
    const elapsed = Math.min(40, now - previous || 16.7); previous = now;
    let distance = 0;
    points.forEach((point, i) => {
      const amount = 1 - Math.pow(1 - [.28, .17, .095][i], elapsed / 16.7);
      point.x += (x - point.x) * amount; point.y += (y - point.y) * amount;
      rings[i].style.transform = `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%)`;
      distance += Math.abs(point.x - x) + Math.abs(point.y - y);
    });
    if (now - lastMove > 1500) trail.classList.remove('visible');
    if (distance > .2 || now - lastMove <= 1800) frame = requestAnimationFrame(draw);
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reduced.matches || ['racing', 'countdown'].includes(document.body.dataset.raceState)) { hide(); return; }
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
  reduced.addEventListener?.('change', hide);
}
