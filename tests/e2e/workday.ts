import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { Application } from '../../src/domain/schemas';
import { sampleStore } from '../fixtures/data/profile';

export const ACME = 'http://acme.wd1.myworkdayjobs.com/en-US/External/apply/my-information.html';
export const GLOBEX = 'http://globex.wd5.myworkdayjobs.com/Careers/apply/my-experience.html';
export const INITECH = 'http://wd3.myworkdaysite.com/recruiting/initech/Careers/apply/questions.html';
export const HOOLI = 'http://wd3.myworkdaysite.com/recruiting/hooli/Careers/apply/my-information.html';
export const VISTA_INFO = 'http://vista.wd1.myworkdayjobs.com/careers/apply/my-information.html';
export const VISTA_EXP = 'http://vista.wd1.myworkdayjobs.com/careers/apply/my-experience.html';
export const SUMMIT_EXP = 'http://summit.wd5.myworkdayjobs.com/careers/apply/my-experience.html';
export const SUMMIT_QUESTIONS = 'http://summit.wd5.myworkdayjobs.com/careers/apply/questions.html';
export const LISTING = 'http://acme.wd1.myworkdayjobs.com/en-US/External/job/index.html';

const app = (id: string, employerLabel: string): Application => {
  const now = new Date().toISOString();
  return { id, platformId: 'workday', employerLabel, jobTitle: 'Software Engineer I', jobUrl: '', portalOrigin: '', tenantKey: '', jobDescription: '', persistJobDescription: false, resumeImportMethod: 'none', reviewed: false, skillSelections: [], submittedAt: '', stepsSeen: [], createdAt: now, updatedAt: now };
};

export async function setup(context: BrowserContext, extensionId: string, edit: (s: ReturnType<typeof sampleStore>) => void = () => undefined) {
  const admin = await context.newPage();
  await admin.goto(`chrome-extension://${extensionId}/options.html`);
  const store = { ...sampleStore(), applications: [app('app-acme', 'Acme Robotics'), app('app-globex', 'Globex'), app('app-initech', 'Initech'), app('app-hooli', 'Hooli'), app('app-vista', 'Vista'), app('app-summit', 'Summit')] };
  edit(store);
  await admin.evaluate((text) => chrome.runtime.sendMessage({ type: 'store/import', text }), JSON.stringify(store));
  return admin;
}

export async function openSite(context: BrowserContext, admin: Page, url: string) {
  const site = await context.newPage();
  await site.goto(url);
  const tabId = await admin.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]!.id!, url);
  return { site, tabId };
}

export async function activate(context: BrowserContext, extensionId: string, tabId: number, employer: string) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await popup.getByLabel('Application').selectOption({ label: `${employer} — Software Engineer I` });
  await popup.getByRole('button', { name: /Activate on this tab/ }).click();
  // Wait for the outcome: on a cold service worker, a scan sent right away could beat the activation ("not activated").
  await expect(popup.getByText(/Active on this tab for/).or(popup.getByRole('alert'))).toBeVisible({ timeout: 15_000 });
  return popup;
}

export async function scan(context: BrowserContext, extensionId: string, tabId: number) {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`);
  await panel.getByRole('button', { name: 'Scan this step' }).click();
  return panel;
}

export const pageState = (site: Page) => site.evaluate(() => {
  const c = (window as unknown as { __copilot: { events: string[]; mutations: number; navigated: boolean; values: () => unknown[] } }).__copilot;
  return { events: [...c.events], mutations: c.mutations, navigated: c.navigated, values: c.values() };
});
