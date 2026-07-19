"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TodoStoreHolder } from "./store-holder";
import {
  epochToIso,
  type Filter,
  isoToEpoch,
  matchesFilter,
  newTodo,
  type Todo,
  withPinToggled,
} from "./todo";

// A single, most-recent-wins undo buffer. "delete" restores via re-insert
// (the rows are gone); "snooze" and "complete" restore via update (the rows
// still exist, just need their prior state/snoozeUntil/modifiedAt put back).
export type UndoKind = "delete" | "snooze" | "complete";
export type UndoEntry = { kind: UndoKind; todos: Todo[] };

export type UiState = {
  filter: Filter;
  search: string;
  focusId: string | null;
  lastUndo: UndoEntry | null;
  undoExpiresAt: number | null;
  // Epoch of the most recent custom snooze pick this session; surfaces the
  // "Last" quick option. Session-only (resets on reload), like Android.
  lastCustomSnooze: number | null;
};

export type UiAction =
  | { type: "setFilter"; filter: Filter }
  | { type: "setSearch"; search: string }
  | { type: "setFocus"; id: string | null }
  | { type: "setUndo"; entry: UndoEntry }
  | { type: "clearUndo" }
  | { type: "setLastCustomSnooze"; epoch: number };

export const initialUi: UiState = {
  filter: "ACTIVE",
  search: "",
  focusId: null,
  lastUndo: null,
  undoExpiresAt: null,
  lastCustomSnooze: null,
};

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "setFilter":
      if (state.filter === action.filter) return state;
      return {
        ...state,
        filter: action.filter,
        focusId: null,
        lastUndo: null,
        undoExpiresAt: null,
      };
    case "setSearch":
      if (state.search === action.search) return state;
      return { ...state, search: action.search };
    case "setFocus":
      if (state.focusId === action.id) return state;
      return { ...state, focusId: action.id };
    case "setUndo":
      return {
        ...state,
        lastUndo: action.entry,
        undoExpiresAt: Date.now() + 5000,
      };
    case "clearUndo":
      if (state.lastUndo === null && state.undoExpiresAt === null) return state;
      return { ...state, lastUndo: null, undoExpiresAt: null };
    case "setLastCustomSnooze":
      return { ...state, lastCustomSnooze: action.epoch };
  }
}

type ContextShape = UiState & {
  todos: Todo[];
  hydrated: boolean;
  syncing: boolean;
  now: number;
  holder: TodoStoreHolder;
  create: (text?: string) => Todo;
  edit: (id: string, text: string) => void;
  markDone: (id: string) => void;
  reactivate: (id: string) => void;
  snooze: (id: string, epoch: number) => void;
  recordCustomSnooze: (epoch: number) => void;
  togglePinned: (id: string) => void;
  remove: (id: string) => void;
  removeUndoable: (id: string) => void;
  clearAllDone: () => void;
  undo: () => void;
  setFilter: (f: Filter) => void;
  setSearch: (s: string) => void;
  setFocus: (id: string | null) => void;
  dropEmpty: () => void;
};

const Ctx = createContext<ContextShape | null>(null);

const EMPTY_TODOS: Todo[] = [];

export function TodoProvider({ children }: { children: ReactNode }) {
  const holderRef = useRef<TodoStoreHolder | null>(null);
  if (holderRef.current === null) holderRef.current = new TodoStoreHolder();
  const holder = holderRef.current;

  const [hydrated, setHydrated] = useState(false);
  // Nothing writes to a todo when its snooze lapses, so this has to advance itself.
  const [now, setNow] = useState(() => Date.now());
  const [ui, dispatch] = useReducer(uiReducer, initialUi);

  useEffect(() => {
    holder.setup();
    holder.hydrate();
    setHydrated(true);
    return () => {
      holder.dispose();
    };
  }, [holder]);

  const subscribe = useCallback(
    (cb: () => void) => holder.subscribe(cb),
    [holder],
  );
  const getSnapshot = useCallback(() => holder.getStore().getTodos(), [holder]);
  const getServerSnapshot = useCallback(() => EMPTY_TODOS, []);
  const todos = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const getSyncing = useCallback(() => holder.getStore().isSyncing(), [holder]);
  const getSyncingServer = useCallback(() => false, []);
  const syncing = useSyncExternalStore(subscribe, getSyncing, getSyncingServer);

  // Auto-expire the undo window.
  useEffect(() => {
    if (!ui.undoExpiresAt) return;
    const delta = ui.undoExpiresAt - Date.now();
    if (delta <= 0) {
      dispatch({ type: "clearUndo" });
      return;
    }
    const id = setTimeout(() => dispatch({ type: "clearUndo" }), delta);
    return () => clearTimeout(id);
  }, [ui.undoExpiresAt]);

  // Wake at the soonest snooze so its row moves itself out of Snoozed.
  useEffect(() => {
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const t of todos) {
      if (t.state === "DONE" || !t.snoozeUntil) continue;
      const at = isoToEpoch(t.snoozeUntil);
      if (at > now && at < nextExpiry) nextExpiry = at;
    }
    if (nextExpiry === Number.POSITIVE_INFINITY) return;
    const id = setTimeout(
      () => setNow(Date.now()),
      Math.max(100, nextExpiry - Date.now()),
    );
    return () => clearTimeout(id);
  }, [todos, now]);

  const create = useCallback(
    (text = ""): Todo => {
      const todo = { ...newTodo(), text };
      const store = holder.getStore();
      void store.insert(todo);
      dispatch({ type: "setFocus", id: todo.id });
      dispatch({ type: "clearUndo" });
      return todo;
    },
    [holder],
  );

  const edit = useCallback(
    (id: string, text: string) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing || existing.text === text) return;
      // An unsnoozed row drops its was-snoozed marker; pin modifiedAt to the
      // old unsnooze time so dropping snoozeUntil doesn't sink the row to a
      // stale modifiedAt. A snoozed or done one keeps the marker.
      const updated: Todo =
        matchesFilter(existing, "ACTIVE", Date.now()) && existing.snoozeUntil
          ? {
              ...existing,
              text,
              snoozeUntil: null,
              modifiedAt: isoToEpoch(existing.snoozeUntil),
            }
          : { ...existing, text };
      void store.update(updated);
    },
    [holder],
  );

  const markDone = useCallback(
    (id: string) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.update({
        ...existing,
        state: "DONE",
        snoozeUntil: null,
        modifiedAt: Date.now(),
      });
      dispatch({
        type: "setUndo",
        entry: { kind: "complete", todos: [existing] },
      });
    },
    [holder],
  );

  // Clears snoozeUntil too — it's the only marker, so a lingering one re-snoozes the row.
  const reactivate = useCallback(
    (id: string) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.update({
        ...existing,
        state: "ACTIVE",
        snoozeUntil: null,
        modifiedAt: Date.now(),
      });
    },
    [holder],
  );

  const snooze = useCallback(
    (id: string, epoch: number) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.update({
        ...existing,
        snoozeUntil: epochToIso(epoch),
        modifiedAt: Date.now(),
      });
      // Buffer the pre-snooze snapshot so undo can restore its prior
      // state/snoozeUntil/modifiedAt (and thus its prior sort position).
      dispatch({
        type: "setUndo",
        entry: { kind: "snooze", todos: [existing] },
      });
    },
    [holder],
  );

  const recordCustomSnooze = useCallback((epoch: number) => {
    dispatch({ type: "setLastCustomSnooze", epoch });
  }, []);

  const togglePinned = useCallback(
    (id: string) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.update(withPinToggled(existing, Date.now()));
    },
    [holder],
  );

  const remove = useCallback(
    (id: string) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.delete(existing);
      dispatch({ type: "setFocus", id: null });
    },
    [holder],
  );

  const removeUndoable = useCallback(
    (id: string) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.delete(existing);
      dispatch({ type: "setFocus", id: null });
      dispatch({
        type: "setUndo",
        entry: { kind: "delete", todos: [existing] },
      });
    },
    [holder],
  );

  const clearAllDone = useCallback(() => {
    void (async () => {
      const cleared = await holder.getStore().clearAllDone();
      if (cleared.length > 0) {
        dispatch({
          type: "setUndo",
          entry: { kind: "delete", todos: cleared },
        });
      }
    })();
  }, [holder]);

  const undo = useCallback(() => {
    const entry = ui.lastUndo;
    if (!entry || entry.todos.length === 0) return;
    const store = holder.getStore();
    if (entry.kind === "delete") {
      void store.restoreMany(entry.todos);
    } else {
      // Rows still exist (unlike delete), so re-apply the prior snapshot via update.
      for (const prior of entry.todos) void store.update(prior);
    }
    dispatch({ type: "clearUndo" });
  }, [holder, ui.lastUndo]);

  const setFilter = useCallback((f: Filter) => {
    dispatch({ type: "setFilter", filter: f });
  }, []);
  const setSearch = useCallback((s: string) => {
    dispatch({ type: "setSearch", search: s });
  }, []);
  const setFocus = useCallback((id: string | null) => {
    dispatch({ type: "setFocus", id });
  }, []);
  const dropEmpty = useCallback(() => {
    const focusId = ui.focusId;
    void holder.getStore().deleteEmptyTodosExcept(focusId ?? "");
  }, [holder, ui.focusId]);

  const value = useMemo<ContextShape>(
    () => ({
      ...ui,
      todos,
      hydrated,
      syncing,
      now,
      holder,
      create,
      edit,
      markDone,
      reactivate,
      snooze,
      recordCustomSnooze,
      togglePinned,
      remove,
      removeUndoable,
      clearAllDone,
      undo,
      setFilter,
      setSearch,
      setFocus,
      dropEmpty,
    }),
    [
      ui,
      todos,
      hydrated,
      syncing,
      now,
      holder,
      create,
      edit,
      markDone,
      reactivate,
      snooze,
      recordCustomSnooze,
      togglePinned,
      remove,
      removeUndoable,
      clearAllDone,
      undo,
      setFilter,
      setSearch,
      setFocus,
      dropEmpty,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTodos(): ContextShape {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTodos must be used inside <TodoProvider>");
  return ctx;
}
