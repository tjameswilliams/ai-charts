import { useCallback, useRef } from "react";

interface Props {
  onDragStart: (clientX: number) => void;
  onDrag: (clientX: number) => void;
  onDragEnd: () => void;
}

export function ResizeHandle({ onDragStart, onDrag, onDragEnd }: Props) {
  const draggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      onDragStart(e.clientX);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      onDrag(e.clientX);
    },
    [onDrag]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    onDragEnd();
  }, [onDragEnd]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="w-1 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors relative"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
