export const el = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
