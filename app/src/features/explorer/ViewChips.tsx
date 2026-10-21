// The four view chips of the one table: All, Holdings, Linked, Signals (views.ts). A chip is a 44 px toggle with
// aria-pressed and the count of loaded rows in that view; pressing one narrows the table and never requests anything.

import { Chip } from "../../ui";
import { VIEW_IDS, VIEW_LABELS, type ViewId } from "./views";

export interface ViewChipsProps {
  readonly view: ViewId;
  readonly counts: Readonly<Record<ViewId, number>> | null;
  readonly onView: (view: ViewId) => void;
}

export function ViewChips({ view, counts, onView }: ViewChipsProps) {
  return (
    <div className="ui-chips explorer-chips" role="group" aria-label="View">
      {VIEW_IDS.map((id) => (
        <Chip key={id} pressed={view === id} count={counts === null ? undefined : counts[id]} onClick={() => onView(id)} data-view={id}>
          {VIEW_LABELS[id]}
        </Chip>
      ))}
    </div>
  );
}
