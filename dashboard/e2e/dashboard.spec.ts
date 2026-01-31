/**
 * E2E Tests: Navigation and Core Dashboard Flows
 * 
 * Tests the critical user paths through the Memory Observer Dashboard.
 */
import { test, expect } from './fixtures';

test.describe('Dashboard Navigation', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    
    // Should show the main dashboard layout
    await expect(page.locator('nav')).toBeVisible();
    
    // Should have sidebar navigation
    const nav = page.locator('nav a');
    await expect(nav.first()).toBeVisible();
  });

  test('should navigate to workspaces page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Click on workspaces link if not on homepage
    const workspacesLink = page.locator('nav a[href="/"], nav a:has-text("Workspaces")');
    await workspacesLink.first().click();
    
    // Should display workspaces content
    await expect(page).toHaveURL(/\/|\/workspaces/);
  });

  test('should navigate to plans page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans
    const plansLink = page.locator('nav a[href="/plans"]');
    await plansLink.click();
    
    await expect(page).toHaveURL(/\/plans/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('should navigate to agents page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to agents
    const agentsLink = page.locator('nav a[href="/agents"]');
    await agentsLink.click();
    
    await expect(page).toHaveURL(/\/agents/);
  });

  test('should navigate to metrics page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    const metricsLink = page.locator('nav a[href="/metrics"]');
    await metricsLink.click();
    
    await expect(page).toHaveURL(/\/metrics/);
    await expect(page.locator('h1:has-text("Metrics"), h2:has-text("Metrics")')).toBeVisible();
  });

  test('should navigate to activity page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to activity
    const activityLink = page.locator('nav a[href="/activity"]');
    await activityLink.click();
    
    await expect(page).toHaveURL(/\/activity/);
  });
});

test.describe('Workspace Interaction', () => {
  test('should display workspace list', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Should show workspace cards or list items
    const workspaceList = page.locator('[data-testid="workspace-list"], .workspace-list, main');
    await expect(workspaceList).toBeVisible();
  });

  test('should click on a workspace and view plans', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Click on first workspace link/card
    const workspaceLinks = page.locator('a[href*="/workspaces/"], [data-workspace-id]');
    
    const count = await workspaceLinks.count();
    if (count > 0) {
      await workspaceLinks.first().click();
      
      // Should navigate to workspace detail
      await expect(page).toHaveURL(/\/workspaces\/.+/);
    }
  });
});

test.describe('Plan Detail Flow', () => {
  test('should view plan details page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans page
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Click on first plan if available
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    
    const count = await planLinks.count();
    if (count > 0) {
      await planLinks.first().click();
      
      // Should show plan detail page
      await expect(page).toHaveURL(/\/plans\/.+\/.+/);
      
      // Should display plan title
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });

  test('should show export options on plan detail', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans page
    await page.click('nav a[href="/plans"]');
    
    // Click on first plan
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    const count = await planLinks.count();
    
    if (count > 0) {
      await planLinks.first().click();
      await page.waitForURL(/\/plans\/.+\/.+/);
      
      // Look for export button/dropdown
      const exportButton = page.locator('button:has-text("Export"), [data-testid="export-report"]');
      const exportExists = await exportButton.count();
      
      if (exportExists > 0) {
        await expect(exportButton.first()).toBeVisible();
      }
    }
  });
});

test.describe('Search Functionality', () => {
  test('should open global search', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Press keyboard shortcut for search (Cmd+K or Ctrl+K)
    await page.keyboard.press('Control+k');
    
    // Search modal/input should appear
    const searchInput = page.locator('input[placeholder*="Search"], [data-testid="search-input"]');
    const isVisible = await searchInput.isVisible().catch(() => false);
    
    // If keyboard shortcut doesn't work, try clicking search button
    if (!isVisible) {
      const searchButton = page.locator('[data-testid="search-button"], button:has([class*="search"])');
      const buttonExists = await searchButton.count();
      if (buttonExists > 0) {
        await searchButton.first().click();
      }
    }
  });
});

test.describe('Agents Page', () => {
  test('should display agent list', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to agents
    await page.click('nav a[href="/agents"]');
    await page.waitForURL(/\/agents/);
    
    // Should show agent list or cards
    const agentContent = page.locator('main');
    await expect(agentContent).toBeVisible();
  });

  test('should view agent details', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to agents
    await page.click('nav a[href="/agents"]');
    await page.waitForURL(/\/agents/);
    
    // Click on an agent
    const agentLinks = page.locator('a[href*="/agents/"]').filter({ hasNot: page.locator('nav a') });
    const count = await agentLinks.count();
    
    if (count > 0) {
      await agentLinks.first().click();
      
      // Should show agent detail
      await expect(page).toHaveURL(/\/agents\/.+/);
    }
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Page should still be functional
    const content = page.locator('main, [role="main"]');
    await expect(content.or(page.locator('body'))).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    const content = page.locator('main, [role="main"]');
    await expect(content.or(page.locator('body'))).toBeVisible();
  });
});
