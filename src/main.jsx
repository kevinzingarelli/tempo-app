import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./state/AuthContext.jsx";
import { applyTheme, watchSystemTheme } from "./lib/theme.js";

applyTheme();
watchSystemTheme();

// Registrazione service worker (PWA / aggiornamenti automatici).
// Avvolta in try/catch per non bloccare l'app se non disponibile.
try {
  // eslint-disable-next-line import/no-unresolved
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {});
} catch (e) {
  /* ignora */
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
