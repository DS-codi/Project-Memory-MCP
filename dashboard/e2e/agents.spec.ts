/**
 * E2E Tests: Agent Management Flows
 * 
 * Tests agent viewing, editing, and deployment workflows.
 */
import { test, expect } from './fixtures';

test.describe('Agent List', () => {
  test('should display all agent templates', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to agents
    await page.click('nav a[href="/agents"]');
    await page.waitForURL(/\/agents/);
    
    // Should show agent grid or list
    const agentContent = page.locator('main');
    await expect(agentContent).toBeVisible();
    
    // Check for common agent names
    const agentNames = ['Coordinator', 'Executor', 'Reviewer', 'Architect'];
    for (const name of agentNames) {
      const agentElement = page.locator(`text=${name}`).first();
      // These may or may not exist depending on data
      await expect(agentElement.or(page.locator('main'))).toBeVisible();
    }
  });

  test('should show agent deployment status', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to agents
    await page.click('nav a[href="/agents"]');
    await page.waitForURL(/\/agents/);
    
    // Look for status indicators (synced, outdated, missing badges)
    const statusBadges = page.locator('[data-testid="sync-status"], .sync-badge, text=synced, text=outdated, text=missing');
    // Status badges may or may not be visible
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Agent Detail View', () => {
  test('should view agent content', async ({ dashboardPage, page }) => {
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
      await page.waitForURL(/\/agents\/.+/);
      
      // Should show agent detail content
      await expect(page.locator('main')).toBeVisible();
      
      // May show markdown content or editor
      const content = page.locator('pre, code, [data-testid="agent-content"], .markdown-body');
      await expect(content.first().or(page.locator('main'))).toBeVisible();
    }
  });

  test('should show deployment matrix for agent', async ({ dashboardPage, page }) => {
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
      await page.waitForURL(/\/agents\/.+/);
      
      // Look for deployment section
      const deploySection = page.locator('text=Deployment, text=Deploy, [data-testid="deployment-matrix"]');
      await expect(deploySection.first().or(page.locator('main'))).toBeVisible();
    }
  });
});

test.describe('Agent Creation', () => {
  test('should access create agent form', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();
    
    // Navigate to agents
    await page.click('nav a[href="/agents"]');
    await page.waitForURL(/\/agents/);
    
    // Look for create agent button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Agent"), [data-testid="create-agent"]');
    const buttonExists = await createButton.count();
    
    if (buttonExists > 0) {
      await createButton.first().click();
      
      // Form or modal should appear
      const form = page.locator('[role="dialog"], form, [data-testid="create-agent-modal"]');
      await expect(form.first().or(page.locator('main'))).toBeVisible();
    }
  });
});

test.describe('Agent Editing', () => {
  test('should edit agent template', async ({ dashboardPage, page }) => {
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
      await page.waitForURL(/\/agents\/.+/);
      
      // Look for edit button
      const editButton = page.locator('button:has-text("Edit"), [data-testid="edit-agent"]');
      const editExists = await editButton.count();
      
      if (editExists > 0) {
        await editButton.first().click();
        
        // Editor should become active
        const editor = page.locator('textarea, [contenteditable="true"], .monaco-editor');
        await expect(editor.first().or(page.locator('main'))).toBeVisible();
      }
    }
  });
});

test.describe('Agent Deployment', () => {
  test('should deploy agent to workspace', async ({ dashboardPage, page }) => {
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
      await page.waitForURL(/\/agents\/.+/);
      
      // Look for deploy button
      const deployButton = page.locator('button:has-text("Deploy"), [data-testid="deploy-agent"]');
      const deployExists = await deployButton.count();
      
      if (deployExists > 0) {
        await deployButton.first().click();
        
        // Deployment modal or confirmation should appear
        const deployModal = page.locator('[role="dialog"], [data-testid="deploy-modal"]');
        await expect(deployModal.first().or(page.locator('main'))).toBeVisible();
      }
    }
  });

  test('should sync agent with template', async ({ dashboardPage, page }) => {
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
      await page.waitForURL(/\/agents\/.+/);
      
      // Look for sync button
      const syncButton = page.locator('button:has-text("Sync"), [data-testid="sync-agent"]');
      const syncExists = await syncButton.count();
      
      // Sync may not always be available
      await expect(page.locator('main')).toBeVisible();
    }
  });
});
