// Main-world widget simulation for synthetic fixtures (no real Workday code).
// - [data-controlled] inputs behave like React controlled inputs: state changes only on `input` events,
//   and on blur the element is replaced by a fresh one rendered from state.
// - button[aria-haspopup=listbox][data-options] opens a listbox after a delay, like Workday dropdowns.
// - input[role=combobox][data-options] shows filtered options after typing.
// - button[data-add-record] appends a new empty record from its template.
(() => {
  const state = {};
  window.__copilot = window.__copilot || { events: [], mutations: 0, navigated: false };
  window.__copilot.rerenders = 0;

  document.querySelectorAll('[data-controlled]').forEach((el) => { state[el.id] = el.value; });
  document.addEventListener('input', (e) => { if (e.target.matches?.('[data-controlled]')) state[e.target.id] = e.target.value; }, true);
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!el.matches?.('[data-controlled]')) return;
    setTimeout(() => {
      if (!el.isConnected) return;
      const fresh = el.cloneNode(true);
      fresh.value = state[el.id] ?? '';
      el.replaceWith(fresh);
      window.__copilot.rerenders++;
    }, 50);
  });

  function openList(anchor, options, onPick) {
    document.querySelectorAll('[data-fixture-listbox]').forEach((l) => l.remove());
    setTimeout(() => {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      ul.dataset.fixtureListbox = '';
      ul.id = `listbox-${Math.random().toString(36).slice(2)}`;
      anchor.setAttribute('aria-controls', ul.id);
      for (const text of options) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = text;
        li.addEventListener('click', () => { onPick(text); ul.remove(); });
        ul.append(li);
      }
      document.body.append(ul);
    }, 200);
  }

  document.addEventListener('click', (e) => {
    const button = e.target.closest?.('button[aria-haspopup="listbox"][data-options]');
    if (button) openList(button, button.dataset.options.split('|'), (text) => { button.textContent = text; });
    const add = e.target.closest?.('button[data-add-record]');
    if (add) {
      const section = add.closest('section');
      const n = section.querySelectorAll('[role="group"]').length + 1;
      const tpl = document.getElementById(add.dataset.addRecord).innerHTML.replaceAll('{n}', String(n));
      add.insertAdjacentHTML('beforebegin', tpl);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('[data-fixture-listbox]').forEach((l) => l.remove());
  });
  // Skills multiselect: results arrive after data-skill-delay ms; queries containing data-skill-hang never answer.
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.matches?.('input[data-skill-options]')) return;
    document.querySelectorAll('[data-fixture-skills]').forEach((l) => l.remove());
    const q = input.value.toLowerCase();
    if (!q || (input.dataset.skillHang && q.includes(input.dataset.skillHang))) return;
    setTimeout(() => {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      ul.dataset.fixtureSkills = '';
      ul.id = `skills-${Math.random().toString(36).slice(2)}`;
      input.setAttribute('aria-controls', ul.id);
      const hits = input.dataset.skillOptions.split('|').filter((o) => o.toLowerCase().includes(q));
      if (!hits.length) ul.innerHTML = '<li>No Items.</li>';
      for (const text of hits) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = text;
        li.addEventListener('click', () => {
          const chip = document.createElement('span');
          chip.dataset.automationId = 'selectedItem';
          chip.textContent = text;
          input.before(chip);
          input.value = '';
          ul.remove();
        });
        ul.append(li);
      }
      document.body.append(ul);
    }, Number(input.dataset.skillDelay ?? 300));
  });

  document.addEventListener('input', (e) => {
    const box = e.target;
    if (!box.matches?.('input[role="combobox"][data-options]')) return;
    const q = box.value.toLowerCase();
    const hits = box.dataset.options.split('|').filter((o) => q && o.toLowerCase().includes(q));
    if (hits.length) openList(box, hits, (text) => { box.value = text; box.dispatchEvent(new Event('change', { bubbles: true })); });
  });
})();
