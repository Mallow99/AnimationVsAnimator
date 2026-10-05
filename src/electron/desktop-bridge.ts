// A loopback-only bridge for the Chrome extension. No remote service.
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type {
  BrowserPage,
  DesktopResult,
  DesktopState,
  PageCutout,
} from "../shared/desktop";
import { writeAtomic } from "./storage";

interface BrowserCommand {
  id: string;
  action: string;
  tab: number;
  owner: number;
}
interface Waiting {
  command: BrowserCommand;
  finish: (result: DesktopResult) => void;
  timer: NodeJS.Timeout;
}
export interface BridgeOptions {
  dataDir: string;
  enabled(): boolean;
  changed(state: DesktopState): void;
  cutout(cutout: PageCutout): void;
}

export class DesktopBridge {
  private server: http.Server | null = null;
  private secret: string;
  private browser: BrowserPage | null = null;
  private browserAt = 0;
  private waiting = new Map<string, Waiting>();
  private queue: BrowserCommand[] = [];
  private tick: NodeJS.Timeout | undefined;
  port = 0;
  constructor(private options: BridgeOptions) {
    const file = path.join(options.dataDir, "desktop-bridge.json");
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8"));
      this.secret = /^[a-f0-9]{64}$/.test(stored.secret)
        ? stored.secret
        : randomBytes(32).toString("hex");
    } catch {
      this.secret = randomBytes(32).toString("hex");
    }
    this.persist();
  }
  private persist() {
    writeAtomic(
      path.join(this.options.dataDir, "desktop-bridge.json"),
      JSON.stringify({ secret: this.secret }),
    );
  }
  get pairing() {
    return `http://127.0.0.1:${this.port}/?token=${this.secret}`;
  }
  get state(): DesktopState {
    return {
      browser:
        this.options.enabled() && Date.now() - this.browserAt < 6000
          ? this.browser
          : null,
    };
  }
  async start(port = 31415) {
    this.server = http.createServer((req, res) => {
      this.route(req, res).catch(() =>
        this.respond(res, 400, { error: "Invalid request" }),
      );
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "127.0.0.1", () => {
        this.server!.removeListener("error", reject);
        resolve();
      });
    });
    this.port = (this.server.address() as import("node:net").AddressInfo).port;
    this.tick = setInterval(() => {
      if (this.browser && Date.now() - this.browserAt > 6000) {
        this.browser = null;
        this.options.changed(this.state);
      }
    }, 1000);
    this.options.changed(this.state);
  }
  async stop() {
    clearInterval(this.tick);
    for (const wait of this.waiting.values()) {
      clearTimeout(wait.timer);
      wait.finish({ ok: false, message: "The app closed." });
    }
    this.waiting.clear();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    this.server = null;
  }
  private respond(res: ServerResponse, status: number, data: unknown) {
    if (res.writableEnded) return;
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  }
  private async body(req: IncomingMessage): Promise<any> {
    let total = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 2_000_000) throw new Error("Too large");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  private authenticated(req: IncomingMessage, url: URL) {
    const supplied =
      req.headers.authorization?.replace(/^Bearer /, "") ??
      url.searchParams.get("token") ??
      "";
    return (
      supplied.length === this.secret.length &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(this.secret))
    );
  }
  private async route(req: IncomingMessage, res: ServerResponse) {
    // Reject web origins even if someone accidentally exposes a pairing URL on a page.
    const origin = req.headers.origin;
    if (
      origin &&
      !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) &&
      origin !== `http://127.0.0.1:${this.port}`
    )
      return this.respond(res, 403, { error: "Origin refused" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.headers.host !== `127.0.0.1:${this.port}`)
      return this.respond(res, 403, { error: "Host refused" });
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    if (!this.authenticated(req, url))
      return this.respond(res, 401, {
        error: "Pair the extension in Settings.",
      });
    if (!this.options.enabled())
      return this.respond(res, 403, {
        error: "Chrome play is switched off in Settings.",
      });
    if (url.pathname === "/browser/state" && req.method === "POST") {
      const b = await this.body(req);
      if (
        !Number.isInteger(b.tab) ||
        ![b.x, b.y, b.width, b.height].every(Number.isFinite)
      )
        return this.respond(res, 400, { error: "Invalid page" });
      this.browser = {
        tab: b.tab,
        title: String(b.title ?? "").slice(0, 80),
        selected: b.selected === true,
        x: b.x,
        y: b.y,
        width: Math.max(1, Math.min(1200, b.width)),
        height: Math.max(1, Math.min(800, b.height)),
      };
      this.browserAt = Date.now();
      this.options.changed(this.state);
      return this.respond(res, 200, { ok: true });
    }
    if (url.pathname === "/browser/commands" && req.method === "GET") {
      const tab = Number(url.searchParams.get("tab"));
      const commands = this.queue.filter(
        (c) => c.tab === tab && this.waiting.has(c.id),
      );
      this.queue = this.queue.filter(
        (c) => c.tab !== tab && this.waiting.has(c.id),
      );
      return this.respond(res, 200, commands);
    }
    if (url.pathname === "/browser/result" && req.method === "POST") {
      const b = await this.body(req),
        wait = this.waiting.get(b.id);
      if (!wait)
        return this.respond(res, 409, { error: "That command expired." });
      let ok = b.ok === true;
      if (ok && wait.command.action === "pluck") {
        const c = b.cutout;
        if (
          !c ||
          typeof c.image !== "string" ||
          !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c.image) ||
          c.image.length > 1_500_000 || Buffer.from(c.image.split(',')[1]??'', 'base64').subarray(0,8).toString('hex')!=='89504e470d0a1a0a' ||
          ![c.x, c.y, c.width, c.height].every(Number.isFinite) ||
          c.width < 1 ||
          c.height < 1
        )
          ok = false;
        else
          this.options.cutout({
            id: b.id,
            image: c.image,
            x: c.x,
            y: c.y,
            width:c.width*Math.min(1,320/c.width,220/c.height),
            height:c.height*Math.min(1,320/c.width,220/c.height),
            title: String(c.title ?? "Page fragment").slice(0, 80),
            owner: wait.command.owner,
          });
      }
      clearTimeout(wait.timer);
      this.waiting.delete(b.id);
      wait.finish({
        ok,
        message: ok
          ? wait.command.action === "closetab"
            ? "Tab closed."
            : wait.command.action === "restorepage"
              ? "The page is restored."
              : "Got it!"
          : String(b.error ?? "Chrome could not do that.").slice(0, 180),
      });
      return this.respond(res, 200, { ok: true });
    }
    return this.respond(res, 404, { error: "Unknown action" });
  }
  browserAction(
    action: "closetab" | "pluck" | "restorepage",
    owner: number,
  ): Promise<DesktopResult> {
    const page = this.state.browser;
    if (!page)
      return Promise.resolve({
        ok: false,
        message: "Connect this Chrome page with the extension first.",
      });
    if (action === "pluck" && !page.selected)
      return Promise.resolve({
        ok: false,
        message: "Pick something on the page in the Chrome extension first.",
      });
    if (this.waiting.size >= 8)
      return Promise.resolve({ ok: false, message: "Chrome is still busy." });
    const command = {
      id: randomBytes(12).toString("hex"),
      action,
      tab: page.tab,
      owner,
    };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(command.id);
        this.queue = this.queue.filter((c) => c.id !== command.id);
        resolve({
          ok: false,
          message:
            "Chrome did not respond. Open the connected tab and try again.",
        });
      }, 10000);
      this.waiting.set(command.id, { command, timer, finish: resolve });
      this.queue.push(command);
    });
  }
}
