import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage from "./pages/AuthPage";
import Proyectos from "./pages/Proyectos";
import ProyectoPilares from "./pages/ProyectoPilares";
import SuperAdmin from "./pages/SuperAdmin";

function PrivateRoute({ children }) {
  const { currentUser, isSuperAdmin } = useAuth();
  if (!currentUser) return <Navigate to="/" />;
  if (isSuperAdmin) return <Navigate to="/superadmin" />;
  return children;
}

function SuperAdminRoute({ children }) {
  const { currentUser, isSuperAdmin } = useAuth();
  if (!currentUser) return <Navigate to="/" />;
  if (!isSuperAdmin) return <Navigate to="/proyectos" />;
  return children;
}

function PublicRoute({ children }) {
  const { currentUser, isSuperAdmin } = useAuth();
  if (!currentUser) return children;
  return <Navigate to={isSuperAdmin ? "/superadmin" : "/proyectos"} />;
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
