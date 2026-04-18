import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, createProjectSchema } from '../schemas.js';

describe('loginSchema', () => {
  it('accepts valid input', () => {
    const result = loginSchema.safeParse({ username: 'admin', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects short username', () => {
    const result = loginSchema.safeParse({ username: 'ab', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = loginSchema.safeParse({ username: 'admin', password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts valid alphanumeric username', () => {
    const result = registerSchema.safeParse({ username: 'admin_user', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects username with special characters', () => {
    const result = registerSchema.safeParse({ username: 'admin@user', password: 'password123' });
    expect(result.success).toBe(false);
  });
});

describe('createProjectSchema', () => {
  it('accepts valid project', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      composeContent: 'services:\n  web:\n    image: nginx',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createProjectSchema.safeParse({
      name: '',
      composeContent: 'services:',
    });
    expect(result.success).toBe(false);
  });
});
