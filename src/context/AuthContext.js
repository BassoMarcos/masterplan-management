import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase/config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";

const SUPERADMIN_EMAIL = "marky.basso98@gmail.com";

// Genera un código de empresa tipo "gru.rom.6942" (4 dígitos aleatorios, sin patrón)
function generarCodigoEmpresa() {
  const n = Math.floor(1000 + Math.random() * 9000); // 1000-9999
  return "gru.rom." + n;
}

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [empresaData, setEmpresaData] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function register(email, password, empresa) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    await setDoc(doc(db, "empresas", cred.user.uid), {
      nombre: empresa,
      email,
      creadoEn: new Date().toISOString(),
      estado: "pendiente",
      emailVerificado: false,
      codigoEmpresa: generarCodigoEmpresa()
    });
    await signOut(auth);
    return cred;
  }

  // Registro de un integrante del equipo: se engancha a la empresa que tenga el código dado.
  async function registerEmpleado(email, password, nombre, apellido, codigo) {
    // 1. Crear la cuenta primero (así queda autenticado y puede leer empresas según las reglas)
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2. Buscar la empresa por su código
    const q = query(collection(db, "empresas"), where("codigoEmpresa", "==", codigo.trim()));
    const snap = await getDocs(q);
    if (snap.empty) {
      // Código inválido: deshacemos la cuenta recién creada para no dejar basura
      try { await cred.user.delete(); } catch (e) { /* noop */ }
      await signOut(auth);
      const err = new Error("codigo-invalido");
      err.code = "codigo-invalido";
      throw err;
    }
    const empresaDoc = snap.docs[0];
    const empresaId = empresaDoc.id;

    await sendEmailVerification(cred.user);

    // 3. Crear su perfil de empleado, pendiente de aprobación, atado a la empresa
    await setDoc(doc(db, "empleados", cred.user.uid), {
      empresaId,
      empresaNombre: empresaDoc.data().nombre || "",
      email,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      estado: "pendiente",       // pendiente | aprobado | rechazado
      legajo: "",
      permisos: {},               // se completa al aprobar
      accesoTotal: false,
      creadoEn: new Date().toISOString(),
      emailVerificado: false
    });

    await signOut(auth);
    return cred;
  }

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const superAdmin = user.email === SUPERADMIN_EMAIL;
        setIsSuperAdmin(superAdmin);
        if (!superAdmin) {
          // Si el email fue verificado, actualizamos Firestore
          if (user.emailVerified) {
            const ref = doc(db, "empresas", user.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              let data = snap.data();
              const updates = {};
              if (!data.emailVerificado) updates.emailVerificado = true;
              // Empresas viejas sin código: se les genera uno la primera vez
              if (!data.codigoEmpresa) updates.codigoEmpresa = generarCodigoEmpresa();
              if (Object.keys(updates).length) {
                data = { ...data, ...updates };
                await setDoc(ref, data);
              }
              setEmpresaData(data);
            }
          } else {
            const snap = await getDoc(doc(db, "empresas", user.uid));
            if (snap.exists()) setEmpresaData(snap.data());
          }
        }
      } else {
        setEmpresaData(null);
        setIsSuperAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = { currentUser, empresaData, isSuperAdmin, register, registerEmpleado, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
