import { beforeEach, describe, expect, it } from 'vitest';
import { pickOne, searchSkills } from '../../src/adapters/workday/skills-search';

const never = new AbortController().signal;

/** A tiny skills widget: answers after `delay` ms; `stale` makes it answer with the first query's results forever. */
function widget(options: string[], { delay = 50, stale = false } = {}) {
  document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><span data-automation-id="selectedItem">TypeScript</span><input id="sk"></div>';
  const input = document.getElementById('sk') as HTMLInputElement;
  let first: string | undefined;
  input.addEventListener('input', () => {
    document.querySelector('[role="listbox"]')?.remove();
    const q = (stale ? (first ??= input.value) : input.value).toLowerCase();
    if (!input.value) return;
    setTimeout(() => {
      if (!input.isConnected) return; // a later test replaced the page
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      const hits = options.filter((o) => o.toLowerCase().includes(q));
      ul.innerHTML = hits.length ? hits.map((h) => `<li role="option">${h}</li>`).join('') : '<li>No Items.</li>';
      ul.querySelectorAll('[role="option"]').forEach((li) => li.addEventListener('click', () => {
        input.insertAdjacentHTML('beforebegin', `<span data-automation-id="selectedItem">${li.textContent}</span>`);
        ul.remove();
      }));
      document.body.append(ul);
    }, delay);
  });
  return input;
}

describe('searchSkills', { timeout: 30_000 }, () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('waits for delayed results and selects only an exact match', async () => {
    const input = widget(['React', 'React Native'], { delay: 800 });
    expect(await searchSkills(input, [{ name: 'React', spellings: ['React'] }], never)).toEqual([{ name: 'React', status: 'added', option: 'React' }]);
    expect(input.value).toBe('');
  });

  it('counts a chip the site pre-filled as "(Suggested)" as already there (live 2026-10-16)', async () => {
    const input = widget(['Python', 'Python (Programming Language)']);
    input.insertAdjacentHTML('beforebegin', '<span data-automation-id="selectedItem">Python (Programming Language) (Suggested)</span>');
    expect(await searchSkills(input, [{ name: 'Python', spellings: ['Python'] }], never)).toEqual([{ name: 'Python', status: 'alreadySelected', option: 'Python (Programming Language) (Suggested)' }]);
    expect(document.querySelectorAll('[data-automation-id="selectedItem"]')).toHaveLength(2); // TypeScript from the widget + the suggested one; nothing added
  });

  it('never re-adds a skill that is already selected', async () => {
    const input = widget(['TypeScript']);
    expect(await searchSkills(input, [{ name: 'TS', spellings: ['TS', 'TypeScript'] }], never)).toEqual([{ name: 'TS', status: 'alreadySelected', option: 'TypeScript' }]);
    expect(document.querySelectorAll('[data-automation-id="selectedItem"]')).toHaveLength(1);
  });

  it('confirms "not available" only from an explicit empty answer', async () => {
    const input = widget(['React']);
    expect(await searchSkills(input, [{ name: 'Kubernetes', spellings: ['Kubernetes', 'K8s'] }], never)).toEqual([{ name: 'Kubernetes', status: 'notAvailable' }]);
  });

  it('does not treat a stale list for an older query as an answer', async () => {
    const input = widget(['Java', 'JavaScript'], { stale: true });
    const [java, react] = await searchSkills(input, [{ name: 'Java', spellings: ['Java'] }, { name: 'React', spellings: ['React'] }], never);
    expect(java).toEqual({ name: 'Java', status: 'added', option: 'Java' });
    expect(react).toEqual({ name: 'React', status: 'timedOut' });
  });

  it('stops when cancelled', async () => {
    const input = widget(['React'], { delay: 2000 });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    expect((await searchSkills(input, [{ name: 'React', spellings: ['React'] }, { name: 'Git', spellings: ['Git'] }], ac.signal)).map((o) => o.status)).toEqual(['cancelled', 'cancelled']);
    expect(input.value).toBe('');
  });

  it('works with a widget that searches on keyCode 13 and then clears the box (live Workday)', async () => {
    document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><input id="sk"></div>';
    const input = document.getElementById('sk') as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.keyCode !== 13 || !input.value) return;
      const q = input.value;
      input.value = '';
      setTimeout(() => {
        const ul = document.createElement('ul');
        ul.setAttribute('role', 'listbox');
        ul.innerHTML = ['Git', 'GitHub', 'GitLab'].filter((o) => o.toLowerCase().includes(q.toLowerCase())).map((h) => `<li role="option">${h}</li>`).join('');
        ul.querySelectorAll('[role="option"]').forEach((li) => li.addEventListener('click', () => {
          input.insertAdjacentHTML('beforebegin', `<span data-automation-id="selectedItem">${li.textContent}</span>`);
          ul.remove();
        }));
        document.body.append(ul);
      }, 50);
    });
    expect(await searchSkills(input, [{ name: 'Git', spellings: ['Git'] }], never)).toEqual([{ name: 'Git', status: 'added', option: 'Git' }]);
  });

  it('clicks the inner promptLeafNode when the option row has no click handler (live Workday)', async () => {
    document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><input id="sk"></div>';
    const input = document.getElementById('sk') as HTMLInputElement;
    input.addEventListener('input', () => {
      if (!input.value) return;
      setTimeout(() => {
        const ul = document.createElement('div');
        ul.setAttribute('role', 'listbox');
        ul.innerHTML = '<div role="option" data-automation-id="menuItem"><div data-automation-id="promptLeafNode"><div data-automation-id="promptOption">Git</div></div></div>';
        // Only the leaf reacts; a click on the row itself never reaches it.
        ul.querySelector('[data-automation-id="promptLeafNode"]')!.addEventListener('click', () => input.insertAdjacentHTML('beforebegin', '<span data-automation-id="selectedItem">Git</span>'));
        document.body.append(ul);
      }, 50);
    });
    expect(await searchSkills(input, [{ name: 'Git', spellings: ['Git'] }], never)).toEqual([{ name: 'Git', status: 'added', option: 'Git' }]);
  });

  it("never reads the previous skill's lingering results as this skill's answer (live Workday)", async () => {
    // The box empties on search and the old list stays up ~650ms; the old list mentions the next skill.
    document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><input id="sk"></div>';
    const input = document.getElementById('sk') as HTMLInputElement;
    const results: Record<string, string[]> = { CSS: ['CSS', 'PSD to HTML CSS'], HTML: ['PSD to HTML CSS', 'HTML'] };
    input.addEventListener('keydown', (e) => {
      if (e.keyCode !== 13 || !input.value) return;
      const q = input.value;
      input.value = '';
      setTimeout(() => {
        document.querySelectorAll('[role="listbox"]').forEach((l) => l.remove()); // also earlier tests' late lists
        const ul = document.createElement('ul');
        ul.setAttribute('role', 'listbox');
        ul.innerHTML = results[q]!.map((h) => `<li role="option">${h}</li>`).join('');
        ul.querySelectorAll('[role="option"]').forEach((li) => li.addEventListener('click', () => input.insertAdjacentHTML('beforebegin', `<span data-automation-id="selectedItem">${li.textContent}</span>`)));
        document.body.append(ul);
      }, 300);
    });
    expect(await searchSkills(input, [{ name: 'CSS', spellings: ['CSS'] }, { name: 'HTML', spellings: ['HTML'] }], never))
      .toEqual([{ name: 'CSS', status: 'added', option: 'CSS' }, { name: 'HTML', status: 'added', option: 'HTML' }]);
  });

  /** Rows toggle like Workday's multiselect; `onClick` decides what one click does. */
  function toggling(onClick: (n: number, toggle: () => void) => void) {
    document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><input id="sk"></div>';
    const input = document.getElementById('sk') as HTMLInputElement;
    let clicks = 0;
    const toggle = () => {
      const chip = document.querySelector('[data-automation-id="selectedItem"]');
      if (chip) chip.remove(); else input.insertAdjacentHTML('beforebegin', '<span data-automation-id="selectedItem">JavaScript</span>');
    };
    input.addEventListener('input', () => {
      if (!input.value) return;
      setTimeout(() => {
        document.querySelectorAll('[role="listbox"]').forEach((l) => l.remove());
        const ul = document.createElement('ul');
        ul.setAttribute('role', 'listbox');
        ul.innerHTML = '<li role="option">JavaScript</li>';
        ul.querySelector('li')!.addEventListener('click', () => onClick(++clicks, toggle));
        document.body.append(ul);
      }, 50);
    });
    return input;
  }

  it('keeps a skill that a free-entry box added on Enter, never clicking its ticked row (live QA 2026-10-12, Workday employer 5)', async () => {
    document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><input id="sk"></div>';
    const input = document.getElementById('sk') as HTMLInputElement;
    const chipFor = (t: string) => [...document.querySelectorAll('[data-automation-id="selectedItem"]')].find((c) => c.textContent === t);
    let rowClicks = 0;
    input.addEventListener('keydown', (e) => {
      if (e.keyCode !== 13 || !input.value) return;
      const q = input.value;
      input.value = '';
      input.insertAdjacentHTML('beforebegin', `<span data-automation-id="selectedItem">${q}</span>`);
      setTimeout(() => {
        const ul = document.createElement('ul');
        ul.setAttribute('role', 'listbox');
        ul.innerHTML = `<li role="option" aria-selected="true">${q}</li>`;
        ul.querySelector('li')!.addEventListener('click', () => { rowClicks++; chipFor(q)?.remove(); }); // a click unticks it
        document.body.append(ul);
      }, 50);
    });
    expect(await searchSkills(input, [{ name: 'Python', spellings: ['Python'] }], never)).toEqual([{ name: 'Python', status: 'added', option: 'Python' }]);
    expect(chipFor('Python')).toBeTruthy();
    expect(rowClicks).toBe(0);
  });

  it('stops once the box stops taking skills, instead of waiting on each one (live QA 2026-10-12, Workday employer 5 caps at 25)', async () => {
    const input = widget(['React', 'Rust', 'Ruby', 'Go', 'Java']);
    // Full box: searches still answer, but a click no longer adds a chip.
    let left = 1;
    const block = (e: Event) => { if ((e.target as Element).closest('[role="option"]') && left-- <= 0) e.stopImmediatePropagation(); };
    document.addEventListener('click', block, { capture: true });
    const names = ['React', 'Rust', 'Ruby', 'Go', 'Java'];
    const out = await searchSkills(input, names.map((n) => ({ name: n, spellings: [n] })), never).finally(() => document.removeEventListener('click', block, { capture: true }));
    expect(out.map((o) => o.status)).toEqual(['added', 'full', 'full', 'full', 'full']);
  });

  it('searches and clicks once more when the first click is ignored (live QA 2026-10-12)', async () => {
    const input = toggling((n, toggle) => { if (n > 1) toggle(); });
    expect(await searchSkills(input, [{ name: 'JavaScript', spellings: ['JavaScript'] }], never)).toEqual([{ name: 'JavaScript', status: 'added', option: 'JavaScript' }]);
  });

  it('never clicks again when the first click was only slow, so the skill is not toggled off', async () => {
    // The first click lands only once the extension has given up waiting and searches again.
    const input: HTMLInputElement = toggling((n, toggle) => (n === 1 ? input.addEventListener('input', toggle, { once: true }) : toggle()));
    expect(await searchSkills(input, [{ name: 'JavaScript', spellings: ['JavaScript'] }], never)).toEqual([{ name: 'JavaScript', status: 'added', option: 'JavaScript' }]);
    expect(document.querySelectorAll('[data-automation-id="selectedItem"]')).toHaveLength(1);
  });
});

describe('pickOne: single-choice search boxes (live QA 2026-10-11)', { timeout: 30_000 }, () => {
  // Mirrors a live Field of Study box: Enter searches; one result is chosen by the site itself; chips have a DELETE_charm.
  function box(majors: string[]) {
    document.body.innerHTML = '<div data-automation-id="multiselectInputContainer"><input id="fos"></div>';
    const input = document.getElementById('fos') as HTMLInputElement;
    const choose = (text: string) => {
      input.insertAdjacentHTML('beforebegin', `<div data-automation-id="selectedItem"><div data-automation-id="DELETE_charm"></div><p>${text}</p></div>`);
      const chip = input.previousElementSibling!;
      chip.querySelector('[data-automation-id="DELETE_charm"]')!.addEventListener('click', () => chip.remove());
    };
    input.addEventListener('keydown', (e) => {
      if (e.keyCode !== 13 || !input.value) return;
      const words = input.value.toLowerCase().split(' ');
      input.value = '';
      const hits = majors.filter((m) => words.every((w) => m.toLowerCase().includes(w)));
      setTimeout(() => {
        document.querySelectorAll('[role="listbox"]').forEach((l) => l.remove());
        if (hits.length === 1) return choose(hits[0]!);
        const ul = document.createElement('div');
        ul.setAttribute('role', 'listbox');
        ul.innerHTML = hits.length ? hits.map((h) => `<div role="option"><div data-automation-id="promptLeafNode">${h}</div></div>`).join('') : '<p>No Items.</p>';
        ul.querySelectorAll('[data-automation-id="promptLeafNode"]').forEach((leaf) => leaf.addEventListener('click', () => { choose(leaf.textContent!); ul.remove(); }));
        document.body.append(ul);
      }, 50);
    });
    return input;
  }
  const chips = () => [...document.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => c.textContent);

  it('searches a nested choice by its own name and picks the whole path (live QA 2026-10-12, Workday employer 8)', async () => {
    const input = box(['Job Board: LinkedIn', 'Social Network: LinkedIn']);
    const searched: string[] = [];
    input.addEventListener('keydown', () => searched.push(input.value), { capture: true });
    expect(await pickOne(input, 'Job Board: LinkedIn', never)).toEqual({ ok: true });
    expect(searched).toEqual(['LinkedIn']);
    expect(chips()).toEqual(['Job Board: LinkedIn']);
  });
  it('accepts a wording you kept before when the site lacks the profile one (live QA 2026-10-12)', async () => {
    const input = box(['Computer and Information Science', 'Accounting']);
    expect(await pickOne(input, 'Computer Science\nComputer and Information Science', never)).toEqual({ ok: true });
    expect(chips()).toEqual(['Computer and Information Science']);
  });
  it('prefers the profile wording when the site lists both', async () => {
    const input = box(['Computer Science', 'Computer and Information Science']);
    expect(await pickOne(input, 'Computer Science\nComputer and Information Science', never)).toEqual({ ok: true });
    expect(chips()).toEqual(['Computer Science']);
  });
  it('picks the matching option from several results', async () => {
    const input = box(['Computer Science', 'Computer Engineering']);
    expect(await pickOne(input, 'Computer Science', never)).toEqual({ ok: true });
    expect(chips()).toEqual(['Computer Science']);
  });
  it("removes the site's own pick when it isn't a match, and offers it instead", async () => {
    const input = box(['Computer and Information Science', 'Accounting']);
    expect(await pickOne(input, 'Computer Science', never)).toMatchObject({ ok: false, outcome: 'unsupported', suggestions: ['Computer and Information Science'] });
    expect(chips()).toEqual([]);
  });
  it('keeps a matching pick the site made by itself', async () => {
    const input = box(['Computer Science', 'Accounting']);
    expect(await pickOne(input, 'Computer Science', never)).toEqual({ ok: true });
    expect(chips()).toEqual(['Computer Science']);
  });
  it('offers similar options without picking any', async () => {
    const input = box(['Computer and Information Science', 'Computer Science Education']);
    expect(await pickOne(input, 'Computer Science', never)).toMatchObject({ ok: false, suggestions: ['Computer and Information Science', 'Computer Science Education'] });
    expect(chips()).toEqual([]);
  });
  it('never replaces a different existing choice', async () => {
    const input = box(['Computer Science']);
    input.insertAdjacentHTML('beforebegin', '<div data-automation-id="selectedItem">Accounting</div>');
    expect(await pickOne(input, 'Computer Science', never)).toMatchObject({ ok: false, outcome: 'unsupported' });
    expect(chips()).toEqual(['Accounting']);
  });
});

