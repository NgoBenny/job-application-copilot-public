// Mimics Ashby's application form widgets as seen live on 2026-10-16:
// - Yes/No questions are two buttons (data-option="yes"/"no") that report the choice with aria-pressed;
//   clicking the pressed one un-presses it; a hidden checkbox mirrors "yes".
// - The location box is a combobox: typing shows a list (appended to <body>, linked by aria-controls) a moment later;
//   clicking a row puts its full text in the box and closes the list.

export function install(doc = document) {
  for (const group of doc.querySelectorAll('.ashby-application-form-input-yesno:not([data-wired])')) {
    group.dataset.wired = 'true';
    const box = group.querySelector('input[type="checkbox"]');
    for (const button of group.querySelectorAll('button[data-option]')) {
      button.addEventListener('click', () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        group.querySelectorAll('button[data-option]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        button.setAttribute('aria-pressed', String(on));
        box.checked = on && button.dataset.option === 'yes';
      });
    }
  }
  for (const input of doc.querySelectorAll('input.ashby-application-form-input-autocomplete:not([data-wired])')) {
    input.dataset.wired = 'true';
    const places = JSON.parse(input.dataset.places ?? '[]');
    let timer;
    const close = () => { doc.getElementById(input.getAttribute('aria-controls') ?? '')?.remove(); input.setAttribute('aria-expanded', 'false'); };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      close();
      if (input.value.length < 2) return;
      timer = setTimeout(() => {
        const list = doc.createElement('div');
        list.id = ':r0:';
        list.setAttribute('role', 'listbox');
        list.innerHTML = places.filter((p) => p.toLowerCase().includes(input.value.toLowerCase()))
          .map((p, i) => `<div role="option" id=":r0:-${i}" aria-selected="false">${p}</div>`).join('');
        list.querySelectorAll('[role="option"]').forEach((o) => o.addEventListener('click', () => { input.value = o.textContent; close(); }));
        doc.body.append(list);
        input.setAttribute('aria-controls', ':r0:');
        input.setAttribute('aria-expanded', 'true');
      }, 200);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
}
