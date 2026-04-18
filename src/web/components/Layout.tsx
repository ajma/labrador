import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, Network, HardDrive, Settings, LogOut, Plus, Menu, X } from 'lucide-react';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useProjects } from '../hooks/useProjects';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/networks', icon: Network, label: 'Networks' },
  { to: '/images', icon: HardDrive, label: 'Images' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function SidebarContent({
  projects,
  onLogout,
  onNavClick,
}: {
  projects: any[] | undefined;
  onLogout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <h1 className="text-lg font-semibold">HomelabMan</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Projects section */}
        <div className="mt-4">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Projects
            </span>
            <NavLink
              to="/projects/new"
              onClick={onNavClick}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              title="New Project"
            >
              <Plus className="h-3.5 w-3.5" />
            </NavLink>
          </div>
          <div className="space-y-1">
            {projects?.map((project) => (
              <NavLink
                key={project.id}
                to={`/projects/${project.id}`}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`
                }
              >
                <FolderOpen className="h-4 w-4" />
                <span className="truncate">{project.name}</span>
              </NavLink>
            ))}
            {projects?.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No projects yet</p>
            )}
          </div>
        </div>
      </nav>
      <div className="border-t p-2">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: projects } = useProjects();

  const handleLogout = async () => {
    setMobileOpen(false);
    await api.post('/auth/logout');
    queryClient.invalidateQueries({ queryKey: ['auth'] });
  };

  return (
    <div className="flex h-screen flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex h-14 items-center border-b px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="ml-3 text-lg font-semibold">HomelabMan</h1>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-card border-r shadow-lg animate-in slide-in-from-left duration-200">
            <div className="absolute right-2 top-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              projects={projects}
              onLogout={handleLogout}
              onNavClick={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <SidebarContent projects={projects} onLogout={handleLogout} />
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
