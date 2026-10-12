import type { DesktopInfo } from '../shared/desktop';

export function fileVisitView(
  info: DesktopInfo,
  names: string[],
  target: number | null,
  active: number[],
) {
  const homes = info.homes.filter((h) => target === null || h.id === target);
  return {
    chooseFolder: target !== null && active.includes(target) && info.foldersSupported,
    chooseFile: target !== null && active.includes(target) && info.filesSupported,
    returnIds: homes.map((h) => h.id),
    locations: homes.length
      ? homes
          .map(
            (h) =>
              `${names[h.id] ?? 'Figure'} · ${h.kind === 'file' ? 'File' : 'Folder'} · ${h.visible ? 'Window detected' : 'Waiting for its window'}\n${h.path}`,
          )
          .join('\n\n')
      : target === null
        ? 'Everyone is on the desktop.'
        : `${names[target] ?? 'Figure'} is on the desktop.`,
    help:
      target === null
        ? 'Select a name above to choose a file or folder. Return all visitors recalls everyone listed here.'
        : !active.includes(target)
          ? 'Add this figure to the roster before choosing a visit.'
          : !info.foldersSupported
            ? 'File and folder visits need the desktop app on Mac or Windows.'
            : info.filesSupported
              ? 'Choose an existing folder, or open a file in its Mac app before selecting it. Return works even when that window is closed.'
              : 'Choose an existing folder in Explorer. Document visits are currently available on Mac only.',
    warning: info.fileNote,
  };
}
