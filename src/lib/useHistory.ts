import { useState, useCallback } from 'react';

export function useHistory<T>(initialState: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialState);
  const [future, setFuture] = useState<T[]>([]);

  const set = useCallback((newPresent: T | ((prev: T) => T)) => {
    setPresent((currentPresent) => {
      const nextPresent = typeof newPresent === 'function' ? (newPresent as (prev: T) => T)(currentPresent) : newPresent;
      
      setPast((currentPast) => {
        const newPast = [...currentPast, currentPresent];
        if (newPast.length > 50) {
          newPast.shift();
        }
        return newPast;
      });
      
      setFuture([]);
      return nextPresent;
    });
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setPast(newPast);
    setFuture([present, ...future]);
    setPresent(previous);
  }, [past, present, future]);

  const redo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    setPast([...past, present]);
    setFuture(newFuture);
    setPresent(next);
  }, [past, present, future]);

  const clear = useCallback((newPresent: T) => {
    setPast([]);
    setPresent(newPresent);
    setFuture([]);
  }, []);

  return { state: present, set, undo, redo, clear, canUndo: past.length > 0, canRedo: future.length > 0 };
}
