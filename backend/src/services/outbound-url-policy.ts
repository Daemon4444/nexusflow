import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import ipaddr from "ipaddr.js";
import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici";
import { parseEnvList } from "../utils/env-list";
import { isProductionRuntime } from "../utils/runtime-safety";

export const DEFAULT_PROVIDER_OUTBOUND_HOSTS = [
  "api.anthropic.com",
  "dashscope.aliyuncs.com",
  "app-api.pixverse.ai",
  "ark.cn-beijing.volces.com",
  "token.genvia.ai",
] as const;

export type OutboundUrlKind = "provider" | "external-resource";
export type OutboundUrlUsage = "storage-base" | "runtime-request";
export type DnsAddress = { address: string; family: number };
export type OutboundDnsResolver = (hostname: string) => Promise<DnsAddress[]>;

export class OutboundUrlPolicyError extends Error {
  readonly code = "outbound_url_blocked";

  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlPolicyError";
  }
}

function canonicalHostname(value: string): string {
  const unbracketed = value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
  const withoutTrailingDot = unbracketed.replace(/\.+$/, "").toLowerCase();
  const ascii = domainToASCII(withoutTrailingDot);
  if (!ascii || ascii.includes("\0")) {
    throw new OutboundUrlPolicyError("endpoint hostname is invalid");
  }
  return ascii;
}

export function getProviderOutboundHostAllowlist(
  env: NodeJS.ProcessEnv = process.env
): Set<string> {
  const configured = parseEnvList(env.PROVIDER_OUTBOUND_HOST_ALLOWLIST);
  const source = configured.length > 0
    ? configured
    : isProductionRuntime(env)
      ? []
      : [...DEFAULT_PROVIDER_OUTBOUND_HOSTS];
  return new Set(source.map(canonicalHostname));
}

export function assertProviderOutboundPolicyConfigured(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!isProductionRuntime(env)) return;
  const allowlist = getProviderOutboundHostAllowlist(env);
  if (allowlist.size === 0) {
    throw new Error("Production requires PROVIDER_OUTBOUND_HOST_ALLOWLIST");
  }
  if (
    [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
    ].some((key) => !!env[key]?.trim())
  ) {
    throw new Error("Production provider egress forbids outbound proxy environments");
  }
}

export function isPublicUnicastAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    }
    if (parsed.range() !== "unicast") return false;
    const blockedCidrs = parsed.kind() === "ipv4"
      ? [
          "0.0.0.0/8",
          "10.0.0.0/8",
          "100.64.0.0/10",
          "127.0.0.0/8",
          "169.254.0.0/16",
          "172.16.0.0/12",
          "192.0.0.0/24",
          "192.0.2.0/24",
          "192.88.99.0/24",
          "192.168.0.0/16",
          "198.18.0.0/15",
          "198.51.100.0/24",
          "203.0.113.0/24",
          "224.0.0.0/4",
          "240.0.0.0/4",
        ]
      : [
          "::/128",
          "::1/128",
          "64:ff9b::/96",
          "100::/64",
          "2001::/32",
          "2001:2::/48",
          "2001:10::/28",
          "2001:20::/28",
          "2001:db8::/32",
          "2002::/16",
          "fc00::/7",
          "fe80::/10",
          "ff00::/8",
        ];
    return !blockedCidrs.some((cidr) =>
      (parsed as any).match(ipaddr.parseCIDR(cidr) as any)
    );
  } catch {
    return false;
  }
}

export function assertPublicDnsAddresses(hostname: string, addresses: DnsAddress[]): void {
  if (addresses.length === 0) {
    throw new OutboundUrlPolicyError(`endpoint hostname did not resolve: ${hostname}`);
  }
  for (const result of addresses) {
    if (!isPublicUnicastAddress(result.address)) {
      throw new OutboundUrlPolicyError(
        `endpoint hostname resolved to a non-public address: ${hostname}`
      );
    }
  }
}

const defaultResolver: OutboundDnsResolver = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family }));
};

export function parseAndValidateOutboundUrl(
  rawUrl: string | URL,
  options: {
    kind?: OutboundUrlKind;
    usage?: OutboundUrlUsage;
    env?: NodeJS.ProcessEnv;
    allowlist?: ReadonlySet<string>;
  } = {}
): URL {
  const kind = options.kind || "provider";
  const usage = options.usage || "storage-base";
  let url: URL;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
  } catch {
    throw new OutboundUrlPolicyError("endpoint URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new OutboundUrlPolicyError("endpoint URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new OutboundUrlPolicyError("endpoint URL must not contain credentials");
  }
  if (url.hash) {
    throw new OutboundUrlPolicyError("endpoint URL must not contain a fragment");
  }
  if (usage === "storage-base" && url.search) {
    throw new OutboundUrlPolicyError("endpoint base URL must not contain a query");
  }
  if (url.port && url.port !== "443") {
    throw new OutboundUrlPolicyError("endpoint URL must use the standard HTTPS port");
  }

  const hostname = canonicalHostname(url.hostname);
  if (hostname.includes("%")) {
    throw new OutboundUrlPolicyError("endpoint hostname contains an invalid zone identifier");
  }
  if (isIP(hostname)) {
    if (!isPublicUnicastAddress(hostname)) {
      throw new OutboundUrlPolicyError("endpoint IP address is not public");
    }
    if (kind === "provider") {
      throw new OutboundUrlPolicyError("provider endpoints must use an allowlisted hostname");
    }
  }
  if (kind === "provider") {
    const allowlist = options.allowlist || getProviderOutboundHostAllowlist(options.env);
    if (!allowlist.has(hostname)) {
      throw new OutboundUrlPolicyError("provider endpoint hostname is not allowlisted");
    }
  }
  url.hostname = hostname;
  return url;
}

export async function assertSafeOutboundUrl(
  rawUrl: string | URL,
  options: {
    kind?: OutboundUrlKind;
    usage?: OutboundUrlUsage;
    env?: NodeJS.ProcessEnv;
    allowlist?: ReadonlySet<string>;
    resolveDns?: boolean;
    resolver?: OutboundDnsResolver;
  } = {}
): Promise<URL> {
  const url = parseAndValidateOutboundUrl(rawUrl, options);
  if (options.resolveDns !== false) {
    const hostname = canonicalHostname(url.hostname);
    if (!isIP(hostname)) {
      let addresses: DnsAddress[];
      try {
        addresses = await (options.resolver || defaultResolver)(hostname);
      } catch {
        throw new OutboundUrlPolicyError(`endpoint hostname could not be resolved: ${hostname}`);
      }
      assertPublicDnsAddresses(hostname, addresses);
    }
  }
  return url;
}

export async function assertProviderEndpointForStorage(rawUrl: string): Promise<void> {
  const isolatedTestDnsBypass =
    process.env.PROVIDER_OUTBOUND_TEST_SKIP_DNS === "true"
    && process.env.USE_PG_MEM === "true"
    && process.env.NEXUSFLOW_RELEASE_RUNTIME !== "true";
  await assertSafeOutboundUrl(rawUrl, {
    kind: "provider",
    // Production writes receive DNS/CNAME validation. Non-production unit
    // tests still exercise DNS behavior with an injected resolver.
    resolveDns: isProductionRuntime() && !isolatedTestDnsBypass,
  });
}

export function createRestrictedLookup(
  resolver: OutboundDnsResolver = defaultResolver
): (
  hostname: string,
  options: { family?: number },
  callback: (error: Error | null, address?: string, family?: number) => void
) => void {
  return (hostname, options, callback) => {
    resolver(canonicalHostname(hostname))
      .then((addresses) => {
        assertPublicDnsAddresses(hostname, addresses);
        const requestedFamily = Number(options?.family || 0);
        const selected = addresses.find((record) =>
          !requestedFamily || record.family === requestedFamily
        ) || addresses[0];
        callback(null, selected.address, selected.family);
      })
      .catch((error) => {
        callback(
          error instanceof Error
            ? error
            : new OutboundUrlPolicyError("endpoint DNS lookup failed")
        );
      });
  };
}

let directDispatcher: Dispatcher | null = null;

function getRestrictedDispatcher(): Dispatcher {
  if (!directDispatcher) {
    directDispatcher = new Agent({
      connect: {
        lookup: createRestrictedLookup() as any,
      },
    });
  }
  return directDispatcher;
}

export function assertRedirectBlocked(
  status: number,
  location: string | null,
  currentUrl: string
): void {
  if (![301, 302, 303, 307, 308].includes(status)) return;
  let target = "another endpoint";
  if (location) {
    try {
      target = new URL(location, currentUrl).hostname || target;
    } catch {
      target = "an invalid endpoint";
    }
  }
  throw new OutboundUrlPolicyError(`upstream redirect is disabled (${target})`);
}

async function safeOutboundFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  kind: OutboundUrlKind
): Promise<Response> {
  const url = await assertSafeOutboundUrl(rawUrl, {
    kind,
    usage: "runtime-request",
    resolveDns: true,
  });
  const response = await undiciFetch(url, {
    ...(init as any),
    redirect: "manual",
    dispatcher: getRestrictedDispatcher(),
  });
  const location = response.headers.get("location");
  try {
    assertRedirectBlocked(response.status, location, url.href);
  } catch (error) {
    await response.body?.cancel().catch(() => undefined);
    throw error;
  }
  return response as unknown as Response;
}

export function safeProviderFetch(
  rawUrl: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  return safeOutboundFetch(rawUrl, init, "provider");
}

export function safeExternalResourceFetch(
  rawUrl: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  return safeOutboundFetch(rawUrl, init, "external-resource");
}
