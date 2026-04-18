import { describe, it, expect } from 'vitest';
import { ComposeValidatorService } from '../compose-validator.service.js';

const validator = new ComposeValidatorService();

describe('ComposeValidatorService', () => {
  it('validates a minimal valid compose file', () => {
    const result = validator.validate(`
services:
  web:
    image: nginx:latest
`);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid YAML', () => {
    const result = validator.validate('{{invalid yaml');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects missing services key', () => {
    const result = validator.validate('version: "3"');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('services'))).toBe(true);
  });

  it('rejects service without image or build', () => {
    const result = validator.validate(`
services:
  web:
    ports:
      - "80:80"
`);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('image'))).toBe(true);
  });

  it('validates port format', () => {
    const result = validator.validate(`
services:
  web:
    image: nginx
    ports:
      - "80:80"
      - "443:443"
`);
    expect(result.valid).toBe(true);
  });

  it('validates depends_on references', () => {
    const result = validator.validate(`
services:
  web:
    image: nginx
    depends_on:
      - nonexistent
`);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('nonexistent'))).toBe(true);
  });

  it('warns about privileged mode', () => {
    const result = validator.validate(`
services:
  web:
    image: nginx
    privileged: true
`);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.message.includes('privileged'))).toBe(true);
  });

  it('validates network references', () => {
    const result = validator.validate(`
services:
  web:
    image: nginx
    networks:
      - custom
networks:
  custom:
`);
    expect(result.valid).toBe(true);
  });

  it('rejects non-object compose content', () => {
    const result = validator.validate('just a string');
    expect(result.valid).toBe(false);
  });

  it('accepts large but valid content', () => {
    // Size limits are checked at the route level, not the service level
    const longLabel = 'a'.repeat(200);
    const longContent = `services:\n  web:\n    image: nginx\n    labels:\n      - "${longLabel}"\n`;
    const result = validator.validate(longContent);
    // Should still be valid since size check is at route level
    expect(result.valid).toBe(true);
  });
});
