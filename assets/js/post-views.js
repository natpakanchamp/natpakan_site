// Per-post view counter backed by Firebase Firestore.
// Increments once per browser session per post, then displays the total.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

(async function () {
  const el = document.getElementById("post-views");
  if (!el) return;

  const slug = el.getAttribute("data-slug");
  if (!slug) return;

  // Config not filled in yet — fail gracefully, don't break the page.
  if (!firebaseConfig || firebaseConfig.apiKey === "REPLACE_ME") {
    el.textContent = "—";
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const ref = doc(db, "pageViews", slug);

    // Count at most once per browser session per post.
    const sessionKey = "viewed:" + slug;
    if (!sessionStorage.getItem(sessionKey)) {
      await setDoc(ref, { count: increment(1) }, { merge: true });
      sessionStorage.setItem(sessionKey, "1");
    }

    const snap = await getDoc(ref);
    const count = (snap.exists() && snap.data().count) || 0;
    el.textContent = count.toLocaleString();
  } catch (err) {
    el.textContent = "—";
    console.error("[post-views]", err);
  }
})();
