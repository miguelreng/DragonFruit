/**
 * Public readers are intentionally light-only. Applying the theme at the
 * document root prevents ancestor-based `dark:` variants and root-scoped
 * semantic color aliases from leaking into the public page.
 */
export const applyPublicPageLightTheme = () => {
  const root = document.documentElement;
  const previousTheme = root.getAttribute("data-theme");
  const previousColorScheme = root.style.getPropertyValue("color-scheme");

  root.setAttribute("data-theme", "light");
  root.style.setProperty("color-scheme", "only light");

  return () => {
    if (previousTheme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previousTheme);

    if (previousColorScheme) root.style.setProperty("color-scheme", previousColorScheme);
    else root.style.removeProperty("color-scheme");
  };
};
