import { spawn } from "child_process";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";

const baseUrl = process.env.UI_SMOKE_BASE_URL || "https://nexusflow.hk";
const sessionToken = process.env.UI_SMOKE_SESSION_TOKEN || "";
const port = Number(process.env.UI_SMOKE_DEBUG_PORT || 9223);
const chromeBin = process.env.CHROME_BIN || "google-chrome";

const routes = [
  "/",
  "/models",
  "/pricing",
  "/docs",
  "/docs/quickstart",
  "/docs/api/chat",
  "/docs/api/qwen",
  "/docs/api/tasks",
  "/docs/api/videos",
  "/docs/api/happyhorse",
  "/docs/multi-protocol",
  "/dashboard",
  "/settings",
  "/keys",
  "/billing",
  "/rate-limits",
  "/tickets",
  "/activity",
  "/monitor",
  "/playground",
  "/models/qwen3.6-plus",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function waitForChrome() {
  for (let i = 0; i < 50; i += 1) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Chrome did not start");
}

let nextId = 1;

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.pending = new Map();
    this.onEvent = null;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      } else if (message.method && this.onEvent) {
        this.onEvent(message);
      }
    };
  }

  send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
}

async function terminateChrome(chrome) {
  if (chrome.exitCode !== null || chrome.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  chrome.kill("SIGTERM");
  await exited;
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexusflow-ui-smoke-"));
  const chrome = spawn(chromeBin, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });

  try {
    const version = await waitForChrome();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });

    const cdp = new CdpClient(socket);
    const failures = [];
    let currentRoute = "";

    cdp.onEvent = (message) => {
      if (message.method === "Runtime.exceptionThrown") {
        const detail = message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || "";
        failures.push({ route: currentRoute, type: "exception", detail });
      }
      if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) {
        const detail = (message.params.args || []).map((arg) => arg.value || arg.description).join(" ");
        failures.push({ route: currentRoute, type: "console", detail });
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        failures.push({ route: currentRoute, type: "log", detail: message.params.entry.text });
      }
      if (message.method === "Network.responseReceived") {
        const response = message.params.response;
        if (response.status >= 500) {
          failures.push({ route: currentRoute, type: "http", detail: `${response.status} ${response.url}` });
        }
      }
      if (message.method === "Network.loadingFailed") {
        const resourceType = message.params.type;
        const errorText = message.params.errorText || "";
        if (!["Image", "Media", "Font"].includes(resourceType) && !/net::ERR_ABORTED/.test(errorText)) {
          failures.push({ route: currentRoute, type: "network", detail: `${resourceType} ${errorText}` });
        }
      }
    };

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");

    await cdp.send("Page.navigate", { url: baseUrl });
    await sleep(1200);
    if (sessionToken) {
      await cdp.send("Runtime.evaluate", {
        expression: `localStorage.setItem("air_session_token", ${JSON.stringify(sessionToken)})`,
        awaitPromise: true,
      });
    }

    const results = [];
    for (const route of routes) {
      currentRoute = route;
      const beforeCount = failures.length;
      await cdp.send("Page.navigate", { url: baseUrl + route });
      await sleep(2500);
      const evaluated = await cdp.send("Runtime.evaluate", {
        expression: "({ title: document.title, text: document.body.innerText.slice(0, 600), url: location.href })",
        returnByValue: true,
      });
      const value = evaluated.result?.result?.value || {};
      const routeFailures = failures
        .slice(beforeCount)
        .filter((failure) => !/favicon|api\\.qrserver/.test(failure.detail));

      if (/This page couldn.t load|Application error|Unhandled Runtime Error|500 Internal Server Error/i.test(value.text || "")) {
        routeFailures.push({ route, type: "body", detail: String(value.text || "").slice(0, 180) });
      }

      results.push({ route, failures: routeFailures });
      const detail = routeFailures.map((failure) => `[${failure.type}] ${String(failure.detail).slice(0, 120)}`).join(" | ");
      console.log(`${routeFailures.length ? "FAIL" : "PASS"} ${route}${detail ? ` ${detail}` : ""}`);
    }

    socket.close();
    const failed = results.filter((result) => result.failures.length > 0);
    console.log(`SUMMARY ${routes.length - failed.length}/${routes.length} passed`);
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await terminateChrome(chrome);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
