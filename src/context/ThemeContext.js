import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";

// Los 10 temas portados de FJ App
export const THEMES = [
  { id: "gris-oscuro", name: "Gris oscuro", dot: "#888888",
    bg: "#222222", surf: "#2d2d2d", card: "#363636", hov: "#404040", bor: "#444444", bor2: "#4e4e4e",
    txt: "#e8e8e8", txt2: "#aaaaaa", txt3: "#666666",
    acc: "#4F8F75", acc2: "#5DCAA5", acc3: "#9FC3B2",
    blu: "#1a3a4a", bluTxt: "#7ab5d0", nav: "#1a1a1a" },
  { id: "verde-bosque", name: "Verde bosque", dot: "#4F8F75",
    bg: "#0d1a16", surf: "#132019", card: "#1a2d24", hov: "#1f3529", bor: "#1f3529", bor2: "#2a4a38",
    txt: "#e8f0ec", txt2: "#8aaa99", txt3: "#506860",
    acc: "#4F8F75", acc2: "#5DCAA5", acc3: "#9FC3B2",
    blu: "#1a3a4a", bluTxt: "#7ab5d0", nav: "#0a1510" },
  { id: "azul-marino", name: "Azul marino", dot: "#378ADD",
    bg: "#0d1520", surf: "#101d2e", card: "#152436", hov: "#1a2d42", bor: "#1f3650", bor2: "#243d5e",
    txt: "#e4edf5", txt2: "#7a9ab5", txt3: "#3d5a72",
    acc: "#378ADD", acc2: "#85B7EB", acc3: "#b5d4f4",
    blu: "#0c2a4a", bluTxt: "#85B7EB", nav: "#090f1a" },
  { id: "cian-profundo", name: "Cian profundo", dot: "#00BCD4",
    bg: "#091a1c", surf: "#0d2426", card: "#122c30", hov: "#183438", bor: "#1a3840", bor2: "#204550",
    txt: "#d8f4f6", txt2: "#70b8c0", txt3: "#3a7880",
    acc: "#0d9aaa", acc2: "#40d8e8", acc3: "#80e8f0",
    blu: "#0d3a40", bluTxt: "#60d8e8", nav: "#060f10" },
  { id: "grafito-naranja", name: "Grafito & naranja", dot: "#F57C00",
    bg: "#181818", surf: "#222222", card: "#2a2a2a", hov: "#333333", bor: "#3a3a3a", bor2: "#444444",
    txt: "#f0f0f0", txt2: "#aaaaaa", txt3: "#666666",
    acc: "#e07820", acc2: "#ff9840", acc3: "#ffb870",
    blu: "#3a2000", bluTxt: "#ff9840", nav: "#101010" },
  { id: "blanco-gris", name: "Blanco & gris", dot: "#555555",
    bg: "#f5f5f5", surf: "#ffffff", card: "#ffffff", hov: "#f0f0f0", bor: "#e0e0e0", bor2: "#cccccc",
    txt: "#1a1a1a", txt2: "#555555", txt3: "#999999",
    acc: "#1a56db", acc2: "#1a56db", acc3: "#3b82f6",
    blu: "#dbeafe", bluTxt: "#1e40af", nav: "#1a56db" },
  { id: "pizarra-azul", name: "Pizarra azul", dot: "#6a8aaa",
    bg: "#151c25", surf: "#1c2535", card: "#222e40", hov: "#2a3850", bor: "#2e3e54", bor2: "#3a4e68",
    txt: "#d8e4f0", txt2: "#8090a8", txt3: "#506070",
    acc: "#2e4a6a", acc2: "#90b8e0", acc3: "#b0d0f0",
    blu: "#1a2e45", bluTxt: "#70a0c8", nav: "#0f1620" },
  { id: "lavanda-oscuro", name: "Lavanda oscuro", dot: "#9C7EBD",
    bg: "#130f1e", surf: "#1c1828", card: "#242030", hov: "#2c2838", bor: "#382848", bor2: "#443258",
    txt: "#ede8f8", txt2: "#a898c8", txt3: "#6858a0",
    acc: "#7858a8", acc2: "#b898e8", acc3: "#d0b8f8",
    blu: "#2a1e48", bluTxt: "#a888d8", nav: "#0e0b18" },
  { id: "acero-azul", name: "Acero azul", dot: "#78909C",
    bg: "#161c20", surf: "#1e262c", card: "#252f36", hov: "#2d3840", bor: "#303c44", bor2: "#3a4a54",
    txt: "#e0eaf0", txt2: "#8090a0", txt3: "#4a5a68",
    acc: "#4a7890", acc2: "#80b0c8", acc3: "#a8c8e0",
    blu: "#1e3040", bluTxt: "#80b0c8", nav: "#0e1418" },
  { id: "ambar-negro", name: "Ámbar negro", dot: "#FFB300",
    bg: "#111111", surf: "#1a1a1a", card: "#222222", hov: "#2a2a2a", bor: "#333333", bor2: "#3e3e3e",
    txt: "#fff8e8", txt2: "#c8a840", txt3: "#806820",
    acc: "#c08820", acc2: "#f0c030", acc3: "#f8d870",
    blu: "#2a1e00", bluTxt: "#f0c030", nav: "#080808" },
];

const DEFAULT_THEME_ID = "azul-marino";

function applyTheme(t) {
  const r = document.documentElement.style;
  r.setProperty("--bg", t.bg);
  r.setProperty("--surface", t.surf);
  r.setProperty("--card", t.card);
  r.setProperty("--hov", t.hov);
  r.setProperty("--border", t.bor);
  r.setProperty("--border2", t.bor2);
  r.setProperty("--text", t.txt);
  r.setProperty("--text2", t.txt2);
  r.setProperty("--text3", t.txt3);
  r.setProperty("--brand", t.acc);
  r.setProperty("--acc", t.acc);
  r.setProperty("--acc2", t.acc2);
  r.setProperty("--acc3", t.acc3);
  r.setProperty("--blu-bg", t.blu);
  r.setProperty("--blu", t.bluTxt);
  r.setProperty("--blue-bg", t.blu);
  r.setProperty("--blue", t.bluTxt);
  r.setProperty("--blue-border", t.bluTxt + "88");
  r.setProperty("--nav", t.nav);
  document.body.style.background = t.bg;
  document.body.style.color = t.txt;
}

const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const { currentUser } = useAuth();
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem("mp_theme") || DEFAULT_THEME_ID;
  });

  // Aplicar el tema cada vez que cambia
  useEffect(() => {
    const t = THEMES.find((x) => x.id === themeId) || THEMES[0];
    applyTheme(t);
    localStorage.setItem("mp_theme", themeId);
  }, [themeId]);

  // Al iniciar sesión, leer el tema guardado en Firestore
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "preferencias", currentUser.uid));
        if (snap.exists() && snap.data().theme) {
          setThemeId(snap.data().theme);
        }
      } catch (e) {
        console.error("No se pudo leer el tema:", e);
      }
    })();
  }, [currentUser]);

  const cambiarTema = useCallback(
    async (id) => {
      setThemeId(id);
      if (currentUser) {
        try {
          await setDoc(
            doc(db, "preferencias", currentUser.uid),
            { theme: id },
            { merge: true }
          );
        } catch (e) {
          console.error("No se pudo guardar el tema:", e);
        }
      }
    },
    [currentUser]
  );

  const value = { themeId, cambiarTema, themes: THEMES };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
