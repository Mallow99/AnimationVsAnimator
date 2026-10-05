# Chrome, cursor weapons, and real file/folder visits

These features use the desktop app. They do not need an AI key. Offline remains the default.

## Weapons and fighting

In **General → Your cursor weapons**, choose Sword, Mace, or Pistol. Hold the mouse button and
swing the sword/mace through a figure; the pistol aims toward the closest desktop figure.
While armed, the overlay receives your desktop clicks. Click **Put away** in the visible toolbar
to resume ordinary desktop clicks. Escape also works when the app receives keyboard input.

Figures have their own pistol in Items. Ask **draw a pistol** to make one with the pen, then
**fire your pistol**. A six-round magazine remains with that item across bursts and reloads.
Play fights use foam rounds. The break meter is hidden; General's developer option shows pressure.
Pressure accumulates from guarding and hits, recovers after a pause, and a broken guard exposes them.

**Draw a sword** makes a working ink version. Their offline lives also include replacing existing
tools with drawings. The ink versions preserve the tool's function and are saved with the figure.

## A larger group

General enables companions and selects 2–5 figures. Each figure's settings are in the tray menu.
Blurp remains inventive, Leonard competitive; Moss, Violet, and Ruby have gentle, mischievous,
and adventurous defaults. Personality affects offline choices and combat, and gives optional AI context.
Size stays under your control. Named requests such as **high five Moss, then draw a pistol** select
the intended companion. Every pair has a separate saved relationship.

## Connect Chrome

1. Run the desktop app. Enable **General → Play with connected Chrome pages**.
2. Click **Open Chrome extension folder**. Build first if developing (`npm run build`).
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select that
   folder (`dist/extension/chrome` in a development checkout).
4. In desktop Settings, click **Copy Chrome pairing link**. Paste it into the extension popup and pair.
5. On a regular website, open the extension and click **Let them onto this page**.

Chrome protects pages such as its settings and extension store; this extension uses `activeTab`,
not permission to read every website. Connecting a page permits its interaction while visible.
Pairing connects to `127.0.0.1:31415` with an app-specific token; this is a local service.

Click **Pick something they can take**, then click a fully visible page element. Ask a figure
**take that off the page**, or use the **Take selected page element** activity. Its screenshot becomes
an object on the desktop; the original is hidden with its layout preserved. The figure briefly holds
it, then it falls. You can drag and toss it. No website scripts are executed by the pet app.

Ask **restore the page**, or click **Put everything back** / **Disconnect this page** in the extension.
The original element's visibility is restored. Reloading the website also restores its original DOM.
This is a visual extraction; it does not move a website's underlying data into your filesystem.

**Close connected Chrome tab** closes that actual tab. **Allow requested window closing** is a
separate setting for other native windows. Window closing uses the normal close action, so an app can
show a save prompt or refuse. They do not force quit an app. AI autonomous plans cannot close windows,
close tabs, or choose file/folder homes; these require your request.

## Existing folders and documents

The owner explicitly rejected a special HTML room in Chrome. This build creates no room files.

Use **Enter a folder…** and choose an existing folder. The figure's identity is associated with its
exact path. When that folder's actual Finder/Explorer window is visible, the figure appears within it;
when closed or showing another folder, the figure hides. The association and its state survive an app
restart. **Return to desktop** brings the same figure and memories back. Other figures can visit that
same folder and interact there.

On Mac, Finder location detection uses a fixed, read-only Automation query; macOS may ask for permission
to control Finder. The native helper also needs the existing Accessibility setup. On Windows, Explorer
location detection uses `Shell.Application`. Neither query modifies your files.

**Enter a file…** associates an existing document with its path. Mac document apps exposing
Accessibility's document URL can be detected. This is not established for every editor, Chrome file
viewer, or Windows document app. Folder and document behavior must be tested on real hardware.

**Current limit:** figures are drawn by this app's overlay, clipped inside the real window and behind
windows in front. Finder itself does not execute or store the animation. The entry is currently a
transfer, without a finished crawl-through-icon animation. Do not treat this prototype as completion
of every part of the owner's file request. Native placement, matching, occlusion, Spaces, permission
prompts, and movement need Mac feedback before that claim can be made.

Apple's [Finder Sync extension](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Finder.html)
supports badges, contextual menus, and toolbar buttons; it does not expose an arbitrary animation pane.
[`kAXDocumentAttribute`](https://developer.apple.com/documentation/applicationservices/kaxdocumentattribute)
identifies a represented document's URL.

## Verification

`npm run checks` checks core behavior and local bridge authorization/routing.
`npm run sim` checks physics and offline/AI behavior using simulated model replies.
`SOAK_FIGURES=5 SOAK_SECONDS=300 SOAK_SEED=1 npm run soak` exercises group life and furniture.
`npm run browsercheck` exercises the real overlay in Chromium.
`npm run chromecheck` runs actual picker/bridge/crop/restore code against a real Chromium DOM/canvas,
with simulated Chrome extension API calls. It does not verify installed Chrome permissions or real
Chrome tab closing. A separate Linux/Xvfb Electron smoke verified real preload/settings IPC, group resizing, cursor equipment, and bridge-to-overlay fragment rendering. Mac and Windows native helpers are not executed by those cloud checks.
