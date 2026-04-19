"use client";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { FaGoogle, FaSignOutAlt, FaTrashAlt, FaUser } from "react-icons/fa";
import { auth, firebaseConfigured } from "../utils/firebase";
import { useTodos } from "../utils/store";
import { type SyncHandle, startSync } from "../utils/sync";

let syncHandle: SyncHandle | null = null;

export default function AuthMenu(): ReactElement {
  const { todos, applyRemote, removeRemote } = useTodos();
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const uploadedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (syncHandle) return;
    syncHandle = startSync({
      onUser: (u) => setUser(u),
      onRemoteApply: (remote) => applyRemote(remote),
      onRemoteRemove: (ids) => removeRemote(ids),
    });
    return () => {
      syncHandle?.dispose();
      syncHandle = null;
    };
  }, [applyRemote, removeRemote]);

  useEffect(() => {
    if (!user) {
      uploadedForUidRef.current = null;
      syncHandle?.stopListening();
      return;
    }
    if (uploadedForUidRef.current === user.uid) return;
    uploadedForUidRef.current = user.uid;
    (async () => {
      try {
        await syncHandle?.uploadAll(todosRef.current);
      } catch (e) {
        console.error("uploadAll", e);
      }
      syncHandle?.startListening();
    })();
  }, [user]);

  async function signIn() {
    if (!firebaseConfigured()) {
      alert(
        "Firebase web config needs an appId. Register a Web app in the Firebase console and paste the appId into web/utils/firebase.ts.",
      );
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth(), provider);
    } catch (e) {
      console.error(e);
    }
  }

  async function doSignOut() {
    try {
      await signOut(auth());
    } catch (e) {
      console.error(e);
    }
    setOpen(false);
  }

  async function deleteAccount() {
    if (!user) return;
    if (
      !confirm(
        "Delete your account? This removes all remote todos and your auth record. Local todos are preserved.",
      )
    )
      return;
    try {
      syncHandle?.stopListening();
      await syncHandle?.deleteAllRemote();
      await user.delete();
    } catch (e) {
      console.error(e);
      alert("Delete failed. You may need to sign in again recently and retry.");
    }
  }

  const labelClasses =
    "truncate max-w-[8rem] group-data-[collapsed=true]/sidebar:hidden group-data-[collapsed=true]/sidebar:group-hover/sidebar:inline";

  if (!user) {
    return (
      <button
        type="button"
        onClick={signIn}
        className="flex items-center gap-2 p-2 rounded-md text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Sign in with Google"
      >
        <FaGoogle className="shrink-0" />
        <span className={labelClasses}>Sign in</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 p-1.5 rounded-md text-sm text-text hover:bg-surface-hover transition-colors"
        title={user.email ?? "Account"}
      >
        {user.photoURL ? (
          // biome-ignore lint/performance/noImgElement: user avatars come from external providers; optimization not worth the config
          <img
            src={user.photoURL}
            alt=""
            className="w-6 h-6 rounded-full shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <FaUser className="shrink-0" />
        )}
        <span className={labelClasses}>{user.displayName ?? user.email}</span>
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-56 bg-surface border border-border rounded-md shadow-lg overflow-hidden z-30">
          <div className="px-3 py-2 text-xs text-muted border-b border-border truncate">
            {user.email}
          </div>
          <button
            type="button"
            onClick={doSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <FaSignOutAlt />
            Sign out
          </button>
          <button
            type="button"
            onClick={deleteAccount}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface-hover"
          >
            <FaTrashAlt />
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}
