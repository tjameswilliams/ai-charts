import { useState, useCallback, useRef, useEffect } from "react";

const STORAGE_KEY = "ai-charts-pane-widths";

interface PaneWidths {
  sidebar: number;
  chatInspector: number;
}

const DEFAULTS: PaneWidths = { sidebar: 260, chatInspector: 420 };
const LIMITS = {
  sidebar: { min: 200, max: 400 },
  chatInspector: { min: 320, max: 700 },
};

function loadWidths(): PaneWidths {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        sidebar: Math.min(LIMITS.sidebar.max, Math.max(LIMITS.sidebar.min, parsed.sidebar ?? DEFAULTS.sidebar)),
        chatInspector: Math.min(
          LIMITS.chatInspector.max,
          Math.max(LIMITS.chatInspector.min, parsed.chatInspector ?? DEFAULTS.chatInspector)
        ),
      };
    }
  } catch {}
  return { ...DEFAULTS };
}

export function useResizablePanes() {
  const [widths, setWidths] = useState<PaneWidths>(loadWidths);
  const dragRef = useRef<{
    pane: keyof PaneWidths;
    startX: number;
    startWidth: number;
    direction: 1 | -1;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  }, [widths]);

  const startDrag = useCallback(
    (pane: keyof PaneWidths, clientX: number, direction: 1 | -1 = -1) => {
      dragRef.current = { pane, startX: clientX, startWidth: widths[pane], direction };
    },
    [widths]
  );

  const onDrag = useCallback((clientX: number) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = clientX - d.startX;
    const { min, max } = LIMITS[d.pane];
    const newWidth = Math.round(Math.min(max, Math.max(min, d.startWidth + delta * d.direction)));
    setWidths((prev) => ({ ...prev, [d.pane]: newWidth }));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return { widths, startDrag, onDrag, endDrag };
}
