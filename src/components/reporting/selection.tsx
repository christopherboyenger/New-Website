"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Page-local row selection. Selection is UI state, not URL state: it resets
 * when the visible rows change (new page, sort or range).
 */
export function useRowSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [forIds, setForIds] = useState(ids);
  if (forIds !== ids) {
    // Visible rows changed: drop selections that are no longer on the page.
    setForIds(ids);
    setSelected((prev) => new Set([...prev].filter((id) => ids.includes(id))));
  }
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = !allChecked && ids.some((id) => selected.has(id));
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => setSelected(allChecked ? new Set() : new Set(ids)), [allChecked, ids]);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, allChecked, someChecked, toggle, toggleAll, clear };
}

/** Labelled checkbox with a real indeterminate state ("some rows selected"). */
export function SelectionCheckbox({ label, checked, indeterminate = false, onChange }: { label: string; checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="-m-2 inline-flex cursor-pointer p-2 max-md:-m-3 max-md:p-3">
      <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} className="size-4 cursor-pointer rounded border-line-strong accent-ink" />
    </label>
  );
}
