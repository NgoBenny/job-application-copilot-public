import { describe, expect, it } from 'vitest';
import { classifyProtection } from '../../src/domain/policy';

const c = (label: string, section = 'My Information', extra: { inputType?: string; autocomplete?: string } = {}) => classifyProtection({ label, section, ...extra });

describe('classifyProtection', () => {
  it.each([
    ['Password', 'credential'], ['Verify New Password', 'credential'], ['Enter the verification code', 'credential'], ['One-time passcode', 'credential'],
    ['I agree to the Terms and Conditions', 'attestation'], ['Applicant Privacy Acknowledgement', 'attestation'], ['Would you like to receive communications via SMS and/or WhatsApp to the number provided?', 'attestation'], ['Electronic Signature', 'attestation'], ['I certify that the information is true', 'attestation'],
    ['Are you legally authorized to work in the United States?', 'authorization'], ['Will you now or in the future require sponsorship?', 'authorization'], ['Visa status', 'authorization'],
    ['Gender', 'demographic'], ['Please select your ethnicity', 'demographic'], ['Veteran Status', 'demographic'], ['Disability status', 'demographic'], ['Date of Birth', 'demographic'],
    ['Have you ever been convicted of a felony?', 'legal'], ['Are you subject to a non-compete agreement?', 'legal'],
  ])('%s → %s', (label, want) => expect(c(label)).toBe(want));

  it.each(['First Name', 'Legal Name', 'Email Address', 'Job Title', 'Company', 'How did you hear about us?', 'Language', 'Page', 'Shipping address', 'LinkedIn'])(
    '%s is not protected', (label) => expect(c(label)).toBeUndefined());

  it('uses the input type before the label', () => expect(c('Enter value', 'Create Account', { inputType: 'password' })).toBe('credential'));
  it('uses autocomplete hints', () => expect(c('Code', 'Sign In', { autocomplete: 'one-time-code' })).toBe('credential'));
  it('inherits the section category for bland labels', () => {
    expect(c('Please select', 'Voluntary Disclosures')).toBe('demographic');
    expect(c('Yes', 'Self Identify')).toBe('demographic');
  });
  it('protects every field on sign-in and registration pages', () => {
    expect(c('Email Address', 'Create Account')).toBe('credential');
    expect(c('Email Address', 'Sign In')).toBe('credential');
  });
  it('a specific label beats the section', () => expect(c('I agree', 'Voluntary Disclosures')).toBe('attestation'));
});
