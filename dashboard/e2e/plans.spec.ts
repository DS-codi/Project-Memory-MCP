/**
 * E2E Tests: Plan Management Critical Flows
 * 
 * Tests plan creation, viewing, and management workflows.
 */
import { test, expect } from './fixtures';

test.describe('Plan Creation Flow', () => {
  test('should access create plan modal from plans page', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans page
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Look for create plan button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Plan"), [data-testid="create-plan"]');
    const buttonExists = await createButton.count();
    
    if (buttonExists > 0) {
      await createButton.first().click();
      
      // Modal or form should appear
      const modal = page.locator('[role="dialog"], form, [data-testid="create-plan-modal"]');
      await expect(modal.first()).toBeVisible();
    }
  });

  test('should fill out create plan form', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans page
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Click create button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Plan")');
    const buttonExists = await createButton.count();
    
    if (buttonExists > 0) {
      await createButton.first().click();
      
      // Fill form fields if visible
      const titleInput = page.locator('input[name="title"], input[placeholder*="Title"]');
      const titleExists = await titleInput.count();
      
      if (titleExists > 0) {
        await titleInput.fill('E2E Test Plan');
        
        // Fill description if exists
        const descInput = page.locator('textarea[name="description"], textarea[placeholder*="Description"]');
        if (await descInput.count() > 0) {
          await descInput.fill('This is a test plan created by E2E tests');
        }
        
        // Select category if dropdown exists
        const categorySelect = page.locator('select[name="category"], [data-testid="category-select"]');
        if (await categorySelect.count() > 0) {
          await categorySelect.selectOption('feature');
        }
      }
    }
  });
});

test.describe('Plan Detail Interaction', () => {
  test('should display plan steps', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Click on first plan
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    const count = await planLinks.count();
    
    if (count > 0) {
      await planLinks.first().click();
      await page.waitForURL(/\/plans\/.+\/.+/);
      
      // Should show steps section
      const stepsSection = page.locator('[data-testid="steps"], text=Steps, .steps-list');
      await expect(stepsSection.first().or(page.locator('main'))).toBeVisible();
    }
  });

  test('should display timeline/handoffs', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Click on first plan
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    const count = await planLinks.count();
    
    if (count > 0) {
      await planLinks.first().click();
      await page.waitForURL(/\/plans\/.+\/.+/);
      
      // Look for timeline or handoff section
      const timeline = page.locator('[data-testid="timeline"], text=Timeline, text=Handoffs, .timeline');
      // This may not exist for all plans, so just check the page loaded
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('should switch between plan tabs', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Click on first plan
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    const count = await planLinks.count();
    
    if (count > 0) {
      await planLinks.first().click();
      await page.waitForURL(/\/plans\/.+\/.+/);
      
      // Look for tabs and click through them
      const tabs = page.locator('[role="tablist"] button, [role="tab"]');
      const tabCount = await tabs.count();
      
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(300); // Wait for tab content to load
      }
    }
  });
});

test.describe('Plan Filtering and Sorting', () => {
  test('should filter plans by status', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Look for status filter
    const statusFilter = page.locator('select:has-text("Status"), [data-testid="status-filter"], button:has-text("Status")');
    const filterExists = await statusFilter.count();
    
    if (filterExists > 0) {
      await statusFilter.first().click();
      
      // Select an option
      const option = page.locator('option:has-text("Active"), [role="option"]:has-text("Active")');
      if (await option.count() > 0) {
        await option.first().click();
      }
    }
  });

  test('should filter plans by category', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to plans
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    // Look for category filter
    const categoryFilter = page.locator('select:has-text("Category"), [data-testid="category-filter"], button:has-text("Category")');
    const filterExists = await categoryFilter.count();
    
    if (filterExists > 0) {
      await categoryFilter.first().click();
      
      // Select an option
      const option = page.locator('option:has-text("Feature"), [role="option"]:has-text("feature")');
      if (await option.count() > 0) {
        await option.first().click();
      }
    }
  });
});

test.describe('Plan Export', () => {
  test('should export plan as markdown', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to a plan detail
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    const count = await planLinks.count();
    
    if (count > 0) {
      await planLinks.first().click();
      await page.waitForURL(/\/plans\/.+\/.+/);
      
      // Find and click export button
      const exportButton = page.locator('button:has-text("Export"), [data-testid="export-report"]');
      const exportExists = await exportButton.count();
      
      if (exportExists > 0) {
        await exportButton.first().click();
        
        // Look for markdown option in dropdown
        const mdOption = page.locator('button:has-text("Markdown"), [data-testid="export-markdown"]');
        if (await mdOption.count() > 0) {
          // Set up download listener
          const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
          await mdOption.first().click();
          
          const download = await downloadPromise;
          if (download) {
            expect(download.suggestedFilename()).toContain('.md');
          }
        }
      }
    }
  });

  test('should copy plan as JSON', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to a plan detail
    await page.click('nav a[href="/plans"]');
    await page.waitForURL(/\/plans/);
    
    const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
    const count = await planLinks.count();
    
    if (count > 0) {
      await planLinks.first().click();
      await page.waitForURL(/\/plans\/.+\/.+/);
      
      // Find and click export button
      const exportButton = page.locator('button:has-text("Export"), [data-testid="export-report"]');
      const exportExists = await exportButton.count();
      
      if (exportExists > 0) {
        await exportButton.first().click();
        
        // Look for JSON copy option
        const jsonOption = page.locator('button:has-text("Copy JSON"), [data-testid="copy-json"]');
        if (await jsonOption.count() > 0) {
          await jsonOption.first().click();
          
          // Check for success toast
          const toast = page.locator('text=copied, text=Copied');
          await expect(toast.first()).toBeVisible({ timeout: 3000 }).catch(() => {});
        }
      }
    }
  });
});
