import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/test/chat/ContextToolForwarding.test.ts'],
        environment: 'node',
    },
});
