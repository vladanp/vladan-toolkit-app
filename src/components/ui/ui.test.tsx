import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from './button';
import { Kbd } from './kbd';
import { Row, Section } from './section';
import { Segmented } from './segmented';
import { Switch } from './switch';
import { Tooltip, TooltipProvider } from './tooltip';

describe('Button', () => {
  it('defaults to type="button" and forwards clicks', async () => {
    const onClick = vi.fn();
    const screen = await render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    await expect.element(button).toHaveAttribute('type', 'button');
    await button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can be disabled and styled by variant', async () => {
    const screen = await render(
      <Button variant="danger" size="sm" disabled>
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    await expect.element(button).toBeDisabled();
    await expect.element(button).toHaveClass('bg-danger');
  });
});

describe('Kbd', () => {
  it('renders one key cap per key with an accessible label', async () => {
    const screen = await render(<Kbd shortcut="mod+shift+k" />);
    await expect.element(screen.getByLabelText('Ctrl+Shift+K')).toBeVisible();
    expect(screen.container.querySelectorAll('kbd > span')).toHaveLength(3);
  });
});

describe('Kbd (decorative)', () => {
  it('can be hidden from assistive tech', async () => {
    const screen = await render(<Kbd shortcut="mod+k" decorative />);
    const kbd = screen.container.querySelector('kbd');
    expect(kbd?.getAttribute('aria-hidden')).toBe('true');
    expect(kbd?.hasAttribute('aria-label')).toBe(false);
  });
});

describe('Switch', () => {
  function Controlled({ onChange }: { onChange: (v: boolean) => void }) {
    const [checked, setChecked] = useState(false);
    return (
      <Switch
        label="Wi-Fi"
        checked={checked}
        onCheckedChange={(v) => {
          setChecked(v);
          onChange(v);
        }}
      />
    );
  }

  it('toggles', async () => {
    const onChange = vi.fn();
    const screen = await render(<Controlled onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Wi-Fi' });
    await expect.element(toggle).not.toBeChecked();
    await toggle.click();
    await expect.element(toggle).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Segmented', () => {
  it('selects exactly one option and ignores re-clicking the active one', async () => {
    const onValueChange = vi.fn();
    const screen = await render(
      <Segmented
        label="Theme"
        value="dark"
        onValueChange={onValueChange}
        options={[
          { value: 'dark', label: 'Dark', icon: Moon },
          { value: 'light', label: 'Light', icon: Sun },
        ]}
      />,
    );
    await expect
      .element(screen.getByRole('button', { name: 'Dark' }))
      .toHaveAttribute('aria-pressed', 'true');
    await screen.getByRole('button', { name: 'Dark' }).click();
    expect(onValueChange).not.toHaveBeenCalled();
    await screen.getByRole('button', { name: 'Light' }).click();
    expect(onValueChange).toHaveBeenCalledWith('light');
  });
});

describe('Section', () => {
  it('renders title, description and rows', async () => {
    const screen = await render(
      <Section title="General" description="Basics">
        <Row label="Name" description="Shown everywhere">
          <span>value</span>
        </Row>
      </Section>,
    );
    await expect.element(screen.getByRole('region', { name: 'General' })).toBeVisible();
    await expect.element(screen.getByText('Basics')).toBeVisible();
    await expect.element(screen.getByText('Shown everywhere')).toBeVisible();
  });
});

describe('Tooltip', () => {
  it('shows label and shortcut on hover', async () => {
    const screen = await render(
      <TooltipProvider delay={0}>
        <Tooltip label="Toggle sidebar" shortcut="mod+b">
          <button type="button">trigger</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.hover(screen.getByRole('button', { name: 'trigger' }));
    // Popups render in a portal outside the test container, so query the whole page.
    await expect.element(page.getByText(/Toggle sidebar/)).toBeVisible();
    await expect.element(page.getByLabelText('Ctrl+B')).toBeVisible();
  });

  it('renders only the trigger when disabled', async () => {
    const screen = await render(
      <Tooltip label="Hidden" disabled>
        <button type="button">plain</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole('button', { name: 'plain' }));
    expect(document.body.textContent).not.toContain('Hidden');
  });
});
