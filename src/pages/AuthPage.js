import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [modo, setModo] = useState("login"); // "login" | "registro"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (modo === "login") {
        await login(email, password);
      } else {
        if (!empresa.trim()) { setError("Ingresá el nombre de tu empresa"); setLoading(false); return; }
        await register(email, password, empresa);
      }
      navigate("/dashboard");
    } catch (err) {
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("Email o contraseña incorrectos");
      } else if (err.code === "auth/email-already-in-use") {
        setError("Ya existe una cuenta con ese email");
      } else if (err.code === "auth/weak-password") {
        setError("La contraseña debe tener al menos 6 caracteres");
      } else {
        setError("Ocurrió un error. Intentá de nuevo.");
      }
    }
    setLoading(false);
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🏗️</span>
          <h1 style={styles.logoText}>MasterPlan</h1>
          <p style={styles.logoSub}>Gestión Inmobiliaria</p>
        </div>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(modo === "login" ? styles.tabActive : {}) }}
            onClick={() => { setModo("login"); setError(""); }}
          >
            Ingresar
          </button>
          <button
            style={{ ...styles.tab, ...(modo === "registro" ? styles.tabActive : {}) }}
            onClick={() => { setModo("registro"); setError(""); }}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {modo === "registro" && (
            <div style={styles.field}>
              <label style={styles.label}>Nombre de la empresa</label>
              <input
                style={styles.input}
                type="text"
                placeholder="Ej: FJ Desarrollos Inmobiliarios"
                value={empresa}
                onChange={e => setEmpresa(e.target.value)}
                required
              />
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="email@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <input
              style={styles.input}
              type="password"
              placeholder={modo === "registro" ? "Mínimo 6 caracteres" : "Tu contraseña"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? "Cargando..." : modo === "login" ? "Ingresar" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Segoe UI', sans-serif"
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
  },
  logo: { textAlign: "center", marginBottom: "28px" },
  logoIcon: { fontSize: "48px" },
  logoText: { margin: "8px 0 4px", fontSize: "28px", color: "#0f172a", fontWeight: "700" },
  logoSub: { margin: 0, color: "#64748b", fontSize: "14px" },
  tabs: { display: "flex", background: "#f1f5f9", borderRadius: "8px", padding: "4px", marginBottom: "24px" },
  tab: {
    flex: 1, padding: "10px", border: "none", background: "transparent",
    borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500", color: "#64748b",
    transition: "all 0.2s"
  },
  tabActive: { background: "#fff", color: "#0f172a", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "13px", fontWeight: "600", color: "#374151" },
  input: {
    padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: "8px",
    fontSize: "14px", outline: "none", transition: "border 0.2s",
    fontFamily: "inherit"
  },
  error: { background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", margin: 0 },
  btn: {
    padding: "13px", background: "#1e3a5f", color: "#fff", border: "none",
    borderRadius: "8px", fontSize: "15px", fontWeight: "600", cursor: "pointer",
    marginTop: "4px", transition: "background 0.2s"
  }
};
