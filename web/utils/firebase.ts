"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import {
  type Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
} from "firebase/firestore";

// Firebase web config for the `hafaio-latr` project. These values ship in the
// client bundle by design — security is enforced by Firestore rules
// (firebase/firestore.rules). When forking, replace these with your own
// project's values; the web SDK throws on init if `appId` is left blank.
const firebaseConfig = {
  apiKey: "AIzaSyBmNn_yskTFD7Fk81mfSg3XYwSP-gMWRKI",
  authDomain: "hafaio-latr.firebaseapp.com",
  projectId: "hafaio-latr",
  storageBucket: "hafaio-latr.firebasestorage.app",
  messagingSenderId: "598050986641",
  appId: "1:598050986641:web:03d16cae09ba78f079fd30",
};

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

function app(): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = getApps()[0] ?? initializeApp(firebaseConfig);
  return cachedApp;
}

export function auth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(app());
  return cachedAuth;
}

export function db(): Firestore {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = initializeFirestore(app(), {
      localCache: persistentLocalCache(),
    });
  } catch (e) {
    // Firestore was already initialized (e.g. HMR reusing the app instance) —
    // fall back to the existing handle so we don't crash.
    console.warn("firestore: reusing existing instance", e);
    cachedDb = getFirestore(app());
  }
  return cachedDb;
}

export function firebaseConfigured(): boolean {
  return firebaseConfig.appId !== "";
}
