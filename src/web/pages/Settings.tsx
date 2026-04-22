import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, CheckCircle2 } from 'lucide-react';
import {
  exposureProviderSchema,
  changePasswordSchema,
  type ExposureProviderInput,
  type ChangePasswordInput,
} from '@shared/schemas';
import type { ExposureProviderConfig, Settings as SettingsType } from '@shared/types';
import { api } from '../lib/api';
import { resolveCloudflareBeforeSave, deployCloudflaredProject } from '../lib/cloudflare';
import { CloudflareProviderForm, type CloudflareProviderFormValue } from '../components/CloudflareProviderForm';

// ─── shared input class ──────────────────────────────────────────────────────

const inputCls =
  'flex h-10 w-full rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[14px] text-[rgba(255,255,255,0.85)] placeholder:text-[rgba(255,255,255,0.28)] outline-none transition-colors focus:border-[rgba(100,158,245,0.5)] disabled:cursor-not-allowed disabled:opacity-50';

// ─── anchor sections ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'providers', label: 'Providers' },
  { id: 'data', label: 'Data' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function AnchorNav({ active }: { active: SectionId }) {
  const scrollTo = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    window.location.hash = id;
  };

  return (
    <nav className="flex items-center gap-6 pb-4 mb-8 border-b border-white/[0.06] sticky top-0 bg-[#04070f] z-10 pt-1">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className={`relative text-[13px] font-medium pb-1 transition-colors ${
            active === s.id
              ? 'text-[rgba(255,255,255,0.92)]'
              : 'text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.65)]'
          }`}
        >
          {s.label}
          {active === s.id && (
            <span className="absolute bottom-0 left-0 right-0 h-px bg-[rgba(100,158,245,0.7)]" />
          )}
        </button>
      ))}
    </nav>
  );
}

// ─── section wrapper ──────────────────────────────────────────────────────────

function Section({
  id,
  heading,
  description,
  children,
  first,
}: {
  id: SectionId;
  heading: string;
  description: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <>
      {!first && <div className="h-px bg-white/[0.06] my-16" />}
      <section id={id} className="scroll-mt-12">
        <div className="mb-6">
          <h2 className="text-[15px] font-semibold text-[rgba(255,255,255,0.88)]">{heading}</h2>
          <p className="mt-0.5 text-[13px] text-[rgba(255,255,255,0.38)]">{description}</p>
        </div>
        {children}
      </section>
    </>
  );
}

// ─── account section ─────────────────────────────────────────────────────────

function AccountSection() {
  const [successVisible, setSuccessVisible] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const changePassword = useMutation({
    mutationFn: (data: ChangePasswordInput) =>
      api.put('/auth/password', { currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: () => {
      reset();
      setSuccessVisible(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccessVisible(false), 3000);
    },
    onError: (err: any) => {
      if (err?.status === 401) {
        setError('currentPassword', { message: 'That password is incorrect.' });
      } else {
        toast.error(err?.message ?? 'Failed to update password');
      }
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => changePassword.mutate(data))} className="space-y-4 max-w-sm">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">Current password</label>
        <input type="password" autoComplete="current-password" className={inputCls} {...register('currentPassword')} />
        {errors.currentPassword && (
          <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.currentPassword.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">New password</label>
        <input type="password" autoComplete="new-password" className={inputCls} {...register('newPassword')} />
        {errors.newPassword && (
          <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.newPassword.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">Confirm new password</label>
        <input type="password" autoComplete="new-password" className={inputCls} {...register('confirmPassword')} />
        {errors.confirmPassword && (
          <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        {successVisible && (
          <span className="flex items-center gap-1.5 text-[13px] text-[#4ade80]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Password updated.
          </span>
        )}
        <button
          type="submit"
          disabled={isSubmitting || changePassword.isPending}
          className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-[13px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
        >
          {isSubmitting || changePassword.isPending ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function Settings() {
  const [activeSection, setActiveSection] = useState<SectionId>('account');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="min-h-full p-6 max-w-2xl">
      <h1 className="text-[18px] font-semibold text-[rgba(255,255,255,0.92)] mb-6">Settings</h1>
      <AnchorNav active={activeSection} />

      <Section id="account" heading="Account" description="Change your login credentials." first>
        <AccountSection />
      </Section>

      <Section id="providers" heading="Exposure Providers" description="Configure how your services are exposed to the internet.">
        <p className="text-[13px] text-[rgba(255,255,255,0.38)]">Providers section — coming soon.</p>
      </Section>

      <Section id="data" heading="Data" description="Back up or restore your HomelabMan configuration — projects, providers, and settings.">
        <p className="text-[13px] text-[rgba(255,255,255,0.38)]">Data section — coming soon.</p>
      </Section>
    </div>
  );
}
