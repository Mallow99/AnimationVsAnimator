// Access is granted by clicking the extension, one tab at a time. No all-sites permission.
async function bridge(route, body) {
  const { pairing } = await chrome.storage.local.get("pairing");
  if (!pairing) throw new Error("Pair with the desktop app first.");
  const url = new URL(pairing),
    token = url.searchParams.get("token");
  const response = await fetch(`${url.origin}${route}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "The desktop bridge refused the action.");
  return data;
}
async function active() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active page.");
  return tab;
}
async function ensurePage(tab) {
  if (!/^https?:\/\//.test(tab.url ?? ""))
    throw new Error("Chrome protects this page. Use a regular website.");
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
}
async function cutout(tab, command) {
  const selection = await chrome.tabs.sendMessage(tab.id, {
    action: "selection",
  });
  if (!selection) throw new Error("Pick a visible page element first.");
  const [front] = await chrome.tabs.query({
    active: true,
    windowId: tab.windowId,
  });
  if (front?.id !== tab.id)
    throw new Error(
      "Bring the connected tab to the front to take a screenshot.",
    );
  const data = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const bitmap = await createImageBitmap(await (await fetch(data)).blob());
  const ratio = bitmap.width / selection.viewportWidth;
  const r = selection.rect,
    x = Math.max(0, r.x),
    y = Math.max(0, r.y);
  const width = Math.min(r.width, selection.viewportWidth - x),
    height = Math.min(r.height, selection.viewportHeight - y);
  if (
    width < 2 ||
    height < 2 ||
    r.x < 0 ||
    r.y < 0 ||
    r.x + r.width > selection.viewportWidth ||
    r.y + r.height > selection.viewportHeight
  )
    throw new Error("Scroll so the selected element is fully visible.");
  const shrink = Math.min(1, 640 / width, 440 / height);
  const canvas = new OffscreenCanvas(
    Math.round(width * shrink),
    Math.round(height * shrink),
  );
  canvas
    .getContext("2d")
    .drawImage(
      bitmap,
      x * ratio,
      y * ratio,
      width * ratio,
      height * ratio,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" }),
    bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const image = `data:image/png;base64,${btoa(binary)}`;
  if (image.length > 1500000)
    throw new Error("That image is too large. Select a smaller element.");
  // Deliver before hiding it. If delivery fails, the website stays intact.
  await bridge("/browser/result", {
    id: command.id,
    ok: true,
    cutout: {
      image,
      ...selection.screen,
      width,
      height,
      title: selection.title,
    },
  });
  await chrome.tabs.sendMessage(tab.id, { action: "take" });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (sender.tab) {
      const tab = sender.tab;
      if (message.action !== "tick")
        throw new Error("Unsupported page message.");
      // Only content scripts we injected can send these messages; webpage JS has no bridge access.
      await bridge("/browser/state", {
        ...message.page,
        tab: tab.id,
        title: tab.title,
      });
      for (const command of await bridge(`/browser/commands?tab=${tab.id}`)) {
        try {
          if (command.action === "pluck") {
            await cutout(tab, command);
            continue;
          }
          if (command.action === "closetab") await chrome.tabs.remove(tab.id);
          else if (command.action === "restorepage")
            await chrome.tabs.sendMessage(tab.id, { action: "restore" });
          else throw new Error("Unknown action.");
          await bridge("/browser/result", { id: command.id, ok: true });
        } catch (error) {
          await bridge("/browser/result", {
            id: command.id,
            ok: false,
            error: error.message,
          });
        }
      }
      return { ok: true };
    }
    if (message.action === "save") {
      const url = new URL(message.pairing);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        url.port !== "31415" ||
        !/^[a-f0-9]{64}$/.test(url.searchParams.get("token") ?? "")
      )
        throw new Error("Use the pairing link from desktop Settings.");
      await chrome.storage.local.set({ pairing: url.href });
      return { ok: true, message: "Paired. Now connect a page." };
    }
    const tab = await active();
    await ensurePage(tab);
    if (!["connect", "pick", "restore", "disconnect"].includes(message.action))
      throw new Error("Unknown action.");
    await chrome.tabs.sendMessage(tab.id, { action: message.action });
    return {
      ok: true,
      message:
        message.action === "pick"
          ? "Click a visible element on the page. Escape cancels."
          : "Done.",
    };
  })().then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});
