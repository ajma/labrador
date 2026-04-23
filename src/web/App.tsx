import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStatus } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { ProjectEditor } from './pages/ProjectEditor';
import { Settings } from './pages/Settings';
import { Networks } from './pages/Networks';
import { Images } from './pages/Images';
import { Containers } from './pages/Containers';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useAuthStatus();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (data?.needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <>
      <Toaster
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast:
              'group flex items-center gap-3 rounded-2xl border border-white/[0.24] bg-popover px-4 py-3 text-sm text-foreground shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md',
            title: 'font-medium text-foreground',
            description: 'text-muted-foreground',
            success: 'border-[rgba(74,222,128,0.25)] bg-popover',
            error: 'border-[rgba(248,113,113,0.25)] bg-popover',
            warning: 'border-[rgba(250,204,21,0.25)] bg-popover',
            icon: 'text-muted-foreground',
            closeButton:
              'rounded-lg border border-white/[0.22] bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects/:id" element={<ProjectEditor />} />
          <Route path="projects/new" element={<ProjectEditor />} />
          <Route path="containers" element={<Containers />} />
          <Route path="networks" element={<Networks />} />
          <Route path="images" element={<Images />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
