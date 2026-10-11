import type { FileWindow } from '../shared/desktop';
import type { WinRect } from '../core/world';

/** Document identity survives focusing another app; visibility and geometry come from live windows. */
export class FileDocuments {
  private documents = new Map<number, FileWindow>();
  observe(win: number, document: FileWindow | null) {
    if (document) this.documents.set(win, document);
    else this.documents.delete(win); // That same editor now reports no represented document.
  }
  clear() {
    this.documents.clear();
  }
  visible(windows: WinRect[]) {
    const files: FileWindow[] = [];
    for (const [id, doc] of this.documents) {
      const w = windows.find((w) => w.id === id);
      if (!w) {
        this.documents.delete(id);
        continue;
      }
      files.push({
        ...doc,
        x: w.x,
        y: w.y,
        width: w.w,
        height: w.h,
        tops: doc.tops?.map(([x, y, width, height]) => [
          x + w.x - doc.x,
          y + w.y - doc.y,
          width,
          height,
        ]),
      });
    }
    return files;
  }
}
