---
name: mvc-architecture
description: "Use this skill when implementing Model-View-Controller architecture. Covers core MVC principles, layer separation, dependency injection, event-driven communication, and patterns for controllers, models, and views."
---

# MVC Architecture Guidelines

This document provides guidelines for implementing and maintaining a Model-View-Controller (MVC) architecture in your codebase.

## Core Principles

### 1. Separation of Concerns
- **Models**: Data structures, business logic, and state management
- **Views**: UI components and presentation logic
- **Controllers**: Request handling, orchestration, and data flow

### 2. Directory Structure

```
src/
├── models/           # Data models and business logic
│   ├── types/       # Type definitions
│   ├── entities/    # Domain entities
│   ├── services/    # Business logic services
│   └── repositories/ # Data access layer
│
├── views/            # UI components
│   ├── components/  # Reusable UI components
│   ├── pages/       # Page-level components
│   ├── layouts/     # Layout components
│   └── styles/      # Stylesheets
│
├── controllers/      # Request handlers and orchestration
│   ├── api/         # API route handlers
│   ├── hooks/       # React hooks (for React apps)
│   └── middleware/  # Request middleware
│
└── utils/            # Shared utilities
    ├── helpers/     # Helper functions
    └── constants/   # Application constants
```

## Models Layer

### Responsibilities
- Define data structures and types
- Implement business rules and validation
- Handle data persistence and retrieval
- Manage application state

### Best Practices

```typescript
// models/entities/User.ts
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

// models/services/UserService.ts
export class UserService {
  constructor(private repository: UserRepository) {}

  async createUser(data: CreateUserDTO): Promise<User> {
    // Business logic validation
    if (!this.isValidEmail(data.email)) {
      throw new ValidationError('Invalid email');
    }
    return this.repository.create(data);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

// models/repositories/UserRepository.ts
export interface UserRepository {
  create(data: CreateUserDTO): Promise<User>;
  findById(id: string): Promise<User | null>;
  update(id: string, data: UpdateUserDTO): Promise<User>;
  delete(id: string): Promise<void>;
}
```

### Guidelines
- Keep models pure and free of UI logic
- Use dependency injection for testability
- Implement repository pattern for data access
- Define clear interfaces for all services

## Views Layer

### Responsibilities
- Render UI components
- Handle user interactions
- Display data from models
- Manage local component state only

### Best Practices

```typescript
// views/components/UserCard.tsx
interface UserCardProps {
  user: User;
  onEdit: () => void;
  onDelete: () => void;
}

export function UserCard({ user, onEdit, onDelete }: UserCardProps) {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <div className="actions">
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

// views/pages/UsersPage.tsx
export function UsersPage() {
  const { users, isLoading, error, deleteUser } = useUsers();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="users-page">
      <h1>Users</h1>
      <UserList users={users} onDelete={deleteUser} />
    </div>
  );
}
```

### Guidelines
- Keep components small and focused
- Use composition over inheritance
- Props should be immutable
- Avoid business logic in views
- Use presentational/container pattern when appropriate

## Controllers Layer

### Responsibilities
- Handle incoming requests
- Coordinate between models and views
- Manage data flow
- Handle errors and edge cases

### Best Practices

```typescript
// controllers/hooks/useUsers.ts
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await userService.getAll();
      setUsers(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    await userService.delete(id);
    setUsers(users.filter(u => u.id !== id));
  };

  return { users, isLoading, error, deleteUser, refetch: fetchUsers };
}

// controllers/api/usersController.ts (for backend)
export class UsersController {
  constructor(private userService: UserService) {}

  async getAll(req: Request, res: Response) {
    try {
      const users = await this.userService.getAll();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const user = await this.userService.createUser(req.body);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create user' });
      }
    }
  }
}
```

### Guidelines
- Controllers should be thin - delegate to services
- Handle all error cases
- Validate input before passing to models
- Use middleware for cross-cutting concerns

## Data Flow

```
User Action → View → Controller → Model → Controller → View → Updated UI
     │           │         │          │         │          │
     │           │         │          │         │          └─ Re-render
     │           │         │          │         └─ Update state
     │           │         │          └─ Business logic
     │           │         └─ Handle request
     │           └─ Event handler
     └─ Click/Input
```

## Testing Strategy

### Model Tests
```typescript
describe('UserService', () => {
  it('should validate email before creating user', async () => {
    const service = new UserService(mockRepository);
    await expect(service.createUser({ email: 'invalid' }))
      .rejects.toThrow('Invalid email');
  });
});
```

### View Tests
```typescript
describe('UserCard', () => {
  it('should display user information', () => {
    render(<UserCard user={mockUser} onEdit={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
  });
});
```

### Controller Tests
```typescript
describe('useUsers', () => {
  it('should fetch users on mount', async () => {
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.users).toHaveLength(2);
  });
});
```

## Common Anti-Patterns to Avoid

### ❌ Business Logic in Views
```typescript
// BAD
function UserList({ users }) {
  const activeUsers = users.filter(u => u.status === 'active' && u.lastLogin > Date.now() - 86400000);
  // ...
}
```

### ✅ Move to Model/Service
```typescript
// GOOD
function UserList({ users }) {
  const activeUsers = userService.getActiveUsers(users);
  // ...
}
```

### ❌ Direct Data Access in Views
```typescript
// BAD
function Dashboard() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
}
```

### ✅ Use Controllers/Hooks
```typescript
// GOOD
function Dashboard() {
  const { data, isLoading } = useDashboardData();
}
```

## Migration Strategy

If converting an existing codebase to MVC:

1. **Identify Layers**: Map existing code to M, V, or C
2. **Extract Models First**: Pull out data types and business logic
3. **Create Controllers**: Wrap existing data fetching in hooks/controllers
4. **Clean Views**: Remove business logic from components
5. **Add Tests**: Write tests for each layer independently

## Summary

| Layer | Contains | Depends On | Tested With |
|-------|----------|------------|-------------|
| Model | Business logic, types, services | Nothing (pure) | Unit tests |
| View | UI components, styles | Props only | Component tests |
| Controller | Hooks, handlers, middleware | Models, external APIs | Integration tests |
