import { Link, type LinkProps } from '@tanstack/react-router';
import { House, Settings } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { ariaKeyShortcut, type Shortcut } from '@/core/hotkeys';
import { SHORTCUTS, toolShortcut } from '@/core/shortcuts';
import { useSettings } from '@/core/stores/settings';
import type { ToolIcon } from '@/core/tools/define-tool';
import { cn } from '@/lib/cn';
import { useRegistry } from '../registry-context';

type NavItemProps = Pick<LinkProps, 'to' | 'params' | 'activeOptions'> & {
  icon: ToolIcon;
  label: string;
  shortcut?: Shortcut;
  collapsed: boolean;
};

function NavItem({ icon: Icon, label, shortcut, collapsed, ...link }: NavItemProps) {
  return (
    <Tooltip label={label} shortcut={shortcut} disabled={!collapsed}>
      <Link
        {...link}
        aria-label={collapsed ? label : undefined}
        aria-keyshortcuts={shortcut ? ariaKeyShortcut(shortcut) : undefined}
        className={cn(
          'group flex h-8 items-center gap-2.5 rounded-md px-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg',
          'data-[status=active]:bg-active data-[status=active]:text-fg',
          collapsed && 'justify-center px-0',
        )}
      >
        <Icon
          className="size-4 shrink-0 group-data-[status=active]:text-accent-text"
          strokeWidth={1.75}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{label}</span>
            {shortcut && (
              <Kbd
                shortcut={shortcut}
                decorative
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            )}
          </>
        )}
      </Link>
    </Tooltip>
  );
}

export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const { tools } = useRegistry();

  return (
    <nav
      aria-label="Main"
      data-collapsed={collapsed}
      className={cn(
        'flex shrink-0 flex-col border-line border-r bg-panel transition-[width] duration-200 ease-out',
        collapsed ? 'w-[52px]' : 'w-60',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
        <NavItem
          to="/"
          activeOptions={{ exact: true }}
          icon={House}
          label="Home"
          shortcut={SHORTCUTS.home}
          collapsed={collapsed}
        />

        {collapsed ? (
          <div className="mx-2 my-2 border-line border-t" />
        ) : (
          <div className="px-2 pt-4 pb-1 font-medium text-[11px] text-fg-subtle uppercase tracking-wider">
            Tools
          </div>
        )}

        {tools.map((tool, index) => (
          <NavItem
            key={tool.id}
            to="/tools/$toolId"
            params={{ toolId: tool.id }}
            icon={tool.icon}
            label={tool.name}
            shortcut={toolShortcut(index)}
            collapsed={collapsed}
          />
        ))}

        {tools.length === 0 && !collapsed && (
          <p className="px-2 py-1 text-fg-subtle text-xs">No tools yet.</p>
        )}
      </div>

      <div className="border-line border-t p-2">
        <NavItem
          to="/settings"
          icon={Settings}
          label="Settings"
          shortcut={SHORTCUTS.settings}
          collapsed={collapsed}
        />
      </div>
    </nav>
  );
}
