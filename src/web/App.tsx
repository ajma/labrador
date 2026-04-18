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
      <Toaster position="top-right" />
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
          <Route path="networks" element={<Networks />} />
          <Route path="images" element={<Images />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
