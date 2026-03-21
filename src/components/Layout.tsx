import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useProjectStore } from '../stores/projectStore';
import { FolderOpen, LayoutGrid } from 'lucide-react';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProject, projects } = useProjectStore();

  const isInWorkspace = location.pathname.startsWith('/workspace/');

  const navItems = [
    { key: '/projects', icon: LayoutGrid, label: '项目列表' },
    ...projects.map((p) => ({
      key: `/workspace/${encodeURIComponent(p.path)}`,
      icon: FolderOpen,
      label: p.name,
    })),
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex flex-col w-[52px] shrink-0 border-r border-border/50 glass-strong">
        <div className="h-11 shrink-0 flex items-center justify-center border-b border-border/30">
          <img
            src="/logo.svg"
            alt="Omni"
            className="w-7 h-7 shrink-0 rounded-lg shadow-[0_1px_3px_oklch(0_0_0/0.08)]"
          />
        </div>

        <ScrollArea className="flex-1">
          <nav className="flex flex-col items-center gap-1 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  title={item.label}
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 cursor-pointer',
                    isActive
                      ? 'bg-white/60 text-foreground shadow-[0_1px_3px_oklch(0_0_0/0.06)]'
                      : 'text-foreground/40 hover:bg-white/35 hover:text-foreground/80'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </nav>
        </ScrollArea>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        {!isInWorkspace && (
          <header className="flex items-center h-11 border-b border-border/40 glass px-5 shrink-0">
            <nav className="flex items-center gap-1.5 text-xs">
              <span className="text-foreground font-medium">
                {location.pathname === '/projects' ? '项目管理' : ''}
              </span>
            </nav>
          </header>
        )}

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>

        <footer className="flex items-center justify-between h-7 border-t border-border/30 glass-subtle px-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_oklch(0.65_0.2_150/0.5)]" />
              <span className="text-[11px] text-muted-foreground">Omni</span>
            </div>
            {currentProject && (
              <span className="text-[11px] text-muted-foreground/50">
                {currentProject.name}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/40">
            {projects.length} 项目
          </span>
        </footer>
      </div>
    </div>
  );
}
