import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

// A Chromium-free component test kit: React's own `act` and react-dom/client into a jsdom document. No
// Testing Library (it is not a dependency, and the app's supply-chain rules add none). A test file starts
// with `// @vitest-environment jsdom` and calls cleanup() in afterEach.
//
// This file is test support only: nothing under src/ imports it except *.test.tsx files, so it never
// enters a build. It imports no Node module, so the boundary check treats it like any other app source.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  readonly root: Root;
  readonly container: HTMLElement;
}

const mounted: Mounted[] = [];

export interface Rendered {
  readonly container: HTMLElement;
  rerender(ui: ReactElement): void;
  unmount(): void;
}

export function render(ui: ReactElement): Rendered {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  const entry: Mounted = { root, container };
  mounted.push(entry);
  return {
    container,
    rerender(next) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export function cleanup(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  document.body.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.title = "";
}

// Let pending promises (route loading, query resolution) settle inside act.
export async function settle(rounds: number = 5): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export function click(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

export function press(element: Element, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

export function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`no element matches ${selector}`);
  return found;
}

export function allText(root: ParentNode): string {
  return (root.textContent ?? "").replace(/\s+/g, " ").trim();
}

export { act };
