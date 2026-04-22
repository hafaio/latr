"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseConfigured } from "./firebase";
import { fromFirestore, type Todo, toFirestoreFields } from "./todo";
import {
  FirestoreTodoStore,
  LocalTodoStore,
  type TodoStore,
} from "./todo-store";

/**
 * Owns the single live [TodoStore] and swaps it at the auth boundary.
 *
 * Sign-in (auth-driven): merge any offline edits from the local store into
 * Firestore (respecting legacy tombstones), then swap to
 * [FirestoreTodoStore]. The local store is not written to again while
 * signed in.
 *
 * Sign-out: the auth listener only swaps back to [LocalTodoStore]. The
 * Firestore-to-local copy is done by explicit entry points ([signOut],
 * [deleteAccount]) *before* auth is revoked, because once the user is
 * signed out Firestore rules reject our reads.
 */
export class TodoStoreHolder {
  private localStore = new LocalTodoStore();
  private firestoreStore: FirestoreTodoStore | null = null;
  private currentStore: TodoStore = this.localStore;
  private listeners = new Set<() => void>();
  private storeUnsub: (() => void) | null = null;
  private unsubAuth: (() => void) | null = null;
  private user: User | null = null;

  constructor() {
    this.wireStoreListener();
    if (firebaseConfigured()) {
      this.unsubAuth = onAuthStateChanged(auth(), (u) => {
        const prevUid = this.user?.uid ?? null;
        this.user = u;
        if (u && u.uid !== prevUid) void this.onSignedIn(u.uid);
        else if (!u && prevUid !== null) this.onSignedOut();
      });
    }
  }

  getStore(): TodoStore {
    return this.currentStore;
  }

  getUser(): User | null {
    return this.user;
  }

  /** Subscribe to changes to the active store's todos AND to store swaps. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hydrate(): void {
    this.localStore.hydrate();
  }

  /**
   * User-initiated sign-out: preserves the current signed-in todos locally
   * by copying them into the local store before revoking auth.
   */
  async signOut(): Promise<void> {
    await this.snapshotFirestoreIntoLocal();
    await auth().signOut();
  }

  /**
   * User-initiated delete-account: copies current state into the local store
   * (so local todos are preserved), wipes the remote collection, then
   * deletes the Firebase auth user (which triggers sign-out).
   */
  async deleteAccount(): Promise<void> {
    await this.snapshotFirestoreIntoLocal();
    if (this.firestoreStore) await this.firestoreStore.deleteAll();
    await this.user?.delete();
  }

  /** Reattach the Firestore snapshot listener (after tab wake / online). */
  reattach(): void {
    this.firestoreStore?.reattach();
  }

  dispose(): void {
    if (this.unsubAuth) {
      this.unsubAuth();
      this.unsubAuth = null;
    }
    if (this.storeUnsub) {
      this.storeUnsub();
      this.storeUnsub = null;
    }
    this.localStore.dispose();
    this.firestoreStore?.dispose();
    this.firestoreStore = null;
    this.listeners.clear();
  }

  private setStore(next: TodoStore): void {
    this.currentStore = next;
    this.wireStoreListener();
    this.emit();
  }

  private wireStoreListener(): void {
    if (this.storeUnsub) this.storeUnsub();
    this.storeUnsub = this.currentStore.subscribe(() => this.emit());
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private async onSignedIn(uid: string): Promise<void> {
    try {
      await this.mergeLocalIntoFirestore(uid);
    } catch (e) {
      console.error("sign-in merge failed", e);
    }
    this.firestoreStore?.dispose();
    this.firestoreStore = new FirestoreTodoStore(uid);
    this.setStore(this.firestoreStore);
  }

  private onSignedOut(): void {
    this.firestoreStore?.dispose();
    this.firestoreStore = null;
    this.setStore(this.localStore);
  }

  private async snapshotFirestoreIntoLocal(): Promise<void> {
    const fs = this.firestoreStore;
    if (!fs) return;
    try {
      const remote = await fs.snapshot();
      this.localStore.replaceAll(remote);
    } catch (e) {
      console.error("snapshot-to-local failed", e);
    }
  }

  /**
   * Merge the local store's current state into Firestore. Edits made while
   * signed out are published; remote tombstones from legacy clients
   * (deleted=true docs) take precedence so we don't resurrect them.
   */
  private async mergeLocalIntoFirestore(uid: string): Promise<void> {
    const col = collection(db(), "users", uid, "todos");
    const local = this.localStore.getTodos();
    const remoteSnap = await getDocs(col);
    const remoteById = new Map<string, Todo>();
    for (const d of remoteSnap.docs) {
      remoteById.set(
        d.id,
        fromFirestore(d.id, d.data() as Record<string, unknown>),
      );
    }
    const toPush: Todo[] = [];
    const toDropLocalIds: string[] = [];
    for (const l of local) {
      const r = remoteById.get(l.id);
      if (!r) {
        toPush.push(l);
        continue;
      }
      if (r.deleted) {
        toDropLocalIds.push(l.id);
        continue;
      }
      if (l.modifiedAt > r.modifiedAt) toPush.push(l);
    }
    if (toDropLocalIds.length > 0) {
      const dropSet = new Set(toDropLocalIds);
      this.localStore.replaceAll(local.filter((t) => !dropSet.has(t.id)));
    }
    if (toPush.length > 0) {
      const batch = writeBatch(db());
      for (const t of toPush) {
        batch.set(
          doc(col, t.id),
          { ...toFirestoreFields(t), serverModifiedAt: serverTimestamp() },
          { merge: true },
        );
      }
      await batch.commit();
    }
  }
}
