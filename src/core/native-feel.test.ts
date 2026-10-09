import { describe, expect, it } from 'vitest';
import { installNativeBehaviors } from './native-feel';

function rightClick(target: EventTarget): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('installNativeBehaviors', () => {
  it('suppresses the browser context menu except in editable content', () => {
    const uninstall = installNativeBehaviors(document, true);
    document.body.innerHTML = `
      <div id="chrome">chrome</div>
      <input id="field" />
      <textarea id="area"></textarea>
      <div id="editable" contenteditable="true">edit</div>
      <div class="select-text"><span id="selectable">copy me</span></div>`;
    const el = (id: string) => document.getElementById(id) as HTMLElement;
    // jsdom does not implement isContentEditable.
    Object.defineProperty(el('editable'), 'isContentEditable', { value: true });

    expect(rightClick(el('chrome')).defaultPrevented).toBe(true);
    expect(rightClick(document).defaultPrevented).toBe(true);
    expect(rightClick(el('field')).defaultPrevented).toBe(false);
    expect(rightClick(el('area')).defaultPrevented).toBe(false);
    expect(rightClick(el('editable')).defaultPrevented).toBe(false);
    expect(rightClick(el('selectable')).defaultPrevented).toBe(false);

    uninstall();
    expect(rightClick(el('chrome')).defaultPrevented).toBe(false);
  });

  it('does nothing in development', () => {
    const uninstall = installNativeBehaviors(document, false);
    expect(rightClick(document.body).defaultPrevented).toBe(false);
    uninstall();
  });

  it('defaults to the dev-mode flag', () => {
    installNativeBehaviors()();
  });
});
