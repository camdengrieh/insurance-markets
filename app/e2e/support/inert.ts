import type { Page } from "@playwright/test";

import { FORBIDDEN_URL_PARTS } from "../../../bridge/test/e2e/corpus";

// What "renders inert" means, checked on the live DOM of a page that has market text on it. Returns the problems found
// (an empty list is a pass) so a failing test prints all of them at once.

export interface DomProblems {
  readonly eventHandlerAttributes: readonly string[];
  readonly dangerousElements: readonly string[];
  readonly foreignAnchors: readonly string[];
  readonly dangerousUrls: readonly string[];
  readonly probeSet: boolean;
  // Text nodes that contain markup syntax from a payload OUTSIDE the fixed untrusted slot (market text may appear only inside one).
  readonly markupOutsideSlots: readonly string[];
  // Forms with an action, or image inputs: the app's own search form has neither.
  readonly activeForms: readonly string[];
}

export async function domProblems(page: Page): Promise<DomProblems> {
  return page.evaluate((forbidden: readonly string[]) => {
    const handlers: string[] = [];
    const dangerous: string[] = [];
    const anchors: string[] = [];
    const urls: string[] = [];
    const markup: string[] = [];
    const forms: string[] = [];
    const urlAttributes = ["src", "href", "action", "formaction", "srcdoc", "data", "poster", "xlink:href", "background", "ping", "cite"];
    for (const element of Array.from(document.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/i.test(attribute.name)) handlers.push(`${element.tagName.toLowerCase()}[${attribute.name}]`);
        if (urlAttributes.includes(attribute.name.toLowerCase())) {
          const value = attribute.value.toLowerCase();
          if (forbidden.some((part) => value.includes(part))) urls.push(`${element.tagName.toLowerCase()}[${attribute.name}=${attribute.value.slice(0, 60)}]`);
        }
      }
      const tag = element.tagName.toLowerCase();
      // The build's own tags are script/link/meta in <head> only; nothing in <body> may be one of these.
      if (element.closest("body") !== null && ["script", "iframe", "object", "embed", "img", "svg", "style", "link", "meta", "base", "audio", "video", "source", "template", "frame", "frameset", "applet"].includes(tag)) {
        dangerous.push(tag);
      }
    }
    for (const anchor of Array.from(document.querySelectorAll("a"))) {
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("#")) anchors.push(href.slice(0, 80));
    }
    for (const form of Array.from(document.querySelectorAll("form"))) {
      if (form.hasAttribute("action") || form.hasAttribute("formaction")) forms.push("form[action]");
    }
    for (const input of Array.from(document.querySelectorAll("input[type=image], [formaction]"))) forms.push(input.tagName.toLowerCase());
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      const looksLikePayload = /<\s*(img|script|svg|iframe|style|a)\b/i.test(text) || /on(error|load|mouseover)\s*=|javascript:/i.test(text);
      if (looksLikePayload && node.parentElement?.closest("[data-trust], .ui-untrusted-block") === null) markup.push(text.slice(0, 80));
    }
    return {
      eventHandlerAttributes: handlers,
      dangerousElements: dangerous,
      foreignAnchors: anchors,
      dangerousUrls: urls,
      probeSet: Object.keys(window).some((key) => key === "__pwned"),
      markupOutsideSlots: markup,
      activeForms: forms,
    };
  }, FORBIDDEN_URL_PARTS);
}

export function isClean(problems: DomProblems): boolean {
  return (
    problems.eventHandlerAttributes.length === 0 &&
    problems.dangerousElements.length === 0 &&
    problems.foreignAnchors.length === 0 &&
    problems.dangerousUrls.length === 0 &&
    problems.markupOutsideSlots.length === 0 &&
    problems.activeForms.length === 0 &&
    !problems.probeSet
  );
}
