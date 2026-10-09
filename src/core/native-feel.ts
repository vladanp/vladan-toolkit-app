function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.closest('.select-text') !== null
  );
}

/**
 * Makes the webview behave like a native app in production builds: no browser
 * "Reload / Inspect" context menu outside of text fields and selectable content.
 */
export function installNativeBehaviors(
  doc: Document = document,
  enabled = !import.meta.env.DEV,
): () => void {
  if (!enabled) return () => {};
  const onContextMenu = (event: MouseEvent) => {
    if (!isEditable(event.target)) event.preventDefault();
  };
  doc.addEventListener('contextmenu', onContextMenu);
  return () => doc.removeEventListener('contextmenu', onContextMenu);
}
