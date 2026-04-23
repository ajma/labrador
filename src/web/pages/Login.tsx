import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@shared/schemas';
import { useLogin, useAuthStatus } from '../hooks/useAuth';
import { Input } from '../components/ui/input';

export function Login() {
  const { data: authStatus, isLoading: authLoading } = useAuthStatus();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (authStatus?.needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (authStatus?.authenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = (data: LoginInput) => {
    login.mutate(data);
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.22] bg-accent/80 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">Labrador</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your homelab</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-xs font-medium text-muted-foreground">
              Username
            </label>
            <Input
              id="username"
              placeholder="Enter your username"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-xs text-[rgba(254,202,202,0.85)]">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-[rgba(254,202,202,0.85)]">{errors.password.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={login.isPending}
            className="mt-2 w-full rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {login.isPending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
