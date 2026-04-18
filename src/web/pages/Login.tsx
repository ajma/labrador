import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@shared/schemas';
import { useLogin } from '../hooks/useAuth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function Login() {
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    login.mutate(data);
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>HomelabMan</CardTitle>
          <CardDescription>Sign in to manage your homelab</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter your username"
                {...register('username')}
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in...' : 'Sign In'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              First time?{' '}
              <Link to="/onboarding" className="text-primary underline underline-offset-4 hover:text-primary/80">
                Set up your instance
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
