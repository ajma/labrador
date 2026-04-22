import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username must be alphanumeric'),
  password: z.string().min(8).max(128),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  composeContent: z.string().max(102400),
  logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  domainName: z.string().nullable().optional(),
  exposureEnabled: z.boolean().optional().default(false),
  exposureProviderId: z.string().uuid().nullable().optional(),
  exposureConfig: z.record(z.any()).optional().default({}),
  isInfrastructure: z.boolean().optional().default(false),
});

export const updateProjectSchema = createProjectSchema.partial();

export const exposureProviderSchema = z.object({
  providerType: z.enum(['caddy', 'cloudflare']),
  name: z.string().min(1).max(100),
  enabled: z.boolean().optional().default(true),
  configuration: z.record(z.any()),
});

export const settingsSchema = z.object({
  defaultExposureProviderId: z.string().uuid().nullable().optional(),
});

export const onboardingSchema = z.object({
  exposureProviders: z.array(exposureProviderSchema).optional().default([]),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(1),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match.",
  path: ['confirmPassword'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ExposureProviderInput = z.infer<typeof exposureProviderSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
