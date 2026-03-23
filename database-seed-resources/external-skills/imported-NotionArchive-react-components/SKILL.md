---
name: react-components
description: "Use this skill when developing React components. Covers functional component patterns, hooks, naming conventions, state management with Zustand and TanStack Query, and TypeScript best practices."
---

# Component Development Guidelines

When working with React components in this workspace:

## Component Structure

- Use functional components with hooks
- Keep components focused on a single responsibility
- Extract reusable logic into custom hooks
- Use TypeScript for type safety

## Naming Conventions

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities: `camelCase.ts`
- Types: `types/index.ts` or co-located

## State Management

- Local state: `useState`, `useReducer`
- Server state: TanStack Query (React Query)
- Global state: Zustand store

## Styling

- Use Tailwind CSS utility classes
- Use `cn()` helper for conditional classes
- Follow the design system colors from `utils/colors.ts`

## Testing Components

- Write component tests with Testing Library
- Test user interactions, not implementation details
- Mock API calls and external dependencies
