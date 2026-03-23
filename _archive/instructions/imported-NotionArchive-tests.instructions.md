---
applyTo: "**/*.test.ts,**/*.spec.ts,**/__tests__/**"
---

# Test File Guidelines

When working with test files in this workspace:

## Test Structure

- Use descriptive test names that explain the expected behavior
- Group related tests with `describe` blocks
- Follow the Arrange-Act-Assert pattern
- Keep tests focused and independent

## MCP Integration

When the Tester agent writes tests:
1. Initialize with `memory_agent` (action: init, agent_type: "Tester")
2. Check mode from Coordinator prompt (WRITE or RUN)
3. Use `memory_steps` (action: update) to track progress
4. Call `memory_agent` (action: handoff) then `memory_agent` (action: complete) when done

## Test Coverage Goals

- Cover happy path scenarios
- Cover edge cases and error conditions
- Test integrations with external dependencies (mocked)
- Verify MCP tool responses match expected schemas

## Running Tests

```bash
npm run test        # Run all tests
npm run test:watch  # Watch mode
npm run test:cov    # Coverage report
```
