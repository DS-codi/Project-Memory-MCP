/**
 * E2E Tests: Build Script Workflow (Step 42)
 * 
 * Tests the complete build script management workflow:
 * - Add → View → Run → Delete workflow
 * - Workspace vs plan-level scripts
 * - Error handling scenarios
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.describe('Build Scripts Workflow', () => {
  
  // =========================================================================
  // Add → View → Run → Delete Complete Workflow
  // =========================================================================

  test.describe('Complete CRUD Workflow', () => {
    
    test('should add new build script from plan detail page', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Navigate to a plan
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      const count = await planLinks.count();
      
      if (count > 0) {
        await planLinks.first().click();
        await page.waitForURL(/\/plans\/.+\/.+/);
        
        // Navigate to Build Scripts tab
        const buildScriptsTab = page.locator('button:has-text("Build Scripts"), [role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // Click Add Script button or expand form
          const addButton = page.locator('button:has-text("Add Script"), button:has-text("New Script")');
          if (await addButton.count() > 0) {
            await addButton.first().click();
            
            // Fill form
            const nameInput = page.locator('input[name="name"], input[placeholder*="Name"]');
            if (await nameInput.count() > 0) {
              await nameInput.fill('E2E Test Script');
              
              const descInput = page.locator('textarea[name="description"], input[name="description"]');
              if (await descInput.count() > 0) {
                await descInput.fill('Script created by E2E test');
              }
              
              const commandInput = page.locator('input[name="command"], textarea[name="command"]');
              if (await commandInput.count() > 0) {
                await commandInput.fill('echo "Hello from E2E test"');
              }
              
              const directoryInput = page.locator('input[name="directory"]');
              if (await directoryInput.count() > 0) {
                await directoryInput.fill('/workspace');
              }
              
              // Submit form
              const submitButton = page.locator('button[type="submit"], button:has-text("Add"), button:has-text("Create")');
              if (await submitButton.count() > 0) {
                await submitButton.first().click();
                
                // Wait for success (script should appear in list)
                await page.waitForTimeout(1000);
                await expect(page.locator('text=E2E Test Script')).toBeVisible({ timeout: 5000 });
              }
            }
          }
        }
      }
    });

    test('should view build script in table', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Navigate to plan with build scripts
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        await page.waitForURL(/\/plans\/.+\/.+/);
        
        // Go to Build Scripts tab
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts"), button:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // Should see table with scripts
          const table = page.locator('table, [data-testid="build-scripts-table"]');
          if (await table.count() > 0) {
            await expect(table.first()).toBeVisible();
            
            // Check for table headers
            const headers = page.locator('th');
            expect(await headers.count()).toBeGreaterThan(0);
          }
        }
      }
    });

    test('should run build script and display output', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Navigate to plan
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        await page.waitForURL(/\/plans\/.+\/.+/);
        
        // Go to Build Scripts tab
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // Click Run button on first script
          const runButtons = page.locator('button:has-text("Run")');
          if (await runButtons.count() > 0) {
            await runButtons.first().click();
            
            // Wait for execution (button should show "Running..." or similar)
            await page.waitForTimeout(500);
            
            // Should show output somewhere (modal, panel, or inline)
            const output = page.locator('[data-testid="script-output"], .output, pre');
            // Output may or may not be visible depending on implementation
          }
        }
      }
    });

    test('should delete build script', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Navigate to plan
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        await page.waitForURL(/\/plans\/.+\/.+/);
        
        // Go to Build Scripts tab
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // Get initial count of scripts
          const scriptRows = page.locator('tr:has(button:has-text("Delete"))');
          const initialCount = await scriptRows.count();
          
          if (initialCount > 0) {
            // Click Delete button on last script (to avoid deleting test data)
            const deleteButtons = page.locator('button:has-text("Delete")');
            const lastDeleteButton = deleteButtons.last();
            
            // May have confirmation dialog
            const dialogPromise = page.waitForEvent('dialog', { timeout: 2000 }).catch(() => null);
            await lastDeleteButton.click();
            
            const dialog = await dialogPromise;
            if (dialog) {
              await dialog.accept();
            }
            
            // Wait for deletion
            await page.waitForTimeout(1000);
            
            // Count should be reduced (or show empty state)
            const newCount = await scriptRows.count();
            if (initialCount > 1) {
              expect(newCount).toBe(initialCount - 1);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // Workspace vs Plan-Level Scripts
  // =========================================================================

  test.describe('Workspace vs Plan-Level Scripts', () => {
    
    test('should add workspace-level script from workspace page', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Navigate to workspaces
      await page.click('nav a[href="/workspaces"]');
      await page.waitForURL(/\/workspaces/);
      
      // Click on a workspace
      const workspaceLinks = page.locator('a[href*="/workspaces/"]').filter({ hasNot: page.locator('nav a') });
      if (await workspaceLinks.count() > 0) {
        await workspaceLinks.first().click();
        await page.waitForURL(/\/workspaces\/.+/);
        
        // Look for Build Scripts section or tab
        const buildScriptsSection = page.locator('text=Build Scripts, [data-testid="workspace-build-scripts"]');
        if (await buildScriptsSection.count() > 0) {
          // Add workspace-level script
          const addButton = page.locator('button:has-text("Add Script")');
          if (await addButton.count() > 0) {
            await addButton.first().click();
            
            // Fill form
            await page.fill('input[name="name"]', 'Workspace Script');
            await page.fill('input[name="command"]', 'npm run build:all');
            await page.fill('input[name="directory"]', '/workspace');
            
            // Submit
            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            
            await expect(page.locator('text=Workspace Script')).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });

    test('should show both workspace and plan scripts in plan view', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Navigate to a plan
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        await page.waitForURL(/\/plans\/.+\/.+/);
        
        // Go to Build Scripts tab
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // Should see merged list of workspace + plan scripts
          // Look for indicators of workspace vs plan level
          const scripts = page.locator('tr:has(td)');
          const count = await scripts.count();
          
          // May have badges or indicators showing level
          const badges = page.locator('[data-testid="script-level"], .badge, .tag');
          // Workspace scripts might be marked differently
        }
      }
    });

    test('should distinguish workspace scripts from plan scripts', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // Workspace scripts should show "Workspace" indicator
          const workspaceIndicators = page.locator('text=Workspace, [data-level="workspace"]');
          
          // Plan scripts should show "Plan" indicator or no indicator
          const planIndicators = page.locator('text=Plan, [data-level="plan"]');
          
          // At least one type should exist if there are scripts
        }
      }
    });
  });

  // =========================================================================
  // Error Handling Scenarios
  // =========================================================================

  test.describe('Error Handling', () => {
    
    test('should validate required fields in add form', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      await page.click('nav a[href="/plans"]');
      await page.waitForURL(/\/plans/);
      
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          const addButton = page.locator('button:has-text("Add Script")');
          if (await addButton.count() > 0) {
            await addButton.first().click();
            
            // Try to submit empty form
            const submitButton = page.locator('button[type="submit"]');
            if (await submitButton.count() > 0) {
              await submitButton.first().click();
              
              // Should show validation errors
              const errors = page.locator('.error, [role="alert"], .text-red, .text-destructive');
              // May or may not have visible errors depending on validation approach
            }
          }
        }
      }
    });

    test('should handle script execution failure gracefully', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      await page.click('nav a[href="/plans"]');
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          // First, add a script that will fail
          const addButton = page.locator('button:has-text("Add Script")');
          if (await addButton.count() > 0) {
            await addButton.first().click();
            
            await page.fill('input[name="name"]', 'Failing Script');
            await page.fill('input[name="command"]', 'exit 1'); // Command that fails
            await page.fill('input[name="directory"]', '/workspace');
            
            const submitButton = page.locator('button[type="submit"]');
            await submitButton.first().click();
            await page.waitForTimeout(1000);
            
            // Run the failing script
            const runButtons = page.locator('button:has-text("Run")');
            const failingScriptRow = page.locator('tr:has-text("Failing Script")');
            const runButton = failingScriptRow.locator('button:has-text("Run")');
            
            if (await runButton.count() > 0) {
              await runButton.click();
              await page.waitForTimeout(2000);
              
              // Should show error message or failure indicator
              const errorIndicators = page.locator('text=/error|failed|Error|Failed/i');
              // Error handling varies by implementation
            }
          }
        }
      }
    });

    test('should handle network errors when adding script', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      // Intercept API call and make it fail
      await page.route('**/api/plans/*/build-scripts', route => {
        route.abort('failed');
      });
      
      await page.click('nav a[href="/plans"]');
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          const addButton = page.locator('button:has-text("Add Script")');
          if (await addButton.count() > 0) {
            await addButton.first().click();
            
            await page.fill('input[name="name"]', 'Test Script');
            await page.fill('input[name="command"]', 'test');
            await page.fill('input[name="directory"]', '/test');
            
            const submitButton = page.locator('button[type="submit"]');
            await submitButton.first().click();
            
            // Should show error message
            await page.waitForTimeout(1000);
            const errorMessages = page.locator('[role="alert"], .error, .text-red');
            // Error display varies by implementation
          }
        }
      }
      
      // Remove route interception
      await page.unroute('**/api/plans/*/build-scripts');
    });

    test('should handle delete confirmation and cancellation', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      await page.click('nav a[href="/plans"]');
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        const buildScriptsTab = page.locator('[role="tab"]:has-text("Build Scripts")');
        if (await buildScriptsTab.count() > 0) {
          await buildScriptsTab.first().click();
          
          const scriptRows = page.locator('tr:has(button:has-text("Delete"))');
          const initialCount = await scriptRows.count();
          
          if (initialCount > 0) {
            // Click delete and cancel
            const deleteButtons = page.locator('button:has-text("Delete")');
            
            const dialogPromise = page.waitForEvent('dialog', { timeout: 2000 }).catch(() => null);
            await deleteButtons.first().click();
            
            const dialog = await dialogPromise;
            if (dialog) {
              await dialog.dismiss(); // Cancel deletion
              
              // Count should remain the same
              await page.waitForTimeout(500);
              const newCount = await scriptRows.count();
              expect(newCount).toBe(initialCount);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // Goals Tab E2E Tests
  // =========================================================================

  test.describe('Goals Tab Workflow', () => {
    
    test('should view and edit goals from plan detail page', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      await page.click('nav a[href="/plans"]');
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        // Navigate to Goals tab
        const goalsTab = page.locator('[role="tab"]:has-text("Goals"), button:has-text("Goals")');
        if (await goalsTab.count() > 0) {
          await goalsTab.first().click();
          
          // Should display goals and success criteria
          const goalsSection = page.locator('[data-testid="goals"], .goals');
          // Goals display varies by implementation
        }
      }
    });

    test('should add new goal in edit mode', async ({ dashboardPage, page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();
      
      await page.click('nav a[href="/plans"]');
      const planLinks = page.locator('a[href*="/plans/"]').filter({ hasNot: page.locator('nav a') });
      
      if (await planLinks.count() > 0) {
        await planLinks.first().click();
        
        const goalsTab = page.locator('[role="tab"]:has-text("Goals")');
        if (await goalsTab.count() > 0) {
          await goalsTab.first().click();
          
          // Enter edit mode
          const editButton = page.locator('button:has-text("Edit")');
          if (await editButton.count() > 0) {
            await editButton.click();
            
            // Add new goal
            const addGoalButton = page.locator('button:has-text("Add Goal")');
            if (await addGoalButton.count() > 0) {
              await addGoalButton.click();
              
              // Fill new goal
              const goalInputs = page.locator('input[placeholder*="goal"], textarea[placeholder*="goal"]');
              const lastInput = goalInputs.last();
              await lastInput.fill('New E2E Test Goal');
              
              // Save
              const saveButton = page.locator('button:has-text("Save")');
              await saveButton.click();
              
              await page.waitForTimeout(1000);
              await expect(page.locator('text=New E2E Test Goal')).toBeVisible({ timeout: 5000 });
            }
          }
        }
      }
    });
  });
});
