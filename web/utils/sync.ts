"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
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

function withServerTimestamp(fields: Record<string, unknown>) {
  return { ...fields, serverModifiedAt: serverTimestamp() };
}

export function startSync(cb: SyncCallbacks): SyncHandle {
  if (!firebaseConfigured()) {
    cb.onUser(null);
    const noop: SyncHandle = {
      pushLocal: async () => {},
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
            continue;
          }
          const todo = fromFirestore(d.id, d.data() as Record<string, unknown>);
          if (todo.deleted) remove.push(d.id);
          else add.push(todo);
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
    async uploadAll(todos) {
      if (!currentUid) return;
      const uid = currentUid;
      const snap = await getDocs(todosCollection(uid));
      const remoteById = new Map<string, Todo>();
      for (const d of snap.docs) {
        remoteById.set(
          d.id,
          fromFirestore(d.id, d.data() as Record<string, unknown>),
        );
      }
      const toApply: Todo[] = [];
      const toRemove: string[] = [];
      const toPush: Todo[] = [];
      for (const local of todos) {
        const remote = remoteById.get(local.id);
        if (!remote) {
          toPush.push(local);
          continue;
        }
        if (remote.deleted) {
          toRemove.push(local.id);
          continue;
        }
        if (local.modifiedAt > remote.modifiedAt) {
          toPush.push(local);
        } else {
          toApply.push(remote);
        }
      }
      const localIds = new Set(todos.map((t) => t.id));
      for (const [id, remote] of remoteById) {
        if (localIds.has(id)) continue;
        if (remote.deleted) continue;
        toApply.push(remote);
      }
      if (toRemove.length) cb.onRemoteRemove(toRemove);
      if (toApply.length) cb.onRemoteApply(toApply);
      if (toPush.length) {
        const batch = writeBatch(db());
        for (const t of toPush) {
          batch.set(
            doc(todosCollection(uid), t.id),
            withServerTimestamp(toFirestoreFields(t)),
            { merge: true },
          );
        }
        await batch.commit();
      }
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
