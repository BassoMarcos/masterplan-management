import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase/config";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const SUPERADMIN_EMAIL = "marky.basso98@gmail.com";

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
    await setDoc(doc(db, "empresas", cred.user.uid), {
      nombre: empresa,
      email,
      creadoEn: new Date().toISOString(),
      estado: "pendiente"
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
          const snap = await getDoc(doc(db, "empresas", user.uid));
          if (snap.exists()) setEmpresaData(snap.data());
        }
      } else {
        setEmpresaData(null);
        setIsSuperAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = { currentUser, empresaData, isSuperAdmin, register, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
