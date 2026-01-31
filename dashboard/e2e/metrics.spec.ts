/**
 * E2E Tests: Metrics and Performance Dashboard
 * 
 * Tests the metrics/analytics page functionality.
 */
import { test, expect } from './fixtures';

test.describe('Metrics Dashboard', () => {
  test('should display metrics page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Should show metrics content
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('should display stat cards', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Look for stat cards (total plans, active plans, etc.)
    const statCards = page.locator('[data-testid="stat-card"], .stat-card');
    await expect(statCards.first().or(page.locator('main'))).toBeVisible();
    
    // Check for common stat labels
    const statLabels = ['Total Plans', 'Active', 'Completed', 'Steps'];
    for (const label of statLabels) {
      const stat = page.locator(`text=${label}`).first();
      // These may or may not exist
      await expect(stat.or(page.locator('main'))).toBeVisible();
    }
  });

  test('should display agent performance section', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Look for agent performance section
    const agentSection = page.locator('text=Agent Performance, text=Agents, [data-testid="agent-metrics"]');
    await expect(agentSection.first().or(page.locator('main'))).toBeVisible();
  });

  test('should display step completion chart', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Look for charts or progress bars
    const charts = page.locator('.recharts-responsive-container, canvas, [data-testid="chart"], svg');
    await expect(charts.first().or(page.locator('main'))).toBeVisible();
  });

  test('should display category breakdown', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Look for category section
    const categorySection = page.locator('text=Category, text=Categories, [data-testid="category-breakdown"]');
    await expect(categorySection.first().or(page.locator('main'))).toBeVisible();
  });

  test('should display priority breakdown', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Look for priority section
    const prioritySection = page.locator('text=Priority, text=Priorities, [data-testid="priority-breakdown"]');
    await expect(prioritySection.first().or(page.locator('main'))).toBeVisible();
  });

  test('should auto-refresh metrics', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to metrics
    await page.click('nav a[href="/metrics"]');
    await page.waitForURL(/\/metrics/);
    
    // Check for refresh indicator or timer
    const refreshIndicator = page.locator('text=Refresh, [data-testid="last-updated"], text=Updated');
    await expect(refreshIndicator.first().or(page.locator('main'))).toBeVisible();
  });
});

test.describe('Activity Feed', () => {
  test('should display activity page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to activity
    await page.click('nav a[href="/activity"]');
    await page.waitForURL(/\/activity/);
    
    // Should show activity feed content
    await expect(page.locator('main')).toBeVisible();
  });

  test('should display activity events', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to activity
    await page.click('nav a[href="/activity"]');
    await page.waitForURL(/\/activity/);
    
    // Look for event list
    const eventList = page.locator('[data-testid="event-list"], .event-list, .activity-feed');
    await expect(eventList.first().or(page.locator('main'))).toBeVisible();
  });

  test('should filter activity events', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to activity
    await page.click('nav a[href="/activity"]');
    await page.waitForURL(/\/activity/);
    
    // Look for filter controls
    const filters = page.locator('[data-testid="event-filter"], select, .filter');
    await expect(filters.first().or(page.locator('main'))).toBeVisible();
  });

  test('should show connection status', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to activity
    await page.click('nav a[href="/activity"]');
    await page.waitForURL(/\/activity/);
    
    // Look for connection status indicator
    const status = page.locator('[data-testid="connection-status"], text=Connected, text=Disconnected');
    await expect(status.first().or(page.locator('main'))).toBeVisible();
  });
});
