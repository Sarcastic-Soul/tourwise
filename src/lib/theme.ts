export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "tourwise-theme";

/**
 * Runs before first paint (inlined in the root layout) so a saved choice
 * shows without a flash of the other theme.
 */
export const themeScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
