/* The site's theme: one terminal theme (app/tokens.css), set on html[data-theme] before anything paints. The earlier
 * light mode is retired; THEME_KEY stays so an old saved choice is simply ignored. */
export const THEME_KEY = "insidir_theme";
export const THEME_SCRIPT = `(function(){document.documentElement.dataset.theme="dark"})();`;
