import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorTile } from "./Tiles";

// Catches a render error in one screen so the shell, the navigation and every other screen keep working.
// It shows fixed words and, at most, the error's NAME when that is a plain identifier. The message is never
// shown or logged: it may contain upstream text, and upstream text is untrusted.

interface Props {
  // The boundary resets when this changes (the current location), so leaving a crashed screen recovers.
  readonly resetKey: string;
  readonly children: ReactNode;
}

interface State {
  readonly failed: boolean;
  readonly name: string | null;
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, name: null };
  private lastKey: string;

  constructor(props: Props) {
    super(props);
    this.lastKey = props.resetKey;
  }

  static getDerivedStateFromError(error: unknown): State {
    const name = error instanceof Error && SAFE_NAME.test(error.name) ? error.name : null;
    return { failed: true, name };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const name = error instanceof Error && SAFE_NAME.test(error.name) ? error.name : "error";
    // Name only. The stack and message can carry upstream text.
    console.error(`screen crashed (${name})`);
  }

  override componentDidUpdate(): void {
    if (this.props.resetKey !== this.lastKey) {
      this.lastKey = this.props.resetKey;
      if (this.state.failed) this.setState({ failed: false, name: null });
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorTile
        code="ROUTE_CRASHED"
        title="This screen stopped working"
        message={`The rest of the app is fine. Choose another screen, or reload the page.${this.state.name === null ? "" : ` (${this.state.name})`}`}
      />
    );
  }
}
