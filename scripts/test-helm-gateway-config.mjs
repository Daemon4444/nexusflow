import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const digest = `sha256:${"0".repeat(64)}`;
const args = [
  "template", "nexusflow", "deploy/helm/nexusflow",
  "--namespace", "nexusflow-staging",
  "--set", "images.backend.repository=example.invalid/backend",
  "--set", `images.backend.digest=${digest}`,
  "--set", "images.frontend.repository=example.invalid/frontend",
  "--set", `images.frontend.digest=${digest}`,
  "--set", "images.gateway.repository=example.invalid/gateway",
  "--set", `images.gateway.digest=${digest}`,
];
const rendered = execFileSync("helm", args, { encoding: "utf8" });
const documents = [];
yaml.loadAll(rendered, (document) => documents.push(document));
const configMap = documents.find(
  (document) => document?.kind === "ConfigMap" && document?.metadata?.name === "nexusflow-gateway"
);
assert.ok(configMap, "gateway ConfigMap must render");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexusflow-gateway-"));
try {
  const mimeTypes = ["/etc/nginx/mime.types", "/opt/homebrew/etc/nginx/mime.types"]
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(mimeTypes, "nginx mime.types must exist");
  for (const [name, contents] of Object.entries(configMap.data)) {
    fs.writeFileSync(path.join(directory, name), String(contents));
  }
  for (const name of Object.keys(configMap.data)) {
    const file = path.join(directory, name);
    const rewritten = fs.readFileSync(file, "utf8")
      .replaceAll("/etc/nginx/mime.types", mimeTypes)
      .replaceAll("/etc/nginx/snippets/", `${directory}/`)
      .replaceAll("/etc/nginx/auth/.htpasswd", `${directory}/.htpasswd`)
      .replace("server nexusflow-api:3001", "server 127.0.0.1:3001")
      .replace("server nexusflow-web:3000", "server 127.0.0.1:3000");
    fs.writeFileSync(file, rewritten);
  }
  fs.writeFileSync(
    path.join(directory, ".htpasswd"),
    `admin:$2y$10$abcdefghijklmnopqrstuvwxyz01234567890123456789012\n`,
    { mode: 0o600 }
  );
  execFileSync("nginx", ["-t", "-p", directory, "-c", path.join(directory, "nginx.conf")], {
    stdio: "inherit",
  });
  console.log("helm-gateway-config-test-passed");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
