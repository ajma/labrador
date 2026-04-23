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
              'group flex items-center gap-3 rounded-2xl border border-white/[0.18] bg-[rgba(18,26,42,0.96)] px-4 py-3 text-sm text-[rgba(255,255,255,0.85)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md',
            title: 'font-medium text-[rgba(255,255,255,0.88)]',
            description: 'text-[rgba(255,255,255,0.50)]',
            success: 'border-[rgba(74,222,128,0.25)] bg-[rgba(18,26,42,0.96)]',
            error: 'border-[rgba(248,113,113,0.25)] bg-[rgba(18,26,42,0.96)]',
            warning: 'border-[rgba(250,204,21,0.25)] bg-[rgba(18,26,42,0.96)]',
            icon: 'text-[rgba(255,255,255,0.50)]',
            closeButton:
              'rounded-lg border border-white/[0.16] bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.40)] hover:bg-[rgba(255,255,255,0.10)] hover:text-[rgba(255,255,255,0.70)]',
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
