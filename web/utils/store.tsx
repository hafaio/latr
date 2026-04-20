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
} from "react";
import { syncPushTodo } from "./sync";
import {
  epochToIso,
  type Filter,
  isoToEpoch,
  newTodo,
  type Todo,
  type TodoState,
} from "./todo";

const STORAGE_KEY = "latr:todos:v1";

type State = {
  hydrated: boolean;
  todos: Todo[];
  filter: Filter;
  search: string;
  focusId: string | null;
  lastClearedDone: Todo[] | null;
  undoExpiresAt: number | null;
};

type Action =
  | { type: "hydrate"; todos: Todo[] }
  | { type: "upsertMany"; todos: Todo[] }
  | { type: "remove"; id: string }
  | { type: "removeMany"; ids: string[] }
  | { type: "create"; todo: Todo }
  | { type: "edit"; id: string; text: string }
  | {
      type: "setState";
      id: string;
      state: TodoState;
      snoozeUntil?: string | null;
    }
  | { type: "snooze"; id: string; epoch: number }
  | { type: "clearAllDone" }
  | { type: "undoClearAllDone" }
  | { type: "expireUndo" }
  | { type: "unsnoozeExpired" }
  | { type: "setFilter"; filter: Filter }
  | { type: "setSearch"; search: string }
  | { type: "setFocus"; id: string | null }
  | { type: "dropEmpty" };

const initial: State = {
  hydrated: false,
  todos: [],
  filter: "ACTIVE",
  search: "",
  focusId: null,
  lastClearedDone: null,
  undoExpiresAt: null,
};

function mergeRemote(existing: Todo[], incoming: Todo): Todo[] {
  const ix = existing.findIndex((t) => t.id === incoming.id);
  if (ix === -1) return [...existing, incoming];
  if (incoming.serverModifiedAt <= existing[ix].serverModifiedAt) {
    return existing;
  }
  const next = existing.slice();
  next[ix] = incoming;
  return next;
}

function sameClientFields(a: Todo, b: Todo): boolean {
  return (
    a.text === b.text &&
    a.state === b.state &&
    a.snoozeUntil === b.snoozeUntil &&
    a.pinned === b.pinned &&
    a.modifiedAt === b.modifiedAt
  );
}

function isEffectivelyActive(t: Todo): boolean {
  if (t.state === "ACTIVE") return true;
  return (
    t.state === "SNOOZED" &&
    t.snoozeUntil !== null &&
    isoToEpoch(t.snoozeUntil) <= Date.now()
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, hydrated: true, todos: action.todos };
    case "create": {
      return {
        ...state,
        todos: [action.todo, ...state.todos],
        focusId: action.todo.id,
        lastClearedDone: null,
        undoExpiresAt: null,
      };
    }
    case "upsertMany": {
      let next = state.todos;
      for (const t of action.todos) next = mergeRemote(next, t);
      if (next === state.todos) return state;
      return { ...state, todos: next };
    }
    case "remove":
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.id),
        focusId: state.focusId === action.id ? null : state.focusId,
      };
    case "removeMany": {
      const ids = new Set(action.ids);
      return {
        ...state,
        todos: state.todos.filter((t) => !ids.has(t.id)),
        focusId: state.focusId && ids.has(state.focusId) ? null : state.focusId,
      };
    }
    case "edit": {
      const existing = state.todos.find((t) => t.id === action.id);
      if (!existing || existing.text === action.text) return state;
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id
            ? {
                ...t,
                text: action.text,
                snoozeUntil: isEffectivelyActive(t) ? null : t.snoozeUntil,
              }
            : t,
        ),
      };
    }
    case "setState":
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id
            ? {
                ...t,
                state: action.state,
                snoozeUntil:
                  action.snoozeUntil === undefined
                    ? action.state === "SNOOZED"
                      ? t.snoozeUntil
                      : null
                    : action.snoozeUntil,
                modifiedAt: Date.now(),
              }
            : t,
        ),
      };
    case "snooze":
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id
            ? {
                ...t,
                state: "SNOOZED",
                snoozeUntil: epochToIso(action.epoch),
                modifiedAt: Date.now(),
              }
            : t,
        ),
      };
    case "clearAllDone": {
      const cleared = state.todos.filter((t) => t.state === "DONE");
      if (cleared.length === 0) return state;
      return {
        ...state,
        todos: state.todos.filter((t) => t.state !== "DONE"),
        lastClearedDone: cleared,
        undoExpiresAt: Date.now() + 5000,
      };
    }
    case "undoClearAllDone": {
      if (!state.lastClearedDone) return state;
      const now = Date.now();
      const restored = state.lastClearedDone.map((t) => ({
        ...t,
        deleted: false,
        modifiedAt: now,
      }));
      return {
        ...state,
        todos: [...restored, ...state.todos],
        lastClearedDone: null,
        undoExpiresAt: null,
      };
    }
    case "expireUndo":
      return { ...state, lastClearedDone: null, undoExpiresAt: null };
    case "unsnoozeExpired": {
      const now = Date.now();
      let changed = false;
      const next = state.todos.map((t) => {
        if (t.state !== "SNOOZED" || !t.snoozeUntil) return t;
        if (isoToEpoch(t.snoozeUntil) > now) return t;
        changed = true;
        return {
          ...t,
          state: "ACTIVE" as TodoState,
          modifiedAt: isoToEpoch(t.snoozeUntil),
        };
      });
      if (!changed) return state;
      return { ...state, todos: next };
    }
    case "setFilter":
      if (state.filter === action.filter) return state;
      return {
        ...state,
        filter: action.filter,
        focusId: null,
        lastClearedDone: null,
        undoExpiresAt: null,
      };
    case "setSearch":
      if (state.search === action.search) return state;
      return { ...state, search: action.search };
    case "setFocus":
      if (state.focusId === action.id) return state;
      return { ...state, focusId: action.id };
    case "dropEmpty": {
      const next = state.todos.filter((t) => t.text.trim().length > 0);
      if (next.length === state.todos.length) return state;
      return { ...state, todos: next };
    }
  }
}

type ContextShape = State & {
  create: () => Todo;
  edit: (id: string, text: string) => void;
  markDone: (id: string) => void;
  reactivate: (id: string) => void;
  snooze: (id: string, epoch: number) => void;
  remove: (id: string) => void;
  clearAllDone: () => void;
  undoClearAllDone: () => void;
  setFilter: (f: Filter) => void;
  setSearch: (s: string) => void;
  setFocus: (id: string | null) => void;
  dropEmpty: () => void;
  applyRemote: (todos: Todo[]) => void;
  removeRemote: (ids: string[]) => void;
};

const Ctx = createContext<ContextShape | null>(null);

export function TodoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTodosRef = useRef<Todo[]>([]);
  const suppressTombstonePushRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: Todo[] = raw ? JSON.parse(raw) : [];
      const todos = parsed
        .filter((t) => t.deleted !== true)
        .map((t) => ({ ...t, deleted: false }));
      dispatch({ type: "hydrate", todos });
    } catch {
      dispatch({ type: "hydrate", todos: [] });
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
    }, 100);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [state.hydrated, state.todos]);

  useEffect(() => {
    if (!state.hydrated) return;
    const prev = new Map(prevTodosRef.current.map((t) => [t.id, t]));
    for (const t of state.todos) {
      const p = prev.get(t.id);
      if (p && sameClientFields(p, t)) continue;
      syncPushTodo(t);
    }
    const currIds = new Set(state.todos.map((t) => t.id));
    const now = Date.now();
    for (const p of prevTodosRef.current) {
      if (currIds.has(p.id)) continue;
      if (suppressTombstonePushRef.current.has(p.id)) continue;
      syncPushTodo({ ...p, deleted: true, modifiedAt: now });
    }
    suppressTombstonePushRef.current.clear();
    prevTodosRef.current = state.todos;
  }, [state.hydrated, state.todos]);

  useEffect(() => {
    if (!state.undoExpiresAt) return;
    const delta = state.undoExpiresAt - Date.now();
    if (delta <= 0) {
      dispatch({ type: "expireUndo" });
      return;
    }
    const id = setTimeout(() => dispatch({ type: "expireUndo" }), delta);
    return () => clearTimeout(id);
  }, [state.undoExpiresAt]);

  useEffect(() => {
    if (!state.hydrated) return;
    const now = Date.now();
    let hasExpired = false;
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const t of state.todos) {
      if (t.state !== "SNOOZED" || !t.snoozeUntil) continue;
      const expiry = isoToEpoch(t.snoozeUntil);
      if (expiry <= now) hasExpired = true;
      else if (expiry < nextExpiry) nextExpiry = expiry;
    }
    if (hasExpired) dispatch({ type: "unsnoozeExpired" });
    if (nextExpiry < Number.POSITIVE_INFINITY) {
      const delay = Math.max(100, nextExpiry - now);
      const id = setTimeout(() => dispatch({ type: "unsnoozeExpired" }), delay);
      return () => clearTimeout(id);
    }
  }, [state.hydrated, state.todos]);

  const create = useCallback((): Todo => {
    const todo = newTodo();
    dispatch({ type: "create", todo });
    return todo;
  }, []);

  const edit = useCallback((id: string, text: string) => {
    dispatch({ type: "edit", id, text });
  }, []);

  const markDone = useCallback((id: string) => {
    dispatch({ type: "setState", id, state: "DONE", snoozeUntil: null });
  }, []);

  const reactivate = useCallback((id: string) => {
    dispatch({ type: "setState", id, state: "ACTIVE", snoozeUntil: null });
  }, []);

  const snooze = useCallback((id: string, epoch: number) => {
    dispatch({ type: "snooze", id, epoch });
  }, []);

  const remove = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  const clearAllDone = useCallback(() => {
    dispatch({ type: "clearAllDone" });
  }, []);

  const undoClearAllDone = useCallback(() => {
    dispatch({ type: "undoClearAllDone" });
  }, []);

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
    dispatch({ type: "dropEmpty" });
  }, []);

  const applyRemote = useCallback((todos: Todo[]) => {
    dispatch({ type: "upsertMany", todos });
  }, []);

  const removeRemote = useCallback((ids: string[]) => {
    for (const id of ids) suppressTombstonePushRef.current.add(id);
    dispatch({ type: "removeMany", ids });
  }, []);

  const value = useMemo<ContextShape>(
    () => ({
      ...state,
      create,
      edit,
      markDone,
      reactivate,
      snooze,
      remove,
      clearAllDone,
      undoClearAllDone,
      setFilter,
      setSearch,
      setFocus,
      dropEmpty,
      applyRemote,
      removeRemote,
    }),
    [
      state,
      create,
      edit,
      markDone,
      reactivate,
      snooze,
      remove,
      clearAllDone,
      undoClearAllDone,
      setFilter,
      setSearch,
      setFocus,
      dropEmpty,
      applyRemote,
      removeRemote,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTodos(): ContextShape {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTodos must be used inside <TodoProvider>");
  return ctx;
}
