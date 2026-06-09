import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage from "./pages/AuthPage";
import Proyectos from "./pages/Proyectos";
import ProyectoPilares from "./pages/ProyectoPilares";
import SuperAdmin from "./pages/SuperAdmin";

function PrivateRoute({ children }) {
  const { currentUser, isSuperAdmin, empresaData } = useAuth();
  if (!currentUser) return <Navigate to="/" />;
  if (isSuperAdmin) return <Navigate to="/superadmin" />;
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
  if (empresaData?.estado === "activo") return <Navigate to="/proyectos" />;
  return <PendientePage />;
}

function PendientePage() {
  const { logout } = useAuth();
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "48px 40px", maxWidth: "420px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>⏳</div>
        <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#0f172a", margin: "0 0 12px" }}>Cuenta pendiente</h2>
        <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.6", margin: "0 0 28px" }}>
          Tu solicitud de registro está siendo revisada. Te notificaremos cuando tu cuenta sea aprobada.
        </p>
        <button onClick={logout} style={{ padding: "12px 24px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><AuthPage /></PublicRoute>} />
      <Route path="/proyectos" element={<PrivateRoute><Proyectos /></PrivateRoute>} />
      <Route path="/proyecto/:proyectoId" element={<PrivateRoute><ProyectoPilares /></PrivateRoute>} />
      <Route path="/superadmin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
