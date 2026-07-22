import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./state/AuthContext.jsx";
import { applyTheme, watchSystemTheme } from "./lib/theme.js";

applyTheme();
watchSystemTheme();

// La registrazione del service worker (PWA) ora vive nel componente
// UpdateBanner (montato in App.jsx): con registerType "prompt" serve React
// per mostrare il banner "nuova versione disponibile". Registrarlo anche
// qui creerebbe una doppia registrazione.

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
