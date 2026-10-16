import { emptyStore, type Store } from '../../../src/domain/schemas';

// Fabricated person. Never put real data in fixtures.
export function sampleStore(): Store {
  const s = emptyStore();
  s.profile.contact = { ...s.profile.contact, firstName: 'Avery', lastName: 'Example', email: 'avery@example.com', phone: '555-0100', city: 'Springfield', country: 'United States' };
  s.profile.links = [{ id: 'link-1', kind: 'github', label: 'GitHub', url: 'https://github.com/avery-example' }];
  s.profile.education = [{ id: 'edu-1', school: 'Example State University', degree: 'BS', major: 'Computer Science', start: '2021-09', end: '2025-05', status: 'completed', gpa: '' }];
  s.profile.employment = [
    { id: 'emp-1', employer: 'Acme Robotics', title: 'Software Engineering Intern', location: 'Springfield', start: '2024-06', end: '2024-08', current: false, bullets: ['Built a test harness'] },
  ];
  s.profile.skills = [{ id: 'sk-1', name: 'TypeScript' }, { id: 'sk-2', name: 'React' }];
  return s;
}
