import { defineConfig } from 'vitest/config';

// The package source is framework-agnostic (pure DOM + a structural fixture
// type), so its own tests need only jsdom, without Angular or AnalogJS.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
  },
});
