# Running a shared Windows copy

1. Extract the entire ZIP into a normal folder (not inside the ZIP preview).
2. Open `AnimationVsAnimator.exe`.
3. Click his tray icon near the clock for Settings or Quit. If it is hidden, use the tray's up-arrow.

You do not need Node, npm, PowerShell commands, or an AI key. Offline mode works immediately.
If you want AI conversation, add your own provider key in Settings → General → Brain.
An unsigned personal build may trigger Windows SmartScreen. Verify who sent it before running it.

His settings, memory and custom items stay in your own Windows app-data folder. They are not
inside the shared app. Closing the pet does not remove these files. To update, quit the old copy
and replace the extracted app folder. Keep the whole folder together; the EXE needs its other files.

Window movement cannot control maximized windows or some apps running as administrator.
The Windows helper reports window/app titles; sitting on individual UI elements is currently Mac-only.

## Making the portable copy

From the project folder, with Node 24 LTS installed:

```sh
npm ci
npm run typecheck
npm run sim
npm run checks
npm run package:win
```

Zip `out/AnimationVsAnimator-win32-x64` and send the ZIP. Windows ARM devices can use
`npm run package:win -- arm64`. This can be built on Mac, Windows, or Linux. The script refuses
to overwrite an existing release; move it out of `out` before rebuilding.

Do not send `node_modules`, your app-data folder, or any provider keys. The packaging script
includes the built application, assets, and Electron runtime only. It retains the native
PowerShell helper outside an archive so Windows can run it.

Actual window control, DPI scaling, tray behavior and cursor hand-back still need a Windows PC
test before handing a release to friends. This is a portable development build, not a signed installer.
