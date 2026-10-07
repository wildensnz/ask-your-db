import type { QueryResult } from '@/lib/db';
import { formatCell, isMoneyColumn } from '@/lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PREVIEW_ROWS = 50;

export function ResultTable({ result }: { result: QueryResult }) {
  const rows = result.rows.slice(0, PREVIEW_ROWS);
  const numeric = new Set(
    result.columns.filter((c) =>
      result.rows.some((r) => typeof r[c] === 'number'),
    ),
  );

  if (result.rowCount === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
        The query returned no rows.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border [&_[data-slot=table-container]]:max-h-80 [&_[data-slot=table-container]]:overflow-auto">
      <div>
        <Table>
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              {result.columns.map((c) => (
                <TableHead
                  key={c}
                  className={numeric.has(c) ? 'text-right' : undefined}
                >
                  {c}
                  {isMoneyColumn(c) && numeric.has(c) ? (
                    <span className="text-muted-foreground ml-1 font-normal">
                      RD$
                    </span>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {result.columns.map((c) => (
                  <TableCell
                    key={c}
                    className={
                      numeric.has(c)
                        ? 'text-right font-mono text-xs tabular-nums'
                        : 'max-w-64 truncate'
                    }
                    title={typeof row[c] === 'string' ? row[c] : undefined}
                  >
                    {numeric.has(c) && isMoneyColumn(c)
                      ? formatCell(c, row[c]).replace('RD$ ', '')
                      : formatCell(c, row[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.rowCount > PREVIEW_ROWS ? (
        <p className="text-muted-foreground border-t px-3 py-1.5 text-xs">
          Showing the first {PREVIEW_ROWS} of {result.rowCount} rows.
        </p>
      ) : null}
    </div>
  );
}
