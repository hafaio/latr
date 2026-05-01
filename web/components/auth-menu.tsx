"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { type ReactElement, useEffect, useState } from "react";
import { FaGoogle, FaSignOutAlt, FaTrashAlt, FaUser } from "react-icons/fa";
import { auth, firebaseConfigured } from "../utils/firebase";
import { useTodos } from "../utils/store";

export default function AuthMenu(): ReactElement {
  const { holder } = useTodos();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured()) return;
    return onAuthStateChanged(auth(), setUser);
  }, []);

  // Reattach Firestore snapshot listener after tab wake / online — covers
  // WebChannel drops during long idle that would otherwise leave the
  // listener silent.
  useEffect(() => {
    if (!user) return;
    function wake() {
      if (document.visibilityState !== "visible") return;
      holder.reattach();
    }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [user, holder]);

  async function signIn() {
    if (!firebaseConfigured()) {
      alert(
        "Firebase web config needs an appId. Register a Web app in the Firebase console and paste the appId into web/utils/firebase.ts.",
      );
      return;
    }
    try {
      await holder.signIn();
    } catch (e) {
      console.error(e);
    }
  }

  async function doSignOut() {
    try {
      await holder.signOut();
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
      await holder.deleteAccount();
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
