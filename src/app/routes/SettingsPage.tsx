import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { ExternalLink, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Row, Section } from '@/components/ui/section';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { openExternal } from '@/core/external';
import { useAppInfo } from '@/core/ipc';
import { SHORTCUT_LABELS, SHORTCUTS } from '@/core/shortcuts';
import { useSettings } from '@/core/stores/settings';
import { useUsage } from '@/core/stores/usage';
import { ACCENTS, type Accent, type ThemePreference } from '@/core/theme';
import { type UpdateStatus, useUpdater } from '@/core/updater';
import { formatRelativeTime } from '@/lib/time';
import { Page } from '../shell/Page';
import { checkForUpdates } from '../shell/UpdateNotifier';

export const REPO_URL = 'https://github.com/vladanp/vladan-toolkit-app';

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
] as const satisfies readonly { value: ThemePreference; label: string; icon: typeof Moon }[];

function AccentPicker({ value, onChange }: { value: Accent; onChange: (accent: Accent) => void }) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as Accent)}
      aria-label="Accent color"
      className="flex items-center gap-2"
    >
      {ACCENTS.map((accent) => (
        <Radio.Root
          key={accent}
          value={accent}
          aria-label={accent}
          title={accent}
          data-accent={accent}
          className="size-5 rounded-full bg-(--vt-accent) ring-offset-2 ring-offset-surface transition-shadow hover:ring-2 hover:ring-line-strong data-checked:ring-2 data-checked:ring-fg-muted"
        />
      ))}
    </RadioGroup>
  );
}

export function describeUpdateStatus(status: UpdateStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Not checked yet';
    case 'checking':
      return 'Checking…';
    case 'up-to-date':
      return `Up to date · checked ${formatRelativeTime(status.checkedAt)}`;
    case 'available':
      return `Version ${status.version} is available`;
    case 'downloading':
      return status.total
        ? `Downloading… ${Math.round((status.downloaded / status.total) * 100)}%`
        : 'Downloading…';
    case 'installing':
      return 'Installing…';
    case 'error':
      return `Check failed: ${status.message}`;
  }
}

function UpdatesSection() {
  const autoCheck = useSettings((s) => s.autoCheckUpdates);
  const setAutoCheck = useSettings((s) => s.setAutoCheckUpdates);
  const status = useUpdater((s) => s.status);
  const install = useUpdater((s) => s.install);
  const busy = ['checking', 'downloading', 'installing'].includes(status.kind);

  return (
    <Section title="Updates" description="New versions are published on GitHub Releases.">
      <Row label="Check automatically" description="On launch and every few hours.">
        <Switch
          checked={autoCheck}
          onCheckedChange={setAutoCheck}
          label="Check for updates automatically"
        />
      </Row>
      <Row label="Status" description={describeUpdateStatus(status)}>
        {status.kind === 'available' ? (
          <Button variant="primary" size="sm" onClick={() => void install()}>
            Install &amp; restart
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void checkForUpdates({ silent: false })}>
            Check now
          </Button>
        )}
      </Row>
    </Section>
  );
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const accent = useSettings((s) => s.accent);
  const setAccent = useSettings((s) => s.setAccent);
  const sidebarCollapsed = useSettings((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettings((s) => s.setSidebarCollapsed);
  const clearUsage = useUsage((s) => s.clear);
  const info = useAppInfo();

  return (
    <Page title="Settings" icon={Settings}>
      <div className="space-y-8">
        <Section title="Appearance">
          <Row label="Theme">
            <Segmented
              label="Theme"
              value={theme}
              onValueChange={setTheme}
              options={THEME_OPTIONS}
            />
          </Row>
          <Row label="Accent color">
            <AccentPicker value={accent} onChange={setAccent} />
          </Row>
          <Row
            label="Compact sidebar"
            description="Show only icons. Toggle anytime with the shortcut."
          >
            <Kbd shortcut={SHORTCUTS.sidebar} className="mr-1" />
            <Switch
              checked={sidebarCollapsed}
              onCheckedChange={setSidebarCollapsed}
              label="Compact sidebar"
            />
          </Row>
        </Section>

        {info?.updaterEnabled && <UpdatesSection />}

        <Section title="Keyboard shortcuts">
          {(Object.keys(SHORTCUTS) as (keyof typeof SHORTCUTS)[]).map((key) => (
            <Row key={key} label={SHORTCUT_LABELS[key]}>
              <Kbd shortcut={SHORTCUTS[key]} />
            </Row>
          ))}
          <Row label="Open tools 1 to 9">
            <Kbd shortcut="mod+1" />
          </Row>
        </Section>

        <Section title="Privacy">
          <Row
            label="Recent activity"
            description="“Last opened” times shown on the home screen. Stored only on this device."
          >
            <Button
              size="sm"
              onClick={() => {
                clearUsage();
                toast.success('Recent activity cleared');
              }}
            >
              Clear
            </Button>
          </Row>
        </Section>

        <Section title="About">
          <Row label="Version">
            <span className="select-text font-mono text-fg-muted text-xs">
              {info?.version ?? '…'}
            </span>
          </Row>
          <Row label="Runtime">
            <span className="select-text font-mono text-fg-muted text-xs">
              {info?.runtime === 'tauri' ? `Tauri ${info.tauriVersion}` : 'Browser preview'}
            </span>
          </Row>
          <Row label="Platform">
            <span className="select-text font-mono text-fg-muted text-xs">
              {info ? `${info.os} · ${info.arch}` : '…'}
            </span>
          </Row>
          {info?.webviewVersion && (
            <Row label="Webview">
              <span className="select-text font-mono text-fg-muted text-xs">
                {info.webviewVersion}
              </span>
            </Row>
          )}
          <Row label="Source code" description="Open source on GitHub.">
            <Button size="sm" onClick={() => void openExternal(REPO_URL)}>
              GitHub <ExternalLink className="size-3.5" />
            </Button>
          </Row>
        </Section>
      </div>
    </Page>
  );
}
