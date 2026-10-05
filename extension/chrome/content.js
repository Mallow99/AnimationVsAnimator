(() => {
  if (window.__stickFigureBridge) return;
  window.__stickFigureBridge = true;
  let connected = false,
    selected = null,
    picking = false,
    busy = false;
  const taken = [];
  const highlight = document.createElement("div");
  highlight.style.cssText =
    "position:fixed;pointer-events:none;border:3px solid #6859e8;box-sizing:border-box;z-index:2147483647;display:none;background:#6859e814";
  document.documentElement.append(highlight);
  function screenPoint(r) {
    return {
      x: window.screenX + r.x,
      y: window.screenY + Math.max(0, outerHeight - innerHeight) + r.y,
    };
  }
  function page() {
    const r = selected?.isConnected
      ? selected.getBoundingClientRect()
      : { x: 0, y: 0, width: 1, height: 1 };
    return {
      ...screenPoint(r),
      width: r.width,
      height: r.height,
      selected: !!selected?.isConnected,
    };
  }
  function cancel() {
    picking = false;
    highlight.style.display = "none";
  }
  function restore() {
    for (const [node, visibility, priority] of taken)
      if (node.isConnected) {
        if (visibility)
          node.style.setProperty("visibility", visibility, priority);
        else node.style.removeProperty("visibility");
      }
    taken.length = 0;
  }
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!picking) return;
      const node = event.target;
      if (
        !(node instanceof HTMLElement) ||
        node === highlight ||
        ["HTML", "BODY", "INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)
      ) {
        highlight.style.display = "none";
        return;
      }
      const r = node.getBoundingClientRect();
      highlight.style.display = "block";
      highlight.style.left = `${r.x}px`;
      highlight.style.top = `${r.y}px`;
      highlight.style.width = `${r.width}px`;
      highlight.style.height = `${r.height}px`;
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!picking) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const node = event.target;
      if (
        node instanceof HTMLElement &&
        !["HTML", "BODY", "INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)
      )
        selected = node;
      cancel();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") cancel();
    },
    true,
  );
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.action === "connect") connected = true;
    if (message.action === "pick") {
      connected = true;
      picking = true;
    }
    if (message.action === "restore") restore();
    if (message.action === "disconnect") {
      connected = false;
      cancel();
      restore();
      selected = null;
    }
    if (message.action === "selection") {
      if (!connected || !selected?.isConnected) {
        respond(null);
        return;
      }
      const r = selected.getBoundingClientRect();
      respond({
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        screen: screenPoint(r),
        title: (
          selected.getAttribute("alt") ||
          selected.textContent ||
          selected.tagName
        )
          .trim()
          .slice(0, 80),
      });
      return;
    }
    if (message.action === "take" && selected?.isConnected) {
      taken.push([
        selected,
        selected.style.getPropertyValue("visibility"),
        selected.style.getPropertyPriority("visibility"),
      ]);
      selected.style.setProperty("visibility", "hidden", "important");
      selected = null;
    }
    respond({ ok: true });
  });
  setInterval(async () => {
    if (!connected || document.hidden || busy) return;
    busy = true;
    try {
      const result = await chrome.runtime.sendMessage({
        action: "tick",
        page: page(),
      });
      if (!result?.ok && result?.error?.includes("switched off")) {
        connected = false;
        restore();
      }
    } catch {
      connected = false;
      restore();
    } finally {
      busy = false;
    }
  }, 1000);
  window.addEventListener("pagehide", restore);
})();
