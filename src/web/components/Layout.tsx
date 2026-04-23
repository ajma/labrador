import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Network, HardDrive, Settings, LogOut, Plus, Menu, X, Container, ChevronDown, ChevronRight, Box } from 'lucide-react';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useProjects } from '../hooks/useProjects';
import { useGroups } from '../hooks/useGroups';
import type { ProjectGroup } from '@shared/types';

const topNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
];

const dockerNavItems = [
  { to: '/containers', icon: Box, label: 'Containers' },
  { to: '/images', icon: HardDrive, label: 'Images' },
  { to: '/networks', icon: Network, label: 'Networks' },
];


function NavItem({
  item,
  onNavClick,
}: {
  item: { to: string; icon: React.ElementType; label: string };
  onNavClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-[8px] text-sm transition-all ${
          isActive
            ? 'bg-[rgba(100,158,245,0.12)] text-[#7db0ff] shadow-[inset_2px_0_0_#649ef5]'
            : 'text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.06)]'
        }`
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

function SidebarContent({
  projects,
  groups,
  onLogout,
  onNavClick,
}: {
  projects: any[] | undefined;
  groups: ProjectGroup[];
  onLogout: () => void;
  onNavClick?: () => void;
}) {
  const location = useLocation();
  const isDockerRoute = dockerNavItems.some((item) => location.pathname === item.to);
  const [dockerOpen, setDockerOpen] = useState(isDockerRoute);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const allCollapsed = groups.length > 0 && collapsedGroups.size === groups.length;

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) setCollapsedGroups(new Set());
    else setCollapsedGroups(new Set(groups.map((g) => g.id)));
  };

  return (
    <>
      <div className="flex h-14 items-center border-b border-[rgba(255,255,255,0.12)] px-4">
        <h1 className="text-lg font-semibold text-[#7db0ff]">Labrador</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {topNavItems.map((item) => (
            <NavItem key={item.to} item={item} onNavClick={onNavClick} />
          ))}

          {/* Docker expandable section */}
          <button
            onClick={() => setDockerOpen(!dockerOpen)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-[8px] text-sm transition-all ${
              isDockerRoute
                ? 'text-[#7db0ff]'
                : 'text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.06)]'
            }`}
          >
            <Container className="h-4 w-4 shrink-0" />
            Docker
            {dockerOpen ? (
              <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50" />
            ) : (
              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />
            )}
          </button>
          {dockerOpen && (
            <div className="ml-3 space-y-0.5 border-l border-[rgba(255,255,255,0.12)] pl-2">
              {dockerNavItems.map((item) => (
                <NavItem key={item.to} item={item} onNavClick={onNavClick} />
              ))}
            </div>
          )}

        </div>

        {/* Projects section */}
        <div className="mt-4">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-[rgba(255,255,255,0.28)]">
              Projects
            </span>
            <div className="flex items-center gap-1">
              {groups.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="rounded-md p-1 text-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.6)] transition-all"
                  title={allCollapsed ? 'Expand all' : 'Collapse all'}
                >
                  {allCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <NavLink
                to="/projects/new"
                onClick={onNavClick}
                className="rounded-md p-1 text-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.6)] transition-all"
                title="New Project"
              >
                <Plus className="h-3.5 w-3.5" />
              </NavLink>
            </div>
          </div>

          {(() => {
            if (!projects || projects.length === 0) {
              return <p className="px-3 py-2 text-xs text-[rgba(255,255,255,0.28)]">No projects yet</p>;
            }

            const dotColor: Record<string, string> = {
              running: '#4ade80',
              stopped: 'rgba(255,255,255,0.20)',
              starting: '#facc15',
              error: '#f87171',
            };

            const sorted = [...projects].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
            const ungrouped = sorted.filter((p: any) => p.groupId === null);

            const renderProject = (project: any) => (
              <NavLink
                key={project.id}
                to={`/projects/${project.id}`}
                onClick={onNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-[8px] text-sm transition-all ${
                    isActive
                      ? 'bg-[rgba(100,158,245,0.12)] text-[#7db0ff] shadow-[inset_2px_0_0_#649ef5]'
                      : 'text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.06)]'
                  }`
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor[project.status] ?? 'rgba(255,255,255,0.20)' }}
                />
                <span className="truncate">{project.name}</span>
              </NavLink>
            );

            return (
              <div className="space-y-0.5">
                {ungrouped.map(renderProject)}

                {groups.map((group) => {
                  const gProjects = sorted.filter((p: any) => p.groupId === group.id);
                  if (gProjects.length === 0) return null;
                  const collapsed = collapsedGroups.has(group.id);
                  return (
                    <div key={group.id}>
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-[6px] text-2xs font-semibold uppercase tracking-[0.14em] text-[rgba(255,255,255,0.28)] hover:bg-[rgba(255,255,255,0.04)] transition-all"
                      >
                        {collapsed ? (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        )}
                        {group.name}
                      </button>
                      {!collapsed && (
                        <div className="ml-3 space-y-0.5 border-l border-[rgba(255,255,255,0.08)] pl-2">
                          {gProjects.map(renderProject)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </nav>
      <div className="border-t border-[rgba(255,255,255,0.12)] p-2 space-y-0.5">
        <NavItem item={{ to: '/settings', icon: Settings, label: 'Settings' }} onNavClick={onNavClick} />
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-[8px] text-sm text-[rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.6)]"
        >
          <LogOut className="h-4 w-4 shrink-0" />
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
  const { data: groups = [] } = useGroups();

  const handleLogout = async () => {
    setMobileOpen(false);
    await api.post('/auth/logout');
    queryClient.invalidateQueries({ queryKey: ['auth'] });
  };

  return (
    <div className="flex h-screen flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex h-14 items-center border-b border-[rgba(255,255,255,0.12)] px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.6)] transition-all"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="ml-3 text-lg font-semibold text-[#7db0ff]">Labrador</h1>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-[rgba(0,0,0,0.55)] transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-[rgba(255,255,255,0.12)] bg-[rgba(4,7,15,0.98)] shadow-[4px_0_24px_rgba(0,0,0,0.4)] animate-in slide-in-from-left duration-200">
            <div className="absolute right-2 top-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.6)] transition-all"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              projects={projects}
              groups={groups}
              onLogout={handleLogout}
              onNavClick={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.015)] md:flex">
        <SidebarContent projects={projects} groups={groups} onLogout={handleLogout} />
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
