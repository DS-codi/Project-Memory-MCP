import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create the mock server with handlers
export const server = setupServer(...handlers);
