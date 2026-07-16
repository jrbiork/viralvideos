'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import Modal from './Modal';

interface UnsavedChangesContextValue {
  setHasUnsavedChanges: (value: boolean) => void;
  confirmNavigation: (action: () => void) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const hasUnsavedChangesRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Covers refresh, tab close, and typing a new URL. Browsers show their own
  // generic "leave site?" prompt here — the message can't be customized.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const confirmNavigation = useCallback((action: () => void) => {
    if (!hasUnsavedChangesRef.current) {
      action();
      return;
    }
    setPendingAction(() => action);
  }, []);

  return (
    <UnsavedChangesContext.Provider
      value={{ setHasUnsavedChanges, confirmNavigation }}
    >
      {children}
      <Modal
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title="You have unsaved changes"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            You have edits that haven&apos;t been applied yet. If you leave
            this page now, they&apos;ll be lost.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                action?.();
              }}
              className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-[#5B5BFF] text-white hover:bg-[#5B5BFF] font-medium transition-all duration-300"
            >
              Leave without applying
            </button>
            <button
              onClick={() => setPendingAction(null)}
              className="flex-1 px-4 py-3 text-white rounded-xl font-medium transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95"
              style={{
                background:
                  'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
              }}
            >
              Stay on this page
            </button>
          </div>
        </div>
      </Modal>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error(
      'useUnsavedChanges must be used within UnsavedChangesProvider',
    );
  }
  return ctx;
}
