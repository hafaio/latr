"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseConfigured } from "./firebase";
import { fromFirestore, type Todo, toFirestoreFields } from "./todo";

export type SyncHandle = {
  pushLocal: (todo: Todo) => Promise<void>;
  removeLocal: (id: string) => Promise<void>;
  uploadAll: (todos: Todo[]) => Promise<void>;
  deleteAllRemote: () => Promise<void>;
  startListening: () => void;
  stopListening: () => void;
  dispose: () => void;
};

export type SyncCallbacks = {
  onUser: (u: User | null) => void;
  onRemoteApply: (todos: Todo[]) => void;
  onRemoteRemove: (ids: string[]) => void;
};

let activeHandle: SyncHandle | null = null;

export function syncPushTodo(todo: Todo): void {
  activeHandle?.pushLocal(todo).catch((e) => console.error("sync push", e));
}

export async function syncRemoveTodo(id: string): Promise<void> {
  await activeHandle?.removeLocal(id);
}

function withServerTimestamp(fields: Record<string, unknown>) {
  return { ...fields, serverModifiedAt: serverTimestamp() };
}

export function startSync(cb: SyncCallbacks): SyncHandle {
  if (!firebaseConfigured()) {
    cb.onUser(null);
    const noop: SyncHandle = {
      pushLocal: async () => {},
      removeLocal: async () => {},
      uploadAll: async () => {},
      deleteAllRemote: async () => {},
      startListening: () => {},
      stopListening: () => {},
      dispose: () => {
        if (activeHandle === noop) activeHandle = null;
      },
    };
    activeHandle = noop;
    return noop;
  }

  let currentUid: string | null = null;
  let stopSnapshot: (() => void) | null = null;

  function todosCollection(uid: string) {
    return collection(db(), "users", uid, "todos");
  }

  function stopListening() {
    if (stopSnapshot) stopSnapshot();
    stopSnapshot = null;
  }

  function startListening() {
    if (!currentUid || stopSnapshot) return;
    const uid = currentUid;
    stopSnapshot = onSnapshot(
      todosCollection(uid),
      (snap) => {
        const add: Todo[] = [];
        const remove: string[] = [];
        for (const change of snap.docChanges()) {
          const d = change.doc;
          if (change.type === "removed") {
            remove.push(d.id);
          } else {
            add.push(fromFirestore(d.id, d.data() as Record<string, unknown>));
          }
        }
        if (add.length) cb.onRemoteApply(add);
        if (remove.length) cb.onRemoteRemove(remove);
      },
      (err) => console.error("snapshot error", err),
    );
  }

  const unsubAuth = onAuthStateChanged(auth(), (u) => {
    currentUid = u?.uid ?? null;
    cb.onUser(u);
    if (!currentUid) stopListening();
  });

  const handle: SyncHandle = {
    async pushLocal(todo) {
      if (!currentUid) return;
      await setDoc(
        doc(todosCollection(currentUid), todo.id),
        withServerTimestamp(toFirestoreFields(todo)),
        { merge: true },
      );
    },
    async removeLocal(id) {
      if (!currentUid) return;
      await deleteDoc(doc(todosCollection(currentUid), id));
    },
    async uploadAll(todos) {
      if (!currentUid || todos.length === 0) return;
      const batch = writeBatch(db());
      for (const t of todos) {
        batch.set(
          doc(todosCollection(currentUid), t.id),
          withServerTimestamp(toFirestoreFields(t)),
          { merge: true },
        );
      }
      await batch.commit();
    },
    async deleteAllRemote() {
      if (!currentUid) return;
      const snap = await getDocs(todosCollection(currentUid));
      if (snap.empty) return;
      const batch = writeBatch(db());
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
    },
    startListening,
    stopListening,
    dispose() {
      stopListening();
      unsubAuth();
      if (activeHandle === handle) activeHandle = null;
    },
  };
  activeHandle = handle;
  return handle;
}
