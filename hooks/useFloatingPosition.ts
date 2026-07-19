import { useState, useEffect, RefObject } from 'react';

interface FloatingPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * Computes viewport-relative coordinates for a floating panel anchored below
 * `triggerRef`, meant to be rendered via a portal with `position: fixed` so
 * it isn't clipped by a scrollable ancestor. Closes (via `onClose`) on
 * scroll, since a fixed-position panel can't track the trigger's movement.
 */
export function useFloatingPosition(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  panelRef?: RefObject<HTMLElement | null>,
): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPosition(null);
      return;
    }

    const update = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    };

    update();

    // Scrolling inside the portaled panel itself (e.g. touch-scrolling the
    // options list) also fires a capture-phase 'scroll' event here — ignore
    // those so the dropdown doesn't close under the user's finger.
    const handleScroll = (e: Event) => {
      if (
        panelRef?.current &&
        e.target instanceof Node &&
        panelRef.current.contains(e.target)
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, triggerRef, onClose, panelRef]);

  return position;
}
