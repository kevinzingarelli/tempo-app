// Gestione tema: "auto" (segue il sistema), "light", "dark".
const KEY = "pomodoro_theme";

export function getThemePref() {
  return localStorage.getItem(KEY) || "auto";
}

export function setThemePref(pref) {
  localStorage.setItem(KEY, pref);
  applyTheme();
}

export function applyTheme() {
  const pref = getThemePref();
  const dark =
    pref === "dark" ||
    (pref === "auto" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

// Segui i cambi di sistema quando si è in "auto"
export function watchSystemTheme() {
  if (!window.matchMedia) return;
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getThemePref() === "auto") applyTheme();
    });
}
