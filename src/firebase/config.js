import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyApIgVrTlYRxO8dKXGyVSZrvFO8skXp3rA",
  authDomain: "masterplanproyects.firebaseapp.com",
  projectId: "masterplanproyects",
  storageBucket: "masterplanproyects.firebasestorage.app",
  messagingSenderId: "681398558610",
  appId: "1:681398558610:web:c9b938d1d3417fb4772b4b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
