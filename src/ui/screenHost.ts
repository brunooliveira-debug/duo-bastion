// One full-screen panel at a time (menus, lobby, options, codex, company builder): showing a screen removes the previous one.
let current: HTMLElement | null = null;
export function show(el: HTMLElement) {
  current?.remove();
  current = el;
  document.body.append(el);
}
export function hideScreens() { current?.remove(); current = null; }
