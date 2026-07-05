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
  newTodo,
  type Todo,
  type TodoState,
} from "./todo";

// A single, most-recent-wins undo buffer. "delete" restores via re-insert
// (the rows are gone); "snooze" restores via update (the rows still exist,
// just need their prior state/snoozeUntil/modifiedAt put back).
export type UndoKind = "delete" | "snooze";
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

function isEffectivelyActive(t: Todo): boolean {
  if (t.state === "ACTIVE") return true;
  return (
    t.state === "SNOOZED" &&
    t.snoozeUntil !== null &&
    isoToEpoch(t.snoozeUntil) <= Date.now()
  );
}

const EMPTY_TODOS: Todo[] = [];

export function TodoProvider({ children }: { children: ReactNode }) {
  const holderRef = useRef<TodoStoreHolder | null>(null);
  if (holderRef.current === null) holderRef.current = new TodoStoreHolder();
  const holder = holderRef.current;

  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0);
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

  // Unsnooze expired snoozed todos and schedule the next wake.
  useEffect(() => {
    if (!hydrated) return;
    const now = Date.now();
    const expired: Todo[] = [];
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const t of todos) {
      if (t.state !== "SNOOZED" || !t.snoozeUntil) continue;
      const at = isoToEpoch(t.snoozeUntil);
      if (at <= now) expired.push(t);
      else if (at < nextExpiry) nextExpiry = at;
    }
    if (expired.length > 0) {
      const store = holder.getStore();
      for (const t of expired) {
        // Rule-rejection is swallowed inside the store; anything else
        // (network, etc.) is logged and retried on the next listener tick.
        store.unsnooze(t).catch((e) => {
          console.warn("unsnooze failed; will retry", t.id, e);
        });
      }
    }
    if (nextExpiry < Number.POSITIVE_INFINITY) {
      const delay = Math.max(100, nextExpiry - now);
      const id = setTimeout(() => setTick((n) => n + 1), delay);
      return () => clearTimeout(id);
    }
  }, [hydrated, todos, holder]);

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
      // Also flip state to "ACTIVE": a SNOOZED row with snoozeUntil:null matches no filter but "All".
      const updated: Todo = isEffectivelyActive(existing)
        ? { ...existing, text, state: "ACTIVE", snoozeUntil: null }
        : { ...existing, text };
      void store.update(updated);
    },
    [holder],
  );

  const markDone = useCallback(
    (id: string) => setState(holder, id, "DONE", null),
    [holder],
  );

  const reactivate = useCallback(
    (id: string) => setState(holder, id, "ACTIVE", null),
    [holder],
  );

  const snooze = useCallback(
    (id: string, epoch: number) => {
      const store = holder.getStore();
      const existing = store.getTodos().find((t) => t.id === id);
      if (!existing) return;
      void store.update({
        ...existing,
        state: "SNOOZED",
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
      // Bump modifiedAt and clear the was-snoozed marker (promoting an
      // expired-snooze row to ACTIVE so it stays in the list) so the toggled
      // row becomes a plain recent row and lands at the top of its group rather
      // than a stale position. Pin never touches the undo buffer.
      void store.update({
        ...existing,
        pinned: !existing.pinned,
        state: "ACTIVE",
        snoozeUntil: null,
        modifiedAt: Date.now(),
      });
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
      // Snooze undo: the rows still exist, so re-apply the prior snapshot.
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

function setState(
  holder: TodoStoreHolder,
  id: string,
  state: TodoState,
  snoozeUntil: string | null | undefined,
): void {
  const store = holder.getStore();
  const existing = store.getTodos().find((t) => t.id === id);
  if (!existing) return;
  void store.update({
    ...existing,
    state,
    snoozeUntil:
      snoozeUntil === undefined
        ? state === "SNOOZED"
          ? existing.snoozeUntil
          : null
        : snoozeUntil,
    modifiedAt: Date.now(),
  });
}
