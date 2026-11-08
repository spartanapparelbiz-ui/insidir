/* The site's theme: html[data-theme] is "light" or "dark". The visitor's choice is kept on this device (localStorage);
 * with none, the site follows the system setting. THEME_SCRIPT runs in <head> (app/layout.tsx) before anything paints,
 * so the page never flashes the other theme. The toggle: components/brand/ThemeToggle.tsx. */
export const THEME_KEY = "insidir_theme";
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;
