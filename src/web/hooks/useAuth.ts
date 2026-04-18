import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AuthStatus } from '@shared/types';

export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ['auth', 'status'],
    queryFn: () => api.get('/auth/status'),
  });
}
