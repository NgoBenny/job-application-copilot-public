import { describe, expect, it } from 'vitest';
import { QuestionMemorySchema } from '../../src/domain/schemas';
import { findAnswer, renderTemplate, sensitiveChoice, sensitiveTopic, type QuestionMemory } from '../../src/domain/questions';

const ctx = { tenantKey: 'https://acme.wd1.myworkdayjobs.com/External', applicationId: 'app-1', employer: 'Acme Robotics', jobTitle: 'SWE I' };
const mem = (over: Partial<QuestionMemory>): QuestionMemory => ({
  id: crypto.randomUUID(), question: 'Are you willing to relocate?', kind: 'choice', answer: 'Yes', options: ['Yes', 'No'], scope: 'global', tenantKey: '', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z', ...over,
});
const yn = ['Yes', 'No'];

describe('findAnswer', () => {
  it('reuses an exact question', () => expect(findAnswer('Are you willing to relocate?', 'choice', yn, [mem({})], ctx)).toMatchObject({ exact: true, answer: 'Yes' }));

  it('proposes similar wording as non-exact', () => expect(findAnswer('Would you be willing to move?', 'choice', yn, [mem({})], ctx)).toMatchObject({ exact: false, answer: 'Yes' }));

  it('never reuses inverted wording', () => {
    expect(findAnswer('Are you unwilling to relocate?', 'choice', yn, [mem({})], ctx)).toEqual({ blocked: expect.stringContaining('reversed') });
    expect(findAnswer('Are you not willing to relocate?', 'choice', yn, [mem({})], ctx)).toEqual({ blocked: expect.stringContaining('reversed') });
  });

  it('skips when the choices changed', () => expect(findAnswer('Are you willing to relocate?', 'choice', ['Yes', 'No', 'Maybe'], [mem({})], ctx)).toEqual({ blocked: expect.stringContaining('choices differ') }));

  it('respects scope: other employers and jobs do not see scoped answers', () => {
    const other = { ...ctx, tenantKey: 'https://globex.wd5.myworkdayjobs.com/Careers', applicationId: 'app-2' };
    const memories = [mem({ question: 'Desired salary', kind: 'text', answer: '100k', scope: 'employer', tenantKey: ctx.tenantKey, options: [] })];
    expect(findAnswer('Desired salary', 'text', undefined, memories, ctx)).toMatchObject({ answer: '100k' });
    expect(findAnswer('Desired salary', 'text', undefined, memories, other)).toBeUndefined();
  });

  it('prefers the narrowest scope, then the latest confirmation', () => {
    const memories = [
      mem({ answer: 'No', confirmedAt: '2026-10-09T00:00:00.000Z' }),
      mem({ answer: 'Yes', scope: 'employer', tenantKey: ctx.tenantKey, confirmedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(findAnswer('Are you willing to relocate?', 'choice', yn, memories, ctx)).toMatchObject({ answer: 'Yes' });
    expect(findAnswer('Are you willing to relocate?', 'choice', yn, [mem({ answer: 'No' }), mem({ answer: 'Yes', confirmedAt: '2026-10-05T00:00:00.000Z' })], ctx)).toMatchObject({ answer: 'Yes' });
  });

  it('never answers a protected question from memory', () => expect(findAnswer('Are you willing to relocate?', 'choice', yn, [mem({})], ctx, 'demographic')).toBeUndefined());

  it('renders templates only from the application', () => {
    expect(renderTemplate('I want to join {{employer}} as {{ jobTitle }}. {{password}}', ctx)).toBe('I want to join Acme Robotics as SWE I. {{password}}');
  });
});

describe('sensitive answers', () => {
  const saved = [{ topic: 'sponsorship' as const, answer: 'No' }, { topic: 'authorizedToWork' as const, answer: 'Yes' }, { topic: 'veteran' as const, answer: 'I am not a protected veteran' }];

  it('needs exactly one clear topic in the label itself', () => {
    expect(sensitiveTopic('Will you now or in the future require visa sponsorship?')).toBe('sponsorship');
    expect(sensitiveTopic('Please select')).toBeUndefined();
    expect(sensitiveTopic('Veteran or disability status')).toBeUndefined();
    expect(sensitiveTopic('Do you not require sponsorship?')).toBeUndefined();
    expect(sensitiveTopic('Indicate your military/veterans status')).toBe('veteran');
    // A government-employment question (live QA 2026-10-12) is not a veteran question.
    expect(sensitiveTopic('Have you ever worked for the U.S. Government (including U.S. military active duty)?')).toBeUndefined();
  });

  it('recognizes "18 or older" questions as their own sensitive topic (live Workday 2026-10-16)', () => {
    const live = 'Are you 18 years or older? If you are under 18, hire is subject to verification that you are of minimum and legal age';
    expect(sensitiveTopic(live)).toBe('over18');
    expect(sensitiveTopic('Are you at least 18 years of age?')).toBe('over18');
    expect(sensitiveTopic('Are you 18 or older?')).toBe('over18');
    expect(sensitiveTopic('How many of your 180 credits are complete?')).toBeUndefined();
    expect(sensitiveChoice(live, 'demographic', ['Yes', 'No'], [{ topic: 'over18', answer: 'Yes' }])).toEqual({ topic: 'over18', option: 'Yes' });
  });

  describe('topic from the choices (CC-305, live QA 2026-10-12)', () => {
    const cc305 = ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'];
    const no = 'No, I do not have a disability and have not had one in the past';
    const answer = [{ topic: 'disability' as const, answer: no }];
    it('takes the topic from choices that name exactly one', () => expect(sensitiveChoice('Please check one of the boxes below', 'demographic', cc305, answer)).toEqual({ topic: 'disability', option: no }));
    it('refuses choices that name two topics', () => expect(sensitiveChoice('Please select', 'demographic', ['I am a veteran', 'I have a disability'], answer)).toBeUndefined());
    it('refuses a label that names a topic it cannot pin down', () => expect(sensitiveChoice('Veteran or disability status', 'demographic', cc305, answer)).toBeUndefined());
    it('never guesses for a closed dropdown', () => expect(sensitiveChoice('Please check one of the boxes below', 'demographic', undefined, answer)).toBeUndefined());
  });

  it('chooses only a visible option matching the saved answer, for the right category', () => {
    expect(sensitiveChoice('Will you require sponsorship?', 'authorization', ['Yes', 'No'], saved)).toEqual({ topic: 'sponsorship', option: 'No' });
    expect(sensitiveChoice('Veteran status', 'demographic', ['I identify as a protected veteran', 'I am not a protected veteran', 'I do not wish to answer'], saved)).toEqual({ topic: 'veteran', option: 'I am not a protected veteran' });
    expect(sensitiveChoice('Will you require sponsorship?', 'authorization', ['Y', 'N'], saved)).toBeUndefined();
    expect(sensitiveChoice('Will you require sponsorship?', 'demographic', ['Yes', 'No'], saved)).toBeUndefined();
    expect(sensitiveChoice('Will you require sponsorship?', 'authorization', ['Yes (I will require sponsorship)', 'No (no sponsorship needed)'], saved)).toBeUndefined();
    expect(sensitiveChoice('Gender', 'demographic', ['Female', 'Male'], saved)).toBeUndefined();
    // Near-miss options never count: exact text only.
    expect(sensitiveChoice('Will you require sponsorship?', 'authorization', ['Yes', 'No, but I will in the future'], saved)).toBeUndefined();
    // Same category, different topic: a sponsorship answer never answers the work-authorization question.
    expect(sensitiveChoice('Are you legally authorized to work here?', 'authorization', ['Yes', 'No'], [{ topic: 'sponsorship', answer: 'No' }])).toBeUndefined();
    // Closed dropdown: the saved answer is proposed and matched against the real options when clicked.
    expect(sensitiveChoice('Will you require sponsorship?', 'authorization', undefined, saved)).toEqual({ topic: 'sponsorship', option: 'No' });
  });
});

describe('remembering a long checkbox list (live QA 2026-10-12, Greenhouse board 2)', () => {
  it('saves an answer whose question has ~80 choices', () => {
    const options = Array.from({ length: 80 }, (_, i) => `Discipline ${i}`);
    const m = { id: '00000000-0000-4000-8000-000000000001', question: 'Undergrad Discipline(s)', kind: 'choice', answer: 'Discipline 5', options, scope: 'global', tenantKey: '', applicationId: '', confirmedAt: '2026-10-13T00:00:00.000Z' };
    expect(QuestionMemorySchema.safeParse(m).success).toBe(true);
  });
});
