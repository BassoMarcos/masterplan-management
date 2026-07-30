import { useState, useRef, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeSelector() {
  const { themeId, cambiarTema, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Cambiar tema"
        style={{
          background: "transparent",
          border: "1px solid var(--border2)",
          color: "var(--text2)",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "15px",
          cursor: "pointer",
        }}
      >
        🎨
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "40px",
            right: 0,
            zIndex: 9999,
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,.5)",
            width: "240px",
          }}
        >
          <h3
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--text3)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: "10px",
            }}
          >
            🎨 Elegir tema
          </h3>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                cambiarTema(t.id);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                padding: "7px 10px",
                borderRadius: "8px",
                cursor: "pointer",
                border: "none",
                width: "100%",
                textAlign: "left",
                background: t.id === themeId ? "var(--hov)" : "transparent",
                color: "var(--text)",
                fontSize: "12px",
                fontWeight: 500,
                marginBottom: "2px",
              }}
            >
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: "1.5px solid rgba(255,255,255,.2)",
                  background: t.dot,
                }}
              />
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
