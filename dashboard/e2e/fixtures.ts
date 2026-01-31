/**
 * E2E Test Fixtures for Memory Observer Dashboard
 * 
 * Provides reusable test fixtures and page objects for Playwright tests.
 */
import { test as base, expect, Page } from '@playwright/test';

/**
 * Page object model for common dashboard interactions
 */
export class DashboardPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async waitForLoad() {
    // Wait for the app to hydrate and load initial data
    await this.page.waitForSelector('[data-testid="sidebar"]', { timeout: 10000 }).catch(() => {});
    // Alternative: wait for any navigation item
    await this.page.waitForSelector('nav a', { timeout: 10000 });
  }

  async navigateTo(path: string) {
    await this.page.click(`nav a[href="${path}"]`);
    await this.page.waitForURL(`**${path}`);
  }

  async clickWorkspace(name: string) {
    await this.page.click(`text=${name}`);
  }

  async clickPlan(title: string) {
    await this.page.click(`text=${title}`);
  }

  async searchGlobal(query: string) {
    const searchButton = this.page.locator('button:has-text("Search")').or(
      this.page.locator('[data-testid="search-button"]')
    );
    await searchButton.click();
    const searchInput = this.page.locator('input[placeholder*="Search"]');
    await searchInput.fill(query);
    await this.page.keyboard.press('Enter');
  }

  async getSidebarLinks() {
    return this.page.locator('nav a').allTextContents();
  }

  async getPageTitle() {
    return this.page.locator('h1').first().textContent();
  }
}

/**
 * Custom test fixture with DashboardPage
 */
export const test = base.extend<{ dashboardPage: DashboardPage }>({
  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page);
    await use(dashboardPage);
  },
});

export { expect };
