import { useId, type ReactNode } from "react";

import { EmptyTile } from "./Tiles";
import { Missing } from "./primitives";

// A real <table>: caption, header cells with scope, optional row headers, and a scroll region that is itself
// focusable so a keyboard user can scroll a wide table at 360 px (the page never scrolls sideways).
// Cells with null or undefined render as "no data", never as 0 or an empty string. Market text in a cell goes
// through <UntrustedText>, which the column's `render` supplies.

export interface Column<Row> {
  readonly key: string;
  // Fixed app text. The unit goes here ("Volume (USD)"), so no number floats without a unit.
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
  // Numbers align to the end with tabular figures.
  readonly align?: "start" | "end";
  // The cell that names the row for a screen reader (for example the market title).
  readonly rowHeader?: boolean;
}

export interface DataTableProps<Row> {
  readonly caption: string;
  readonly captionHidden?: boolean;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row, index: number) => string;
  // Shown instead of an empty table.
  readonly empty?: ReactNode;
}

function cell(value: ReactNode): ReactNode {
  return value === null || value === undefined ? <Missing /> : value;
}

export function DataTable<Row>({ caption, captionHidden = false, columns, rows, rowKey, empty }: DataTableProps<Row>) {
  const captionId = useId();
  if (rows.length === 0) {
    return <>{empty ?? <EmptyTile title={caption}>There are no rows to show. This is an empty result, not an error and not a zero.</EmptyTile>}</>;
  }
  return (
    <div className="ui-table-scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className="ui-table">
        <caption id={captionId} className={captionHidden ? "ui-visually-hidden" : undefined}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" data-align={column.align === "end" ? "end" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => {
                const align = column.align === "end" ? "end" : undefined;
                return column.rowHeader === true ? (
                  <th key={column.key} scope="row" data-align={align}>
                    {cell(column.render(row))}
                  </th>
                ) : (
                  <td key={column.key} data-align={align}>
                    {cell(column.render(row))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
