export type DesktopAction =
  'closetab' | 'closewindow' | 'pluck' | 'restorepage' | 'folder' | 'file';
export interface DesktopResult {
  ok: boolean;
  message: string;
}
export interface BrowserPage {
  title: string;
  tab: number;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageCutout {
  id: string;
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  owner: number;
}
export interface FileWindow {
  id: number;
  path: string;
  kind: 'folder' | 'file';
  x: number;
  y: number;
  width: number;
  height: number;
  tops?: [number, number, number, number][];
}
export interface DesktopState {
  browser: BrowserPage | null;
}
