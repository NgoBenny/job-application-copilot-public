// Main-world simulation of behaviour measured on a live Workday tenant (docs/qa/2026-10-10-workday-employer-1.md).
// No real Workday code. Each field keeps a separate *saved* value, committed the way the live site commits it,
// so tests can check what the site would submit, not just what the boxes show. window.__wd.save() lists the
// "Errors Found" a real Save and Continue would report.
(() => {
  const saved = {};
  const wd = (window.__wd = { saved });
  const words = (s) => s.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (options, q) => options.filter((o) => words(q).every((w) => o.toLowerCase().includes(w)));
  const after = (ms, fn) => setTimeout(fn, ms);

  // Progress bar: the "current step N of M" label renders first, the step name later (step-name bug).
  // Live it was a short gap; held for 8s here so a test scan always lands inside it.
  const active = document.querySelector('[data-automation-id="progressBarActiveStep"]');
  if (active?.dataset.stepName) after(8000, () => active.insertAdjacentHTML('beforeend', `<label>${active.dataset.stepName}</label>`));

  // Text fields save on blur only (React onBlur = focusout); typing alone saves nothing (text blur bug).
  document.addEventListener('focusout', (e) => { if (e.target.matches?.('input[data-wd="text"]')) saved[e.target.id] = e.target.value; }, true);

  // Dropdowns: no aria-controls; a new list per open; rows have their own click handler; a chosen list lingers ~100ms.
  document.addEventListener('click', (e) => {
    const button = e.target.closest?.('button[data-wd="dropdown"]');
    if (!button) return;
    after(40, () => {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      for (const text of button.dataset.options.split('|')) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = text;
        li.addEventListener('click', () => { button.textContent = text; saved[button.id] = text; after(100, () => ul.remove()); });
        ul.append(li);
      }
      document.body.append(ul);
    });
  });

  // Dates: a display div before each input; the wrapper saves only when focus has left it
  // (relatedTarget || activeElement), and a month saved without its year is mangled into the year (date bugs).
  for (const wrap of document.querySelectorAll('[data-automation-id="dateInputWrapper"]')) {
    const part = (p) => wrap.querySelector(`input[data-automation-id="dateSection${p}-input"]`);
    const [m, d, y] = [part('Month'), part('Day'), part('Year')]; // the day part is optional (MM/YYYY or MM/DD/YYYY)
    const show = () => {
      wrap.querySelector('[data-automation-id="dateSectionMonth-display"]').textContent = m.value ? m.value.padStart(2, '0') : 'MM';
      if (d) wrap.querySelector('[data-automation-id="dateSectionDay-display"]').textContent = d.value ? d.value.padStart(2, '0') : 'DD';
      wrap.querySelector('[data-automation-id="dateSectionYear-display"]').textContent = y.value || 'YYYY';
    };
    wrap.addEventListener('input', show);
    wrap.addEventListener('focusout', (e) => {
      if (wrap.contains(e.relatedTarget || document.activeElement)) return;
      // Live: month 05 saved without a year became year 2005 with an empty month, in the boxes too.
      if (m.value && !y.value) { y.value = `20${m.value.padStart(2, '0')}`; m.value = ''; show(); }
      const pad = (el) => (el.value ? el.value.padStart(2, '0') : '');
      saved[wrap.id] = d ? `${pad(m)}/${pad(d)}/${y.value}` : `${pad(m)}/${y.value}`;
    });
  }

  // Search-and-pick boxes (Skills, Field of Study): search on Enter with keyCode 13 only, then the box empties;
  // the previous results stay up ~300ms; rows have no handler, their inner promptLeafNode does;
  // a single-choice box picks a lone result by itself; chips have a DELETE_charm (skills and Field of Study bugs).
  const chip = (box, text) => {
    box.insertAdjacentHTML('afterbegin', `<div data-automation-id="selectedItem"><div data-automation-id="DELETE_charm"></div><p>${text}</p></div>`);
    const c = box.firstElementChild;
    c.querySelector('[data-automation-id="DELETE_charm"]').addEventListener('click', () => { c.remove(); saved[box.dataset.field] = chips(box); });
    saved[box.dataset.field] = chips(box);
  };
  const chips = (box) => [...box.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => c.textContent.trim());
  document.addEventListener('keydown', (e) => {
    const input = e.target.closest?.('input[data-wd="search"]');
    if (!input || e.keyCode !== 13 || !input.value) return;
    const box = input.closest('[data-automation-id="multiselectInputContainer"]');
    const found = hits(input.dataset.options.split('|'), input.value);
    input.value = '';
    after(300, () => {
      document.querySelectorAll(`[data-results-for="${input.id}"]`).forEach((l) => l.remove());
      if (input.dataset.multi !== 'true' && found.length === 1) return chip(box, found[0]);
      const list = document.createElement('div');
      list.setAttribute('role', 'listbox');
      list.dataset.resultsFor = input.id;
      list.innerHTML = found.length ? found.map((t) => `<div role="option" data-automation-id="menuItem"><div data-automation-id="promptLeafNode"><p>${t}</p></div></div>`).join('') : '<p>No Items.</p>';
      list.querySelectorAll('[data-automation-id="promptLeafNode"]').forEach((leaf) => leaf.addEventListener('click', () => {
        chip(box, leaf.textContent.trim());
        if (input.dataset.multi !== 'true') list.remove();
      }));
      document.body.append(list);
    });
  });

  // Add Another: appends one empty record from the section's template.
  document.addEventListener('click', (e) => {
    const add = e.target.closest?.('button[data-wd-add]');
    if (!add) return;
    const section = add.closest('[role="group"]');
    const n = section.querySelectorAll(':scope > [role="group"]').length + 1;
    add.insertAdjacentHTML('beforebegin', document.getElementById(add.dataset.wdAdd).innerHTML.replaceAll('{n}', String(n)));
  });

  // Checkboxes (e.g. terms) save their ticked state on change.
  document.addEventListener('change', (e) => { if (e.target.matches?.('input[type="checkbox"][data-wd="check"]')) saved[e.target.id] = e.target.checked; });

  // What a real Save and Continue would report.
  wd.save = () => [...document.querySelectorAll('[data-required]')].flatMap((el) => {
    const v = saved[el.id] ?? saved[el.dataset.field];
    const label = el.dataset.required;
    if (el.matches('[data-automation-id="dateInputWrapper"]')) return /^\d{2}(\/\d{2})?\/\d{4}$/.test(v ?? '') ? [] : [`Invalid Date: ${label} (${v ?? 'empty'})`];
    return v && (!Array.isArray(v) || v.length) ? [] : [`${label} is required`];
  });
})();
