// Light/dark page theme: stored choice, else the system preference.
// index.html applies the stored theme before first paint to avoid a flash.
const KEY = "flames.theme";
const media = matchMedia("(prefers-color-scheme: dark)");

export const currentTheme = () => localStorage.getItem(KEY) || (media.matches ? "dark" : "light");

/** the theme applied to the page right now: "dark" or "light" (the figure follows it) */
export const pageTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** onChange(theme) runs after each switch, not on the first apply */
export function initTheme(button, onChange = () => {}) {
  const apply = () => {
    const dark = currentTheme() === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    button.setAttribute("aria-pressed", String(dark));
    button.title = dark ? "Switch to light mode" : "Switch to dark mode";
  };
  button.addEventListener("click", () => {
    localStorage.setItem(KEY, currentTheme() === "dark" ? "light" : "dark");
    apply();
    onChange(pageTheme());
  });
  media.addEventListener("change", () => { apply(); onChange(pageTheme()); });
  apply();
}
