import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.js";
import { ErrorScreen } from "./app/ErrorScreen.js";
import "./app/styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("#root が見つかりません");

createRoot(container).render(
  <StrictMode>
    <ErrorScreen>
      <App />
    </ErrorScreen>
  </StrictMode>,
);

/**
 * Service Worker の登録（2-11）。
 *
 * 開発中は登録しない。古い版を掴んだまま画面が更新されないと、
 * 直したはずの不具合が直っていないように見えて調査が空回りする。
 * 登録に失敗してもアプリは通常どおり動くため、握り潰してよい。
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => undefined);
  });
}
