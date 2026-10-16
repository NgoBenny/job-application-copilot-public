// Main-world instrumentation for synthetic fixtures: records every event, DOM mutation and value
// so tests can prove a scan wrote nothing and clicked nothing.
window.__copilot = { events: [], mutations: 0, navigated: false };
for (const type of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup', 'input', 'change', 'focus', 'focusin', 'blur', 'submit']) {
  window.addEventListener(type, (e) => window.__copilot.events.push(`${type}:${e.target?.getAttribute?.('data-automation-id') || e.target?.id || e.target?.tagName}`), true);
}
new MutationObserver((m) => { window.__copilot.mutations += m.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
window.__copilot.values = () => [...document.querySelectorAll('input, textarea, select')].map((el) => (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value));
// A real Next/Submit would navigate; here it only records that it was pressed.
document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-automation-id="bottom-navigation-next-button"], [data-automation-id="submit"]')) window.__copilot.navigated = true;
}, true);
