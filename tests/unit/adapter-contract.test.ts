import { readFileSync } from 'node:fs';
import { ashby } from '../../src/adapters/ashby';
import { greenhouse } from '../../src/adapters/greenhouse';
import { workday } from '../../src/adapters/workday';
// @ts-expect-error plain JS fixture helper
import { install } from '../fixtures/greenhouse/react-select-like.js';
import { adapters } from '../../src/platform/registry';
import { adapterContract } from '../contract/kit';
import { fakeAdapter } from '../contract/fake-adapter';
import { expect, it } from 'vitest';

it('every registered adapter has a contract fixture below', () => expect(adapters.map((a) => a.id)).toEqual(['workday', 'greenhouse', 'ashby']));

adapterContract('ashby', ashby, {
  url: 'https://jobs.ashbyhq.com/acme/0f1e2d3c-0000-4000-8000-000000000001/application',
  html: readFileSync('tests/fixtures/ashby/acme/0f1e2d3c-0000-4000-8000-000000000001/application.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, ''),
  fillableLabel: 'Email',
  protectedLabel: 'Veteran Status',
});

// The Greenhouse fixture's dropdowns are built by a script; build them once, then hand the kit plain HTML.
const ghDoc = new DOMParser().parseFromString(readFileSync('tests/fixtures/greenhouse/acme/jobs/1001.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, ''), 'text/html');
install(ghDoc);
adapterContract('greenhouse', greenhouse, {
  url: 'https://job-boards.greenhouse.io/acme/jobs/1001',
  html: ghDoc.documentElement.outerHTML,
  fillableLabel: 'Last Name',
  protectedLabel: 'Veteran Status',
});

adapterContract('workday', workday, {
  url: 'https://acme.wd1.myworkdayjobs.com/en-US/External/apply/my-information',
  html: readFileSync('tests/fixtures/workday/acme/en-US/External/apply/my-information.html', 'utf8')
    .replace('</fieldset>', '</fieldset><label for="vet">Veteran Status</label><select id="vet"><option value="">Select One</option><option>No</option></select>'),
  fillableLabel: 'Last Name',
  protectedLabel: 'Veteran Status',
});

adapterContract('test-fake (plain HTML, no Workday code)', fakeAdapter, {
  url: 'https://jobs.fake.test/apply',
  html: '<form><input id="ln" data-label="Last name" data-semantic="contact.lastName" value=""><input id="vet" data-label="Veteran status" value=""><button id="submit">Submit</button></form>',
  fillableLabel: 'Last name',
  protectedLabel: 'Veteran status',
});
