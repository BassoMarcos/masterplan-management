import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { sendEmailVerification } from "firebase/auth";
import AuthPage from "./pages/AuthPage";
import Proyectos from "./pages/Proyectos";
import Empleados from "./pages/Empleados";
import ProyectoPilares from "./pages/ProyectoPilares";
import AreaSecciones from "./pages/AreaSecciones";
import DesarrollosSecciones from "./pages/DesarrollosSecciones";
import SuperAdmin from "./pages/SuperAdmin";

function VerificarEmailPage() {
  const { currentUser, logout } = useAuth();
  const [enviado, setEnviado] = useState(false);

  async function reenviar() {
    await sendEmailVerification(currentUser);
    setEnviado(true);
  }

  return (
    <div style={pageStyle.container}>
      <div style={pageStyle.card}>
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>📧</div>
        <h2 style={pageStyle.title}>Verificá tu email</h2>
        <p style={pageStyle.text}>
          Te enviamos un email de verificación a <strong>{currentUser?.email}</strong>.
          Revisá tu bandeja de entrada y hacé click en el link para continuar.
        </p>
        {enviado && <p style={pageStyle.ok}>✓ Email reenviado</p>}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "16px" }}>
          <button onClick={reenviar} style={pageStyle.btnSecundario}>Reenviar email</button>
          <button onClick={() => window.location.reload()} style={pageStyle.btn}>Ya lo verifiqué</button>
        </div>
        <button onClick={logout} style={pageStyle.link}>Cerrar sesión</button>
      </div>
    </div>
  );
}

function PendientePage() {
  const { logout } = useAuth();
  return (
    <div style={pageStyle.container}>
      <div style={pageStyle.card}>
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>⏳</div>
        <h2 style={pageStyle.title}>Cuenta pendiente</h2>
        <p style={pageStyle.text}>
          Tu email fue verificado correctamente. Tu solicitud está siendo revisada y será aprobada a la brevedad.
        </p>
        <button onClick={logout} style={pageStyle.btn}>Cerrar sesión</button>
      </div>
    </div>
  );
}

const pageStyle = {
  container: { minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "20px" },
  card: { background: "#fff", borderRadius: "16px", padding: "48px 40px", maxWidth: "440px", width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  title: { fontSize: "22px", fontWeight: "700", color: "#0f172a", margin: "0 0 12px" },
  text: { fontSize: "14px", color: "#64748b", lineHeight: "1.6", margin: "0 0 24px" },
  ok: { color: "#16a34a", fontSize: "13px", marginBottom: "16px" },
  btn: { padding: "12px 24px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  btnSecundario: { padding: "12px 24px", background: "#f1f5f9", color: "#0f172a", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  link: { background: "none", border: "none", color: "#94a3b8", fontSize: "13px", cursor: "pointer", marginTop: "8px", display: "block", textDecoration: "underline" },
};

function SeccionPlaceholder() {
  const { proyectoId, pilarId, seccionId } = useParams();
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Segoe UI', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ textAlign: "center", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: "16px", padding: "48px 40px", maxWidth: "440px" }}>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>🚧</div>
        <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 8px", textTransform: "capitalize" }}>{seccionId.replace(/-/g, " ")}</h2>
        <p style={{ fontSize: "14px", color: "var(--text2)", lineHeight: "1.6", margin: "0 0 24px" }}>
          Esta sección está en construcción. La vamos a desarrollar próximamente.
        </p>
        <button
          style={{ padding: "10px 20px", background: "var(--acc)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
          onClick={() => navigate(`/proyecto/${proyectoId}/${pilarId}`)}
        >
          ← Volver
        </button>
      </div>
    </div>
  );
}

function PrivateRoute({ children }) {
  const { currentUser, isSuperAdmin, empresaData } = useAuth();
  if (!currentUser) return <Navigate to="/" />;
  if (isSuperAdmin) return <Navigate to="/superadmin" />;
  if (!currentUser.emailVerified) return <VerificarEmailPage />;
  if (empresaData?.estado !== "activo") return <PendientePage />;
  return children;
}

function SuperAdminRoute({ children }) {
  const { currentUser, isSuperAdmin } = useAuth();
  if (!currentUser) return <Navigate to="/" />;
  if (!isSuperAdmin) return <Navigate to="/proyectos" />;
  return children;
}

function PublicRoute({ children }) {
  const { currentUser, isSuperAdmin, empresaData } = useAuth();
  if (!currentUser) return children;
  if (isSuperAdmin) return <Navigate to="/superadmin" />;
  if (!currentUser.emailVerified) return <VerificarEmailPage />;
  if (empresaData?.estado === "activo") return <Navigate to="/proyectos" />;
  return <PendientePage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><AuthPage /></PublicRoute>} />
      <Route path="/proyectos" element={<PrivateRoute><Proyectos /></PrivateRoute>} />
      <Route path="/empleados" element={<PrivateRoute><Empleados /></PrivateRoute>} />
      <Route path="/proyecto/:proyectoId" element={<PrivateRoute><ProyectoPilares /></PrivateRoute>} />
      <Route path="/proyecto/:proyectoId/:pilarId" element={<PrivateRoute><AreaSecciones /></PrivateRoute>} />
      <Route path="/proyecto/:proyectoId/desarrollos/:seccionId" element={<PrivateRoute><DesarrollosSecciones /></PrivateRoute>} />
      <Route path="/proyecto/:proyectoId/:pilarId/:seccionId" element={<PrivateRoute><SeccionPlaceholder /></PrivateRoute>} />
      <Route path="/superadmin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
