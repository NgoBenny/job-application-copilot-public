// Mimics Greenhouse's React-Select dropdowns closely enough to test against, as seen live on 2026-10-12:
// - focus, key presses and a lone mousedown do NOT open the list; a full pointer sequence (pointerdown → mousedown) does;
// - the open list is linked by aria-controls and holds role=option rows; a click on a row chooses it;
// - the choice shows in .select__single-value, the input only ever holds search text;
// - async lists (School, Location) show rows only after typing at least two letters.
// Each placeholder <div class="select" data-field data-label data-options [data-async] [data-required]> becomes the real markup.

export function install(doc = document) {
  for (const host of doc.querySelectorAll('div.select[data-field]:not([data-built])')) { host.dataset.built = 'true'; build(doc, host); }
}

function build(doc, host) {
  const id = host.dataset.field;
  const options = JSON.parse(host.dataset.options ?? '[]');
  const async = host.dataset.async === 'true';
  const required = host.dataset.required === 'true';
  host.innerHTML = `<div class="select__container"><label id="${id}-label" for="${id}" class="label select__label">${host.dataset.label}${required ? '<span aria-hidden="true">*</span>' : ''}</label>
    <div class="select-shell"><div><div class="select__control"><div class="select__value-container${host.dataset.multi ? ' select__value-container--is-multi' : ''}"><div class="select__placeholder">Select...</div>
    <div class="select__input-container"><input class="select__input" id="${id}" role="combobox" type="text" autocomplete="off" aria-expanded="false" aria-haspopup="true" aria-labelledby="${id}-label" aria-required="${required}" value=""></div></div>
    <div class="select__indicators"><button type="button" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div>
    <input class="requiredInput" tabindex="-1" aria-hidden="true" ${required ? 'required' : ''} value=""></div></div>`;
  const input = host.querySelector('input.select__input');
  const control = host.querySelector('.select__control');
  const shell = host.querySelector('.select-shell');
  let pointerAt = 0;
  let timer;

  const close = () => { shell.querySelector('.select__menu')?.remove(); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-controls'); };
  const render = (typed) => {
    shell.querySelector('.select__menu')?.remove();
    const shownRows = async && typed.length < 2 ? [] : options.filter((o) => o.toLowerCase().includes(typed.toLowerCase()));
    const menu = doc.createElement('div');
    menu.className = 'select__menu';
    menu.innerHTML = `<div class="select__menu-list" role="listbox" id="react-select-${id}-listbox">${shownRows.length
      ? shownRows.map((o, i) => `<div role="option" class="select__option" id="react-select-${id}-option-${i}" aria-selected="false">${o}</div>`).join('')
      : '<div class="select__menu-notice">No options</div>'}</div>`;
    for (const row of menu.querySelectorAll('[role="option"]')) row.addEventListener('click', () => choose(row.textContent));
    shell.append(menu);
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', `react-select-${id}-listbox`);
  };
  const choose = (text) => {
    const box = host.querySelector('.select__value-container');
    if (host.dataset.multi) {
      // Multi-answer: each pick adds a chip and the list stays open.
      box.querySelector('.select__placeholder')?.remove();
      box.insertAdjacentHTML('beforeend', `<div class="select__multi-value"><div class="select__multi-value__label">${text}</div><div class="select__multi-value__remove" role="button" aria-label="Remove ${text}"></div></div>`);
      input.value = '';
      return;
    }
    box.querySelector('.select__placeholder, .select__single-value')?.remove();
    // The phone Country picker shows a flag and the dialling code; the phone widget's button gets the country name.
    const [, name, dial] = /^(.*?)\s*(\+\d+)$/.exec(text) ?? [];
    if (host.dataset.dial && dial) {
      host.closest('fieldset').querySelector('.iti__selected-country').title = name;
      // Like intl-tel-input: a +44 number gets the UK trunk 0 in front, and it stays when you switch back.
      const phone = host.closest('fieldset').querySelector('input[type="tel"]');
      if (dial === '+44' && phone.value && !phone.value.startsWith('0')) phone.value = `0${phone.value}`;
    }
    box.insertAdjacentHTML('afterbegin', host.dataset.dial && dial ? `<div class="select__single-value"><div class="iti__flag"></div><span>${dial}</span></div>` : `<div class="select__single-value">${text}</div>`);
    input.value = '';
    close();
  };

  control.addEventListener('pointerdown', () => { pointerAt = Date.now(); });
  control.addEventListener('mousedown', () => {
    if (Date.now() - pointerAt > 50) return; // a lone synthetic mousedown is ignored, as live
    if (shell.querySelector('.select__menu')) return close(); // pressing an open dropdown closes it
    setTimeout(() => render(input.value), 15); // the live list appears ~13 ms after the press
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => render(input.value), async ? 250 : 0);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
