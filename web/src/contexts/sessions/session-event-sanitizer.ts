import type { eventWithTime } from "rrweb";

// Simple proxy deployed to our CF Workers
const PROXY = "https://ironveil.fec.workers.dev/";

function proxy(url: string): string {
  return /^https?:/.test(url) ? `${PROXY}${encodeURIComponent(url)}` : url;
}

const CSS_URL = /url\((['"]?)(https?:[^)'" ]+)\1\)/g;

function proxyCss(css: string): string {
  return css.replace(CSS_URL, (_m, q: string, url: string) => `url(${q}${proxy(url)}${q})`);
}

function proxyAttrs(attrs?: Record<string, unknown>) {
  if (!attrs) return;
  for (const key in attrs) {
    const v = attrs[key] as string;
    if (typeof v !== "string") continue;
    attrs[key] = key === "style" || key === "_cssText" ? proxyCss(v) : proxy(v);
  }
}

function applyProxify(node: any) {
  if (node.type === 3 && node.isStyle && typeof node.textContent === "string") {
    node.textContent = proxyCss(node.textContent);
  }
  proxyAttrs(node.attributes);
}

const PLACEHOLDER = "SCRIPT_PLACEHOLDER";

function stripPlaceholders(node: any) {
  if (node.type === 3 && node.textContent === PLACEHOLDER) {
    node.textContent = "";
  }
  if (node.attributes) {
    for (const k in node.attributes) {
      const v = node.attributes[k];
      if (typeof v === "string" && v.includes(PLACEHOLDER)) {
        delete node.attributes[k];
      }
    }
  }
}

const PROCESSORS = [applyProxify, stripPlaceholders];

function processNode(node: any) {
  for (const fn of PROCESSORS) fn(node);
}

function traverse(node: any) {
  if (!node) return;
  processNode(node);
  if (Array.isArray(node.childNodes)) node.childNodes.forEach(traverse);
}

/**
 * Sanitizes the RRWeb events based on some rules.
 *  - proxies external resources to avoid CORS issues
 *  - removes script placeholders from replay
 */
export function sanitizeEvents(e: eventWithTime): eventWithTime {
  if (e.type === 2) {
    traverse((e as any).data.node);
  } else if (e.type === 3 && (e as any).data.source === 0) {
    const d = (e as any).data;
    d.adds?.forEach((add: any) => traverse(add.node));
    d.attributes?.forEach((c: any) => proxyAttrs(c.attributes));
  }
  return e;
}
