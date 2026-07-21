"use client";

import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseConfigured } from "./firebase";
import { planMerge } from "./merge";
import { fromFirestore, type Todo, toFirestoreFields } from "./todo";
import {
  FirestoreTodoStore,
  LocalTodoStore,
  type TodoStore,
} from "./todo-store";

/** Owns the live [TodoStore]; swaps it at the auth boundary. Merge/snapshot happen only on [signIn]/[signOut]/[deleteAccount]. */
export class TodoStoreHolder {
  private localStore = new LocalTodoStore();
  private firestoreStore: FirestoreTodoStore | null = null;
  private currentStore: TodoStore = this.localStore;
  private listeners = new Set<() => void>();
  private storeUnsub: (() => void) | null = null;
  private unsubAuth: (() => void) | null = null;
  private user: User | null = null;

  constructor() {
    this.setup();
  }

  /** Idempotent; re-run after [dispose] to survive a StrictMode double-mount. */
  setup(): void {
    this.wireStoreListener();
    if (!this.unsubAuth && firebaseConfigured()) {
      this.unsubAuth = onAuthStateChanged(auth(), (u) => {
        const prevUid = this.user?.uid ?? null;
        this.user = u;
        if (u && u.uid !== prevUid) this.swapToFirestore(u.uid);
        else if (!u && prevUid !== null) this.swapToLocal();
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

  /** Sign in via Google, then push offline local edits into Firestore. */
  async signIn(): Promise<void> {
    if (!firebaseConfigured()) {
      throw new Error("firebase not configured");
    }
    let uid: string;
    try {
      const result = await signInWithPopup(auth(), new GoogleAuthProvider());
      uid = result.user.uid;
    } catch (e) {
      // A dismissed popup is benign; real failures propagate.
      if (
        e instanceof FirebaseError &&
        (e.code === "auth/popup-closed-by-user" ||
          e.code === "auth/cancelled-popup-request")
      ) {
        return;
      }
      throw e;
    }
    await this.mergeLocalIntoFirestore(uid);
  }

  /** Sign out; copies todos into the local store first to preserve them. */
  async signOut(): Promise<void> {
    await this.snapshotFirestoreIntoLocal();
    await auth().signOut();
  }

  /** Copy state locally, wipe remote, then delete the auth user (triggers sign-out). */
  async deleteAccount(): Promise<void> {
    const user = this.user;
    if (!user) return;
    // Reauth before wiping: a delete() that fails post-wipe could snapshot the empty remote over local.
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    await this.snapshotFirestoreIntoLocal();
    if (this.firestoreStore) await this.firestoreStore.deleteAll();
    await user.delete();
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
    // Reset so a re-setup with the same uid re-swaps instead of reusing the disposed store.
    this.user = null;
    this.currentStore = this.localStore;
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

  private swapToFirestore(uid: string): void {
    this.firestoreStore?.dispose();
    this.firestoreStore = new FirestoreTodoStore(uid);
    this.setStore(this.firestoreStore);
  }

  private swapToLocal(): void {
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

  /** Publish local edits and pending deletes; see [planMerge]. */
  private async mergeLocalIntoFirestore(uid: string): Promise<void> {
    const col = collection(db(), "users", uid, "todos");
    const local = this.localStore.getWithTombstones();
    // Unfiltered, unlike the live listener: the plan needs to see the tombstones.
    const remoteSnap = await getDocs(col);
    const remoteById = new Map<string, Todo>();
    for (const d of remoteSnap.docs) {
      remoteById.set(
        d.id,
        fromFirestore(d.id, d.data() as Record<string, unknown>),
      );
    }
    const { toPush, toDropLocalIds } = planMerge(local, remoteById);
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
    const dropSet = new Set(toDropLocalIds);
    this.localStore.replaceAll(
      this.localStore.getTodos().filter((t) => !dropSet.has(t.id)),
    );
  }
}
