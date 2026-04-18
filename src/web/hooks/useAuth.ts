import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { AuthStatus } from '@shared/types';
import type { LoginInput, RegisterInput } from '@shared/schemas';

export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ['auth', 'status'],
    queryFn: () => api.get('/auth/status'),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginInput) => api.post('/auth/login', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      navigate('/');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Login failed');
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterInput) => api.post('/auth/register', data),
    onError: (error: Error) => {
      toast.error(error.message || 'Registration failed');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Logout failed');
    },
  });
}
