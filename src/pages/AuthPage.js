import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase/config";

export default function AuthPage() {
  // vista: "personal" (equipo) | "empresa" (dueños)
  const [vista, setVista] = useState("personal");
  // modo dentro de cada vista
  const [modoPersonal, setModoPersonal] = useState("login");   // login | registro
  const [modoEmpresa, setModoEmpresa] = useState("login");     // login | registro

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [codigo, setCodigo] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registroExitoso, setRegistroExitoso] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  const { login, register, registerEmpleado } = useAuth();

  function limpiar() {
    setError(""); setResetEnviado(false);
    setPassword(""); setPassword2("");
  }

  async function handleOlvidePassword() {
    setError(""); setResetEnviado(false);
    if (!email.trim()) { setError("Escribí tu email arriba y volvé a apretar el link"); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetEnviado(true);
    } catch (err) {
      if (err.code === "auth/user-not-found") setError("No existe una cuenta con ese email");
      else if (err.code === "auth/invalid-email") setError("El email no es válido");
      else setError("No se pudo enviar el correo. Intentá de nuevo.");
    }
    setLoading(false);
  }

  function traducirError(err) {
    if (err.code === "codigo-invalido") return "El código de empresa no es válido. Revisalo con tu empresa.";
    if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") return "Email o contraseña incorrectos";
    if (err.code === "auth/email-already-in-use") return "Ya existe una cuenta con ese email";
    if (err.code === "auth/weak-password") return "La contraseña debe tener al menos 6 caracteres";
    if (err.code === "auth/invalid-email") return "El email no es válido";
    return "Ocurrió un error. Intentá de nuevo.";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const esRegistro = (vista === "personal" && modoPersonal === "registro") || (vista === "empresa" && modoEmpresa === "registro");

    if (esRegistro) {
      if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
      if (password !== password2) { setError("Las contraseñas no coinciden"); return; }
    }
    if (vista === "empresa" && modoEmpresa === "registro" && !empresa.trim()) { setError("Ingresá el nombre de tu empresa"); return; }
    if (vista === "personal" && modoPersonal === "registro") {
      if (!nombre.trim() || !apellido.trim()) { setError("Ingresá tu nombre y apellido"); return; }
      if (!codigo.trim()) { setError("Ingresá el código de tu empresa"); return; }
    }

    setLoading(true);
    try {
      if (vista === "empresa") {
        if (modoEmpresa === "login") await login(email, password);
        else { await register(email, password, empresa); setRegistroExitoso(true); }
      } else {
        if (modoPersonal === "login") await login(email, password);
        else { await registerEmpleado(email, password, nombre, apellido, codigo); setRegistroExitoso(true); }
      }
    } catch (err) {
      setError(traducirError(err));
    }
    setLoading(false);
  }

  if (registroExitoso) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✅</div>
          <h2 style={styles.successTitle}>¡Registro exitoso!</h2>
          <p style={styles.successText}>
            Tu cuenta está siendo revisada. Te notificaremos cuando sea aprobada y puedas comenzar a usar el sistema.
          </p>
          <button style={styles.btn} onClick={() => { setRegistroExitoso(false); setModoPersonal("login"); setModoEmpresa("login"); limpiar(); }}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const esPersonal = vista === "personal";

  return (
    <div style={styles.container}>
      {/* Acceso Empresas arriba a la derecha */}
      <button
        style={styles.empresaToggle}
        onClick={() => { setVista(esPersonal ? "empresa" : "personal"); limpiar(); }}
      >
        {esPersonal ? "🏢 Acceso Empresas" : "← Volver a Acceso Personal"}
      </button>

      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🏗️</span>
          <h1 style={styles.logoText}>MasterPlan</h1>
          <p style={styles.logoSub}>{esPersonal ? "Acceso Personal" : "Acceso Empresas"}</p>
        </div>

        {esPersonal ? (
          <>
            <div style={styles.tabs}>
              <button style={{ ...styles.tab, ...(modoPersonal === "login" ? styles.tabActive : {}) }} onClick={() => { setModoPersonal("login"); limpiar(); }}>Ingresar</button>
              <button style={{ ...styles.tab, ...(modoPersonal === "registro" ? styles.tabActive : {}) }} onClick={() => { setModoPersonal("registro"); limpiar(); }}>Primera vez</button>
            </div>

            <form onSubmit={handleSubmit} style={styles.form} autoComplete="on">
              {modoPersonal === "registro" && (
                <>
                  <div style={styles.row}>
                    <div style={{ ...styles.field, flex: 1 }}>
                      <label style={styles.label}>Nombre</label>
                      <input style={styles.input} type="text" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} required />
                    </div>
                    <div style={{ ...styles.field, flex: 1 }}>
                      <label style={styles.label}>Apellido</label>
                      <input style={styles.input} type="text" placeholder="Tu apellido" value={apellido} onChange={e => setApellido(e.target.value)} required />
                    </div>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Código de la empresa</label>
                    <input style={styles.input} type="text" placeholder="Pegá el código que te dieron" value={codigo} onChange={e => setCodigo(e.target.value)} required />
                    <span style={styles.hint}>Te lo da tu empresa. Solo lo necesitás esta primera vez.</span>
                  </div>
                </>
              )}
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" id="email" name="email" autoComplete="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Contraseña</label>
                <input style={styles.input} type="password" id="password" name="password" autoComplete={modoPersonal === "registro" ? "new-password" : "current-password"} placeholder={modoPersonal === "registro" ? "Mínimo 6 caracteres" : "Tu contraseña"} value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {modoPersonal === "registro" && (
                <div style={styles.field}>
                  <label style={styles.label}>Repetir contraseña</label>
                  <input style={{ ...styles.input, ...(password2 && password !== password2 ? styles.inputError : {}) }} type="password" name="password2" autoComplete="new-password" placeholder="Repetí tu contraseña" value={password2} onChange={e => setPassword2(e.target.value)} required />
                  {password2 && password !== password2 && <span style={styles.matchError}>Las contraseñas no coinciden</span>}
                  {password2 && password === password2 && password.length >= 6 && <span style={styles.matchOk}>✓ Las contraseñas coinciden</span>}
                </div>
              )}
              {modoPersonal === "login" && (
                <button type="button" onClick={handleOlvidePassword} disabled={loading} style={styles.linkBtn}>¿Olvidaste tu contraseña?</button>
              )}
              {resetEnviado && <p style={styles.resetOk}>📧 Te enviamos un correo para restablecer tu contraseña. Revisá tu bandeja (y spam).</p>}
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" style={styles.btn} disabled={loading}>
                {loading ? "Cargando..." : modoPersonal === "login" ? "Ingresar" : "Solicitar registro"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div style={styles.tabs}>
              <button style={{ ...styles.tab, ...(modoEmpresa === "login" ? styles.tabActive : {}) }} onClick={() => { setModoEmpresa("login"); limpiar(); }}>Ingresar</button>
              <button style={{ ...styles.tab, ...(modoEmpresa === "registro" ? styles.tabActive : {}) }} onClick={() => { setModoEmpresa("registro"); limpiar(); }}>Registrarse</button>
            </div>

            <form onSubmit={handleSubmit} style={styles.form} autoComplete="on">
              {modoEmpresa === "registro" && (
                <div style={styles.field}>
                  <label style={styles.label}>Nombre de la empresa</label>
                  <input style={styles.input} type="text" placeholder="Ej: Desarrollos Inmobiliarios" value={empresa} onChange={e => setEmpresa(e.target.value)} required />
                </div>
              )}
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" name="email" autoComplete="email" placeholder="email@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Contraseña</label>
                <input style={styles.input} type="password" name="password" autoComplete={modoEmpresa === "registro" ? "new-password" : "current-password"} placeholder={modoEmpresa === "registro" ? "Mínimo 6 caracteres" : "Tu contraseña"} value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {modoEmpresa === "registro" && (
                <div style={styles.field}>
                  <label style={styles.label}>Repetir contraseña</label>
                  <input style={{ ...styles.input, ...(password2 && password !== password2 ? styles.inputError : {}) }} type="password" name="password2" autoComplete="new-password" placeholder="Repetí tu contraseña" value={password2} onChange={e => setPassword2(e.target.value)} required />
                  {password2 && password !== password2 && <span style={styles.matchError}>Las contraseñas no coinciden</span>}
                  {password2 && password === password2 && password.length >= 6 && <span style={styles.matchOk}>✓ Las contraseñas coinciden</span>}
                </div>
              )}
              {modoEmpresa === "login" && (
                <button type="button" onClick={handleOlvidePassword} disabled={loading} style={styles.linkBtn}>¿Olvidaste tu contraseña?</button>
              )}
              {resetEnviado && <p style={styles.resetOk}>📧 Te enviamos un correo para restablecer tu contraseña. Revisá tu bandeja (y spam).</p>}
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" style={styles.btn} disabled={loading}>
                {loading ? "Cargando..." : modoEmpresa === "login" ? "Ingresar" : "Solicitar registro"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "'Segoe UI', sans-serif", position: "relative" },
  empresaToggle: { position: "absolute", top: "20px", right: "20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" },
  card: { background: "#fff", borderRadius: "16px", padding: "40px", width: "100%", maxWidth: "440px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  logo: { textAlign: "center", marginBottom: "28px" },
  logoIcon: { fontSize: "48px" },
  logoText: { margin: "8px 0 4px", fontSize: "28px", color: "#0f172a", fontWeight: "700" },
  logoSub: { margin: 0, color: "#64748b", fontSize: "14px", fontWeight: "600" },
  tabs: { display: "flex", background: "#f1f5f9", borderRadius: "8px", padding: "4px", marginBottom: "24px" },
  tab: { flex: 1, padding: "10px", border: "none", background: "transparent", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500", color: "#64748b" },
  tabActive: { background: "#fff", color: "#0f172a", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  row: { display: "flex", gap: "12px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "13px", fontWeight: "600", color: "#374151" },
  hint: { fontSize: "12px", color: "#64748b" },
  input: { padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  inputError: { border: "1.5px solid #ef4444" },
  matchError: { fontSize: "12px", color: "#ef4444" },
  matchOk: { fontSize: "12px", color: "#16a34a" },
  error: { background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", margin: 0 },
  linkBtn: { background: "none", border: "none", color: "#1e3a5f", fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: 0, textAlign: "right", marginTop: "-8px", fontFamily: "inherit" },
  resetOk: { background: "#f0fdf4", color: "#16a34a", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", margin: 0 },
  btn: { padding: "13px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: "600", cursor: "pointer", marginTop: "4px" },
  successIcon: { textAlign: "center", fontSize: "56px", marginBottom: "16px" },
  successTitle: { textAlign: "center", fontSize: "22px", fontWeight: "700", color: "#0f172a", margin: "0 0 12px" },
  successText: { textAlign: "center", fontSize: "14px", color: "#64748b", lineHeight: "1.6", margin: "0 0 24px" },
};
