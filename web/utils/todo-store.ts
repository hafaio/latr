"use client";

import {
  type CollectionReference,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { fromFirestore, type Todo, toFirestoreFields } from "./todo";

const STORAGE_KEY = "latr:todos:v1";

export interface TodoStore {
  getTodos(): Todo[];
  isSyncing(): boolean;
  subscribe(listener: () => void): () => void;
  insert(todo: Todo): Promise<void>;
  update(todo: Todo): Promise<void>;
  delete(todo: Todo): Promise<void>;
  clearAllDone(): Promise<Todo[]>;
  restoreMany(todos: Todo[]): Promise<void>;
  deleteEmptyTodosExcept(exceptId: string): Promise<void>;
  dispose(): void;
}

abstract class BaseTodoStore implements TodoStore {
  protected todos: Todo[] = [];
  private listeners = new Set<() => void>();

  getTodos(): Todo[] {
    return this.todos;
  }

  abstract isSyncing(): boolean;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(): void {
    for (const l of this.listeners) l();
  }

  protected clearListeners(): void {
    this.listeners.clear();
  }

  abstract insert(todo: Todo): Promise<void>;
  abstract update(todo: Todo): Promise<void>;
  abstract delete(todo: Todo): Promise<void>;
  abstract clearAllDone(): Promise<Todo[]>;
  abstract restoreMany(todos: Todo[]): Promise<void>;
  abstract deleteEmptyTodosExcept(exceptId: string): Promise<void>;
  abstract dispose(): void;
}

export class LocalTodoStore extends BaseTodoStore {
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  isSyncing(): boolean {
    return false;
  }

  /**
   * Read from localStorage. Deliberately not called from the constructor so
   * that the server and initial-client renders agree on an empty list —
   * `TodoProvider` triggers this from a mount effect to keep React hydration
   * happy.
   */
  hydrate(): void {
    try {
      const raw =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      const parsed: Todo[] = raw ? JSON.parse(raw) : [];
      this.todos = parsed
        .filter((t) => t.deleted !== true)
        .map((t) => ({ ...t, deleted: false }));
    } catch {
      this.todos = [];
    }
    this.emit();
  }

  replaceAll(todos: Todo[]): void {
    this.commit(todos);
  }

  async insert(todo: Todo): Promise<void> {
    this.commit([todo, ...this.todos]);
  }

  async update(todo: Todo): Promise<void> {
    this.commit(this.todos.map((t) => (t.id === todo.id ? todo : t)));
  }

  async delete(todo: Todo): Promise<void> {
    this.commit(this.todos.filter((t) => t.id !== todo.id));
  }

  async clearAllDone(): Promise<Todo[]> {
    const done = this.todos.filter((t) => t.state === "DONE");
    if (done.length === 0) return [];
    this.commit(this.todos.filter((t) => t.state !== "DONE"));
    return done;
  }

  async restoreMany(todos: Todo[]): Promise<void> {
    if (todos.length === 0) return;
    const now = Date.now();
    const existing = new Set(this.todos.map((t) => t.id));
    const restored = todos
      .filter((t) => !existing.has(t.id))
      .map((t) => ({ ...t, modifiedAt: now, deleted: false }));
    if (restored.length === 0) return;
    this.commit([...restored, ...this.todos]);
  }

  async deleteEmptyTodosExcept(exceptId: string): Promise<void> {
    const next = this.todos.filter(
      (t) => t.id === exceptId || t.text.trim().length > 0,
    );
    if (next.length !== this.todos.length) this.commit(next);
  }

  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      // Flush the pending write so we don't lose the latest state.
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.todos));
      }
    }
    this.clearListeners();
  }

  private commit(next: Todo[]): void {
    this.todos = next;
    this.schedulePersist();
    this.emit();
  }

  private schedulePersist(): void {
    if (typeof window === "undefined") return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.todos));
      this.persistTimer = null;
    }, 100);
  }
}

/**
 * Reads and writes go straight through Firestore (with its persistent local
 * cache). The snapshot listener is the only source of truth — no localStorage
 * intermediate to reconcile, so echoes of our own writes cannot clobber
 * in-flight state the way they could in the two-store model.
 *
 * Legacy tombstone docs (deleted=true, written by older clients) are
 * filtered out on read. New deletes call deleteDoc directly; Firestore
 * propagates REMOVED to every active listener.
 */
export class FirestoreTodoStore extends BaseTodoStore {
  private readonly col: CollectionReference;
  private unsubscribe: (() => void) | null = null;
  // True until the listener has received a snapshot with a live server
  // connection. Flips back to true if the stream drops (e.g. tab backgrounded
  // long enough for the WebChannel to close) until we reconnect.
  private fromCache = true;

  constructor(uid: string) {
    super();
    this.col = collection(db(), "users", uid, "todos");
    this.attach();
  }

  isSyncing(): boolean {
    return this.fromCache;
  }

  /**
   * Re-establish the snapshot listener if a previous error cleared it (e.g.
   * the WebChannel stream dropped while the tab was backgrounded).
   */
  reattach(): void {
    if (!this.unsubscribe) this.attach();
  }

  async snapshot(): Promise<Todo[]> {
    const snap = await getDocs(this.col);
    return snap.docs
      .map((d) => fromFirestore(d.id, d.data() as Record<string, unknown>))
      .filter((t) => !t.deleted);
  }

  async insert(todo: Todo): Promise<void> {
    this.todos = [todo, ...this.todos];
    this.emit();
    await setDoc(doc(this.col, todo.id), this.withServerTs(todo), {
      merge: true,
    });
  }

  async update(todo: Todo): Promise<void> {
    const idx = this.todos.findIndex((t) => t.id === todo.id);
    if (idx >= 0) {
      const next = this.todos.slice();
      next[idx] = todo;
      this.todos = next;
      this.emit();
    }
    await setDoc(doc(this.col, todo.id), this.withServerTs(todo), {
      merge: true,
    });
  }

  async delete(todo: Todo): Promise<void> {
    this.todos = this.todos.filter((t) => t.id !== todo.id);
    this.emit();
    await deleteDoc(doc(this.col, todo.id));
  }

  async clearAllDone(): Promise<Todo[]> {
    const done = this.todos.filter((t) => t.state === "DONE");
    if (done.length === 0) return [];
    this.todos = this.todos.filter((t) => t.state !== "DONE");
    this.emit();
    const batch = writeBatch(db());
    for (const t of done) batch.delete(doc(this.col, t.id));
    await batch.commit();
    return done;
  }

  async restoreMany(todos: Todo[]): Promise<void> {
    if (todos.length === 0) return;
    const now = Date.now();
    const restored = todos.map(
      (t): Todo => ({ ...t, modifiedAt: now, deleted: false }),
    );
    const existing = new Set(this.todos.map((t) => t.id));
    const additions = restored.filter((t) => !existing.has(t.id));
    if (additions.length > 0) {
      this.todos = [...additions, ...this.todos];
      this.emit();
    }
    const batch = writeBatch(db());
    for (const t of restored) {
      batch.set(doc(this.col, t.id), this.withServerTs(t), { merge: true });
    }
    await batch.commit();
  }

  async deleteEmptyTodosExcept(exceptId: string): Promise<void> {
    const toDelete = this.todos.filter(
      (t) => t.id !== exceptId && t.text.trim().length === 0,
    );
    if (toDelete.length === 0) return;
    const keepIds = new Set(
      this.todos.filter((t) => !toDelete.includes(t)).map((t) => t.id),
    );
    this.todos = this.todos.filter((t) => keepIds.has(t.id));
    this.emit();
    const batch = writeBatch(db());
    for (const t of toDelete) batch.delete(doc(this.col, t.id));
    await batch.commit();
  }

  /** Wipe every doc in this user's todos collection. Used by delete-account. */
  async deleteAll(): Promise<void> {
    const snap = await getDocs(this.col);
    if (snap.empty) return;
    const batch = writeBatch(db());
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.clearListeners();
  }

  private attach(): void {
    if (this.unsubscribe) return;
    this.fromCache = true;
    this.unsubscribe = onSnapshot(
      this.col,
      // includeMetadataChanges fires the listener when fromCache flips (e.g.
      // live connection re-established after a backgrounded tab) even if no
      // doc data changed, so the sync indicator can reflect reconnect state.
      { includeMetadataChanges: true },
      (snap) => {
        this.todos = snap.docs
          .map((d) => fromFirestore(d.id, d.data() as Record<string, unknown>))
          .filter((t) => !t.deleted);
        this.fromCache = snap.metadata.fromCache;
        this.emit();
      },
      (err) => {
        console.error("firestore snapshot", err);
        // Clear the handle so reattach can re-subscribe after a stream drop.
        this.unsubscribe = null;
        this.fromCache = true;
        this.emit();
      },
    );
  }

  private withServerTs(todo: Todo): Record<string, unknown> {
    return {
      ...toFirestoreFields(todo),
      serverModifiedAt: serverTimestamp(),
    };
  }
}
