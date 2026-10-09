import { Dialog } from '@base-ui/react/dialog';
import { Command } from 'cmdk-base';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Kbd } from '@/components/ui/kbd';
import { buildCommands, type PaletteCommand, scoreCommand } from '@/core/commands';
import { ariaKeyShortcut } from '@/core/hotkeys';
import { useUi } from '@/core/stores/ui';
import { useRegistry } from '../registry-context';
import { useShellActions } from './use-shell-actions';

function groupCommands(commands: PaletteCommand[]): [string, PaletteCommand[]][] {
  const groups = new Map<string, PaletteCommand[]>();
  for (const command of commands) {
    const list = groups.get(command.group) ?? [];
    list.push(command);
    groups.set(command.group, list);
  }
  return [...groups];
}

async function execute(command: PaletteCommand): Promise<void> {
  try {
    await command.run();
  } catch (error) {
    console.error(`Command "${command.id}" failed`, error);
    toast.error(`"${command.title}" failed`, {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

/** ⌘K: fuzzy search across every tool, tool command and app action. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const { tools } = useRegistry();
  const actions = useShellActions();
  const commands = useMemo(() => buildCommands(tools, actions), [tools, actions]);
  const groups = groupCommands(commands);
  const byId = new Map(commands.map((command) => [command.id, command]));
  const filter = (id: string, search: string) => {
    const command = byId.get(id);
    return command ? scoreCommand(command, search) : 0;
  };

  const run = (command: PaletteCommand) => {
    setOpen(false);
    void execute(command);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-popover transition-[opacity,scale,translate] duration-150 ease-out data-starting-style:-translate-y-1.5 data-ending-style:scale-[0.985] data-starting-style:scale-[0.985] data-ending-style:opacity-0 data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" loop filter={filter}>
            <div className="flex items-center gap-2.5 border-line border-b px-4">
              <Search className="size-4 shrink-0 text-fg-subtle" />
              <Command.Input
                placeholder="Search tools and actions…"
                className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
              />
            </div>
            <Command.List className="max-h-[min(420px,56vh)] scroll-py-2 overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-fg-subtle">
                No matching tools or actions.
              </Command.Empty>
              {groups.map(([group, commands]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-fg-subtle"
                >
                  {commands.map((command) => {
                    const Icon = command.icon;
                    return (
                      <Command.Item
                        key={command.id}
                        value={command.id}
                        onSelect={() => run(command)}
                        aria-keyshortcuts={
                          command.shortcut ? ariaKeyShortcut(command.shortcut) : undefined
                        }
                        className="flex h-9 items-center gap-3 rounded-md px-2 text-fg-muted data-[selected=true]:bg-hover data-[selected=true]:text-fg"
                      >
                        {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.75} />}
                        <span className="flex-1 truncate">{command.title}</span>
                        {command.shortcut && <Kbd shortcut={command.shortcut} decorative />}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
            <footer className="flex items-center gap-4 border-line border-t px-4 py-2 text-[11px] text-fg-subtle">
              <span className="flex items-center gap-1.5">
                <Kbd shortcut="arrowup" />
                <Kbd shortcut="arrowdown" /> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd shortcut="enter" /> open
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd shortcut="escape" /> close
              </span>
            </footer>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
