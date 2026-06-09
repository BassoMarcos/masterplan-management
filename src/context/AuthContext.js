import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase/config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification
} from "firebase/auth";
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
    await sendEmailVerification(cred.user);
    await setDoc(doc(db, "empresas", cred.user.uid), {
      nombre: empresa,
      email,
      creadoEn: new Date().toISOString(),
      estado: "pendiente",
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
              const data = snap.data();
              if (!data.emailVerificado) {
                await setDoc(ref, { ...data, emailVerificado: true });
                setEmpresaData({ ...data, emailVerificado: true });
              } else {
                setEmpresaData(data);
              }
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

  const value = { currentUser, empresaData, isSuperAdmin, register, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
