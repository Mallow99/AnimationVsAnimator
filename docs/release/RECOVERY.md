# Save recovery

The app keeps a previous complete copy of local scene saves and JSON settings/memory
files. A damaged primary recovers from a valid previous copy. Damaged originals are
retained for recovery rather than silently replaced with a new character.

If a save warning appears, keep the app open, free disk space and choose **Retry saves**.
Latest changes remain in memory while the app runs. Normal Quit waits for a save
acknowledgement. If it cannot confirm a save, you can retry, keep the app open, or
explicitly quit without the latest changes.

Use **Settings → Export full backup** before changing machines or troubleshooting.
Also copy the entire save folder while the app is closed to retain Electron's local
scene database. Avoid copying it while the app is writing.

If both a file and its backup are damaged, the app will keep them and report the
problem. Quit, make a separate copy of the save folder, then replace the affected
JSON file with a known-good copy and restart. Do not replace files while the app is open.
Do not hand-edit Chromium's LevelDB files or delete the data folder as a first step.

Full JSON exports use format version 2 and contain `configs`, `worlds`, `memories`,
`definitions` and `productState`. The latter includes saved bonus-buddy unlocks.
Older version-1 exports do not include unlock state. Keep product-state.json when
copying or restoring the full save folder; each buddy also has separate configuration
and memory files. Do not replace existing buddy files to add a bonus buddy.

JSON exports are an additional recovery format; this release does not provide a one-click
importer. Whole-folder backups can be restored with the app closed. Keep the backup
and damaged folder until you have checked names, belongings and conversations.

For a bug report, include the app version, OS version, steps and any visible message.
Use the repository's Issues page: https://github.com/Mallow99/AnimationVsAnimator/issues.
Do not attach memory files, conversations, full backups or provider credentials to a
public issue. The developer can ask for a minimal, anonymized reproduction if needed.
