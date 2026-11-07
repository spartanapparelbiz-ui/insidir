"use client";
/* A dense, virtualized table (react-window): only the rows in view are in the DOM, so thousands of filings scroll at a
 * constant cost. 28px rows on hairlines, a sticky header, hover glow, ↑/↓ to move the selection, Enter to open it,
 * and `onEnd` near the bottom for infinite scroll. Rows are memoized; a parent re-render that doesn't change the rows
 * or the selection re-renders nothing. */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { areEqual, FixedSizeList, type ListChildComponentProps } from "react-window";

export const ROW_PX = 28;

interface Data<T> {
  rows: readonly T[];
  cols: string;
  render: (row: T, index: number) => ReactNode;
  rowClass?: (row: T) => string;
  selected: string | null;
  rowKey: (row: T) => string;
  onSelect: (row: T, index: number) => void;
  onHover?: (row: T | null) => void;
}

function RowImpl<T>({ index, style, data }: ListChildComponentProps<Data<T>>) {
  const row = data.rows[index]!;
  const key = data.rowKey(row);
  return (
    <div role="row" aria-rowindex={index + 2} aria-selected={key === data.selected} className={`fl-tr ${data.cols}${data.rowClass ? ` ${data.rowClass(row)}` : ""}`}
      style={style} onClick={() => data.onSelect(row, index)} onMouseEnter={data.onHover ? () => data.onHover!(row) : undefined} data-testid="fl-tr">
      {data.render(row, index)}
    </div>
  );
}
const Row = memo(RowImpl, areEqual) as typeof RowImpl;

/** The container's height, kept current as panes resize. */
function useHeight<E extends HTMLElement>(): [React.RefObject<E | null>, number] {
  const ref = useRef<E>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(Math.floor(e!.contentRect.height)));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

export function VTable<T>({ rows, cols, head, render, rowKey, selected, onSelect, onOpen, onEnd, onHover, rowClass, empty, label, footer }: {
  rows: readonly T[]; cols: string; head: ReactNode; render: (row: T, index: number) => ReactNode; rowKey: (row: T) => string;
  selected: string | null; onSelect: (row: T, index: number) => void; onOpen?: (row: T) => void; onEnd?: () => void; onHover?: (row: T | null) => void;
  rowClass?: (row: T) => string; empty: ReactNode; label: string; footer?: ReactNode;
}) {
  const [box, height] = useHeight<HTMLDivElement>();
  const list = useRef<FixedSizeList<Data<T>>>(null);
  const data = useMemo<Data<T>>(() => ({ rows, cols, render, rowClass, selected, rowKey, onSelect, onHover }), [rows, cols, render, rowClass, selected, rowKey, onSelect, onHover]);
  const index = selected === null ? -1 : rows.findIndex(r => rowKey(r) === selected);

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
      onSelect(rows[next]!, next);
      list.current?.scrollToItem(next);
    } else if (e.key === "Enter" && index >= 0 && onOpen) { e.preventDefault(); onOpen(rows[index]!); }
  }, [rows, index, onSelect, onOpen]);

  return (
    <div className="fl-table" role="grid" aria-label={label} aria-rowcount={rows.length + 1} tabIndex={0} onKeyDown={onKey} onMouseLeave={onHover ? () => onHover(null) : undefined}>
      <div role="row" aria-rowindex={1} className={`fl-thead ${cols}`}>{head}</div>
      <div ref={box} className="fl-tbody">
        {!rows.length ? <div className="fl-empty">{empty}</div> : height > 0 ? (
          <FixedSizeList<Data<T>> ref={list} height={height} width="100%" itemCount={rows.length} itemSize={ROW_PX} itemData={data} overscanCount={12}
            itemKey={(i, d) => d.rowKey(d.rows[i]!)}
            onItemsRendered={({ visibleStopIndex }) => { if (onEnd && visibleStopIndex >= rows.length - 25) onEnd(); }}>
            {Row}
          </FixedSizeList>
        ) : null}
      </div>
      {footer}
    </div>
  );
}
