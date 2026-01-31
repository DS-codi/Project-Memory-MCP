---
applyTo: "**/api/**,**/routes/**,**/server/**"
---

# API Development Guidelines

When working with API routes and server code in this workspace:

## Route Structure

- Group routes by resource (e.g., `/api/plans`, `/api/agents`)
- Use RESTful conventions for CRUD operations
- Return consistent response shapes

## Response Format

```typescript
// Success
{
  success: true,
  data: { ... }
}

// Error
{
  success: false,
  error: "Error message"
}
```

## Error Handling

- Use try/catch blocks in async handlers
- Return appropriate HTTP status codes
- Log errors for debugging
- Sanitize error messages for clients

## MCP Tool Pattern

When implementing MCP tools:
```typescript
export async function toolName(
  params: ParamsType
): Promise<ToolResponse<DataType>> {
  try {
    // Validate params
    // Perform operation
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: message };
  }
}
```

## File Operations

- Use `fs.promises` for async file operations
- Use the `FileLockManager` for concurrent access
- Always handle file-not-found gracefully
