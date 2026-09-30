// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
// BIBLIOTECA DE DOCUMENTOS — explorador tipo compu: carpetas, archivos, vista previa, subir (también
// carpetas enteras), arrastrar para mover, cambiar nombre, papelera y quién ve cada carpeta.
// Una sola pantalla para las dos bibliotecas:
//   /biblioteca/:carpetaId?                                  → la general de la empresa
//   /proyecto/:proyectoId/biblioteca/:carpetaId?             → la de cada proyecto (para todas las áreas)
// Los archivos están en el Google Drive de CADA EMPRESA; el servidor revisa quién ve qué (utils/biblioteca.js).
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import ThemeSelector from "../components/ThemeSelector";
import Notificaciones from "../components/Notificaciones";
import { bib, subirABiblioteca, traerArchivo, descargarArchivo, tipoVista, iconoArchivo, tamanoLegible, fechaCorta, MAX_MB, hacerMiniatura } from "../utils/biblioteca";

const TIPO_INTERNO = "application/x-mp-biblioteca"; // lo que se arrastra DENTRO de la biblioteca (mover)
const tiposDe = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []);
const esInterno = (e) => tiposDe(e).includes(TIPO_INTERNO);
const esDeLaCompu = (e) => tiposDe(e).includes("Files");
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" });
// Se traen solos (al pasar el mouse / el anterior y el siguiente): los que se muestran tal cual, sin convertir.
const rapidoDeTraer = (mime) => ["imagen", "pdf", "texto"].includes(tipoVista(mime));
// Los que pueden tener miniatura (fotos, PDF, documentos, videos).
const conMiniatura = (mime) => ["imagen", "pdf", "documento", "video"].includes(tipoVista(mime));

// Lo que se suelta desde la compu: archivos sueltos o carpetas enteras (con lo de adentro).
// Devuelve [{ file, ruta: ["Carpeta", "Sub"] }]; file null = carpeta vacía (igual se crea).
// OJO: la primera parte corre sin esperar, porque el navegador borra lo arrastrado al terminar el evento.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
async function leerSoltado(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const entradas = items.map(it => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
  const sueltos = Array.from(dataTransfer.files || []);
  if (!entradas.length) return sueltos.map(f => ({ file: f, ruta: [] }));
  const out = [];
  async function recorrer(entrada, ruta) {
    if (entrada.isFile) {
      const file = await new Promise((res, rej) => entrada.file(res, rej));
      out.push({ file, ruta });
      return;
    }
    if (!entrada.isDirectory) return;
    const lector = entrada.createReader();
    const hijos = [];
    for (;;) {
      const lote = await new Promise((res, rej) => lector.readEntries(res, rej));
      if (!lote.length) break;
      hijos.push(...lote);
    }
    const aca = [...ruta, entrada.name];
    if (!hijos.length) out.push({ file: null, ruta: aca });
    for (const h of hijos) await recorrer(h, aca);
  }
  for (const en of entradas) await recorrer(en, []);
  return out;
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
export default function Biblioteca({ general = false }) {
  const { proyectoId, carpetaId: carpetaParam } = useParams();
  const carpetaId = carpetaParam || null;
  const navigate = useNavigate();
  const { empresaData, empleadoData, esEmpleado } = useAuth();
  const alcance = general ? "empresa" : `p:${proyectoId}`;
  const base = general ? "/biblioteca" : `/proyecto/${proyectoId}/biblioteca`;
  const esAdminApp = !esEmpleado || !!empleadoData?.accesoTotal;

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [nombreProyecto, setNombreProyecto] = useState("");
  const [aviso, setAviso] = useState(null); // { texto, tipo: "ok" | "error", code }
  const [modoLista, setModoLista] = useState(() => { try { return localStorage.getItem("mp_bib_vista") === "lista"; } catch (e) { return false; } });
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState(null);
  const [subidas, setSubidas] = useState([]);
  const [menu, setMenu] = useState(null); // { x, y, tipo, item }
  const [modal, setModal] = useState(null); // { tipo, item, clase }
  const [vista, setVista] = useState(null); // vista previa
  const [arrastre, setArrastre] = useState(false);
  const [sobre, setSobre] = useState(null); // carpeta (o "inicio") bajo lo que se arrastra
  const inputArchivos = useRef(null);
  const inputCarpeta = useRef(null);
  const vistaActual = useRef(null);
  const contadorArrastre = useRef(0);

  const irA = useCallback((id) => navigate(id ? `${base}/${id}` : base), [navigate, base]);
  const puedeEditar = datos?.nivel === "editar";
  const admin = !!datos?.admin;

  const mostrarAviso = useCallback((texto, tipo = "ok", code) => setAviso({ texto, tipo, code }), []);
  useEffect(() => {
    if (!aviso || aviso.tipo === "error") return undefined;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const cargar = useCallback(async () => {
    try {
      const r = await bib("listar", { alcance, carpetaId });
      setDatos(r);
      setErrorCarga(null);
    } catch (e) {
      setDatos(null);
      setErrorCarga({ texto: e.message, code: e.code });
    }
    setCargando(false);
  }, [alcance, carpetaId]);

  useEffect(() => { setCargando(true); setBusqueda(""); cargar(); }, [cargar]);

  useEffect(() => {
    if (general || !proyectoId) return;
    getDoc(doc(db, "proyectos", proyectoId)).then(s => { if (s.exists()) setNombreProyecto(s.data().nombre || ""); }).catch(() => {});
  }, [general, proyectoId]);

  // Buscar en toda la biblioteca (espera a que se termine de escribir)
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setResultados(null); return undefined; }
    let vivo = true;
    const t = setTimeout(async () => {
      try { const r = await bib("buscar", { alcance, texto: q }); if (vivo) setResultados(r); }
      catch (e) { if (vivo) setResultados({ carpetas: [], archivos: [], error: e.message }); }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda, alcance]);

  // Si se suelta un archivo fuera de la zona, que el navegador no lo abra.
  useEffect(() => {
    const evitar = (e) => { if (esDeLaCompu(e)) e.preventDefault(); };
    window.addEventListener("dragover", evitar);
    window.addEventListener("drop", evitar);
    return () => { window.removeEventListener("dragover", evitar); window.removeEventListener("drop", evitar); };
  }, []);

  // Menú del botón derecho / ⋯
  useEffect(() => {
    if (!menu) return undefined;
    const cerrar = () => setMenu(null);
    const tecla = (e) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("click", cerrar);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  // ── Subir (archivos sueltos o carpetas enteras) ──
  const marcarSubida = useCallback((key, cambios) => setSubidas(prev => prev.map(s => (s.key === key ? { ...s, ...cambios } : s))), []);
  const subirLista = useCallback(async (lista, destinoId) => {
    if (!lista.length) return;
    const t0 = Date.now();
    const filas = lista.map((x, i) => ({ key: `${t0}_${i}`, nombre: [...x.ruta, x.file ? x.file.name : ""].filter(Boolean).join(" / "), estado: "espera", carpeta: !x.file }));
    setSubidas(prev => [...prev.filter(s => s.estado !== "ok"), ...filas]);
    const rutas = new Map(); // "A/B" → id de la carpeta ya creada
    let ok = 0;
    let cortar = null;
    for (let i = 0; i < lista.length; i++) {
      const { file, ruta } = lista[i];
      const key = filas[i].key;
      if (cortar) { marcarSubida(key, { estado: "error", msg: "No se subió" }); continue; }
      marcarSubida(key, { estado: "subiendo" });
      try {
        let destino = destinoId || null;
        if (ruta.length) {
          const k = ruta.join("/");
          if (!rutas.has(k)) rutas.set(k, (await bib("asegurarRuta", { alcance, ruta, desdeId: destinoId || null })).carpetaId);
          destino = rutas.get(k);
        }
        if (file) await subirABiblioteca(alcance, destino, file);
        marcarSubida(key, { estado: "ok" });
        if (file) ok++;
      } catch (e) {
        marcarSubida(key, { estado: "error", msg: e.message });
        if (e.code === "failed-precondition" || e.code === "permission-denied") cortar = e;
      }
    }
    await cargar();
    if (cortar) mostrarAviso(cortar.message, "error", cortar.code);
    else if (ok) mostrarAviso(ok === 1 ? "✓ Guardado en el Google Drive de la empresa" : `✓ ${ok} archivos guardados en el Google Drive de la empresa`);
  }, [alcance, cargar, marcarSubida, mostrarAviso]);

  // ── Operaciones ──
  const ejecutar = useCallback(async (accion, datosAccion, textoOk) => {
    try {
      const r = await bib(accion, { alcance, ...datosAccion });
      if (textoOk && !r?.sinCambios) mostrarAviso(typeof textoOk === "function" ? textoOk(r) : textoOk);
      await cargar();
      return r;
    } catch (e) {
      mostrarAviso(e.message, "error", e.code);
      return null;
    }
  }, [alcance, cargar, mostrarAviso]);

  const mover = (tipo, id, destinoId) => ejecutar("mover", { tipo, id, destinoId: destinoId || null }, "✓ Movido");

  function eliminar(tipo, item) {
    const que = tipo === "carpeta" ? `la carpeta «${item.nombre}» y todo lo que tiene adentro` : `«${item.nombre}»`;
    if (!window.confirm(`¿Mandar ${que} a la papelera?\n\nSe puede recuperar desde 🗑️ Papelera durante 30 días.`)) return;
    ejecutar("eliminar", { tipo, id: item.id }, "🗑️ Enviado a la papelera");
  }

  async function descargar(archivo) {
    mostrarAviso("⬇️ Preparando la descarga…");
    try { await descargarArchivo(archivo); } catch (e) { mostrarAviso(e.message, "error", e.code); }
  }

  // ── Vista previa ──
  // Lo que ya se trajo (al abrirlo, al pasar el mouse o al armar la miniatura) queda guardado mientras
  // estás en la biblioteca: volver a abrirlo o pasar con las flechas es instantáneo.
  const traidos = useRef(new Map()); // id → Promise<{ blob, url, texto }>
  useEffect(() => {
    const mapa = traidos.current;
    return () => { mapa.forEach(p => p.then(r => r.url && URL.revokeObjectURL(r.url)).catch(() => {})); mapa.clear(); };
  }, []);
  const traer = useCallback((archivo) => {
    const ya = traidos.current.get(archivo.id);
    if (ya) return ya;
    const tv = tipoVista(archivo.mime);
    const p = traerArchivo(archivo.id, "ver").then(async ({ blob }) => ({
      blob,
      texto: tv === "texto" ? (await blob.text()).slice(0, 200000) : null,
      url: tv === "texto" ? null : URL.createObjectURL(blob),
    }));
    p.catch(() => traidos.current.delete(archivo.id)); // si falló, la próxima vez se reintenta
    traidos.current.set(archivo.id, p);
    if (traidos.current.size > 40) { // no guardar más de 40: se sueltan los más viejos
      const [viejo, pv] = traidos.current.entries().next().value;
      traidos.current.delete(viejo);
      pv.then(r => r.url && URL.revokeObjectURL(r.url)).catch(() => {});
    }
    return p;
  }, []);
  const abrirVista = useCallback(async (archivo, lista) => {
    vistaActual.current = archivo.id;
    const tv = tipoVista(archivo.mime);
    const l = lista || [];
    setVista({ archivo, lista: l, tv, cargando: !!tv });
    if (!tv) return;
    try {
      const r = await traer(archivo);
      if (vistaActual.current !== archivo.id) return;
      setVista({ archivo, lista: l, tv, cargando: false, url: r.url, texto: r.texto });
      // Ya se van trayendo el siguiente y el anterior, para pasar con las flechas sin esperar.
      const i = l.findIndex(a => a.id === archivo.id);
      [l[i + 1], l[i - 1]].forEach(x => { if (x && rapidoDeTraer(x.mime)) traer(x).catch(() => {}); });
    } catch (e) {
      if (vistaActual.current === archivo.id) setVista({ archivo, lista: l, tv, cargando: false, error: e.message });
    }
  }, [traer]);
  const cerrarVista = useCallback(() => { vistaActual.current = null; setVista(null); }, []);
  // Al pasar el mouse por una foto o PDF se empieza a traer: cuando hacés clic ya está (o casi).
  const precargaTimer = useRef(null);
  const precargar = (archivo) => {
    clearTimeout(precargaTimer.current);
    if (!rapidoDeTraer(archivo.mime)) return;
    precargaTimer.current = setTimeout(() => { traer(archivo).catch(() => {}); }, 150);
  };

  // ── Miniaturas ──
  // Las que faltan se piden al servidor (las saca del Drive). Las fotos que igual no tengan, las arma
  // la app bajándolas una vez; quedan guardadas para todos y además listas para abrirlas al toque.
  const intentadas = useRef(new Set());
  const carpetaActual = useRef("");
  useEffect(() => { carpetaActual.current = alcance + "|" + (carpetaId || ""); }, [alcance, carpetaId]);
  const archivosCargados = datos ? datos.archivos : null;
  useEffect(() => {
    if (!archivosCargados) return;
    const faltan = archivosCargados.filter(a => !a.miniatura && !intentadas.current.has(a.id) && conMiniatura(a.mime));
    if (!faltan.length) return;
    faltan.forEach(a => intentadas.current.add(a.id));
    const aca = alcance + "|" + (carpetaId || "");
    const poner = (m) => setDatos(d => (d ? { ...d, archivos: d.archivos.map(a => (m[a.id] ? { ...a, miniatura: m[a.id] } : a)) } : d));
    (async () => {
      let delServidor = {};
      const ids = faltan.filter(a => !a.sinMiniatura).map(a => a.id).slice(0, 24);
      if (ids.length) {
        try { delServidor = (await bib("miniaturas", { alcance, ids })).miniaturas || {}; } catch (e) { delServidor = {}; }
        if (Object.keys(delServidor).length) poner(delServidor);
      }
      const fotos = faltan.filter(a => !delServidor[a.id] && /^image\/(jpeg|png|webp|gif|bmp)$/i.test(a.mime || "")).slice(0, 30);
      for (const a of fotos) {
        if (carpetaActual.current !== aca) return; // se fue a otra carpeta
        try {
          const { blob } = await traer(a);
          const m = await hacerMiniatura(blob);
          if (!m) continue;
          poner({ [a.id]: m });
          bib("guardarMiniatura", { alcance, id: a.id, miniatura: m }).catch(() => {});
        } catch (e) { /* queda el ícono */ }
      }
    })();
  }, [archivosCargados, alcance, carpetaId, traer]);

  // Lo que se cambió DIRECTO en el Drive (borrado, mandado a la papelera, renombrado, movido): se revisa
  // al abrir cada carpeta, sin hacer esperar. Si hubo cambios, se vuelve a mostrar la lista.
  const sincronizadas = useRef(new Map()); // carpeta → cuándo se revisó
  useEffect(() => {
    if (!datos) return;
    const aca = alcance + "|" + (carpetaId || "");
    if (Date.now() - (sincronizadas.current.get(aca) || 0) < 30000) return;
    sincronizadas.current.set(aca, Date.now());
    bib("sincronizar", { alcance, carpetaId }).then(r => {
      if (r && r.cambios && carpetaActual.current === aca) {
        cargar();
        mostrarAviso("🔄 Se actualizó con cambios hechos directo en el Drive");
      }
    }).catch(() => { /* sin Drive: se avisa al subir */ });
  }, [datos, alcance, carpetaId, cargar, mostrarAviso]);

  useEffect(() => {
    if (!vista) return undefined;
    const tecla = (e) => {
      if (e.key === "Escape") cerrarVista();
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = vista.lista.findIndex(a => a.id === vista.archivo.id);
      const sig = vista.lista[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (i >= 0 && sig) abrirVista(sig, vista.lista);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [vista, abrirVista, cerrarVista]);

  // ── Arrastrar ──
  function alEmpezarArrastre(e, tipo, item) {
    if (!puedeEditar) { e.preventDefault(); return; }
    e.dataTransfer.setData(TIPO_INTERNO, JSON.stringify({ tipo, id: item.id }));
    e.dataTransfer.effectAllowed = "move";
  }
  // Una carpeta (o "Inicio" / un paso del camino) donde se puede soltar: mueve lo de adentro o sube lo de la compu.
  function destino(destinoId, clave) {
    if (!puedeEditar) return {};
    return {
      onDragOver: (e) => {
        if (!esInterno(e) && !esDeLaCompu(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = esInterno(e) ? "move" : "copy";
        if (sobre !== clave) setSobre(clave);
      },
      onDragLeave: () => setSobre(s => (s === clave ? null : s)),
      onDrop: (e) => {
        if (!esInterno(e) && !esDeLaCompu(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setSobre(null);
        setArrastre(false);
        contadorArrastre.current = 0;
        if (esInterno(e)) {
          let d = null;
          try { d = JSON.parse(e.dataTransfer.getData(TIPO_INTERNO)); } catch (x) { return; }
          if (!d || (d.tipo === "carpeta" && d.id === destinoId)) return;
          mover(d.tipo, d.id, destinoId);
        } else {
          leerSoltado(e.dataTransfer).then(l => subirLista(l, destinoId)).catch(x => mostrarAviso(x.message, "error"));
        }
      },
    };
  }
  const zona = puedeEditar ? {
    onDragEnter: (e) => { if (esDeLaCompu(e)) { contadorArrastre.current++; setArrastre(true); } },
    onDragLeave: (e) => { if (esDeLaCompu(e)) { contadorArrastre.current = Math.max(0, contadorArrastre.current - 1); if (!contadorArrastre.current) setArrastre(false); } },
    onDragOver: (e) => { if (esDeLaCompu(e)) e.preventDefault(); },
    onDrop: (e) => {
      if (!esDeLaCompu(e)) return;
      e.preventDefault();
      setArrastre(false);
      contadorArrastre.current = 0;
      leerSoltado(e.dataTransfer).then(l => subirLista(l, carpetaId)).catch(x => mostrarAviso(x.message, "error"));
    },
  } : {};

  // ── Menú ──
  function abrirMenu(e, tipo, item) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: Math.max(8, Math.min(e.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(e.clientY, window.innerHeight - 300)), tipo, item });
  }
  function opciones(tipo, item, lista) {
    const o = [];
    if (tipo === "carpeta") o.push(["📂", "Abrir", () => irA(item.id)]);
    else {
      o.push(["👁️", tipoVista(item.mime) ? "Vista previa" : "Ver detalles", () => abrirVista(item, lista)]);
      o.push(["⬇️", "Descargar", () => descargar(item)]);
    }
    if (puedeEditar) {
      o.push(["✏️", "Cambiar nombre", () => setModal({ tipo: "renombrar", clase: tipo, item })]);
      o.push(["➡️", "Mover a…", () => setModal({ tipo: "mover", clase: tipo, item })]);
    }
    if (tipo === "carpeta" && admin) o.push(["🔒", "Quién la ve", () => setModal({ tipo: "acceso", clase: tipo, item })]);
    if (puedeEditar) o.push(["🗑️", "Eliminar", () => eliminar(tipo, item), true]);
    return o;
  }

  // ── Pantalla ──
  const titulo = general ? "Biblioteca de la empresa" : "Biblioteca del proyecto";
  const sub = general ? (empresaData?.nombre || empleadoData?.empresaNombre || "") : nombreProyecto;
  const volver = () => navigate(general ? "/proyectos" : `/proyecto/${proyectoId}`);
  const ruta = datos?.ruta || [];
  const buscando = busqueda.trim().length >= 2;
  const carpetas = datos?.carpetas || [];
  const archivos = datos?.archivos || [];

  // Se llama como función (no como <Componente/>) para que las tarjetas no se vuelvan a armar
  // mientras se arrastra algo: si se rearman, el navegador corta el arrastre.
  function tarjeta({ clave, tipo, item, lista, detalle }) {
    const esCarpeta = tipo === "carpeta";
    const abrir = () => (esCarpeta ? irA(item.id) : abrirVista(item, lista));
    const resaltado = esCarpeta && sobre === item.id;
    const comun = {
      draggable: puedeEditar,
      onDragStart: (e) => alEmpezarArrastre(e, tipo, item),
      onClick: abrir,
      onContextMenu: (e) => abrirMenu(e, tipo, item),
      title: item.nombre,
      "data-item": item.nombre,
      ...(esCarpeta ? destino(item.id, item.id) : { onMouseEnter: () => precargar(item), onMouseLeave: () => clearTimeout(precargaTimer.current) }),
    };
    const icono = esCarpeta ? "📁" : iconoArchivo(item.mime, item.nombre);
    const mini = !esCarpeta && item.miniatura ? item.miniatura : null;
    const botonMenu = (
      <button type="button" aria-label="Opciones" style={modoLista ? { ...st.masBtn, position: "static", flexShrink: 0, width: 30 } : mini ? { ...st.masBtn, ...st.masBtnSobreFoto } : st.masBtn} onClick={(e) => abrirMenu(e, tipo, item)}>⋯</button>
    );
    const meta = esCarpeta
      ? (detalle || "Carpeta")
      : [detalle, tamanoLegible(item.tamano), fechaCorta(item.creadoEn)].filter(Boolean).join(" · ");
    if (modoLista) {
      return (
        <div key={clave} {...comun} style={{ ...st.fila, ...(resaltado ? st.resaltado : {}) }}>
          <span style={st.filaIcono}>{mini ? <img src={mini} alt="" draggable={false} style={st.filaMini} /> : icono}</span>
          <span style={st.filaNombre}>{item.nombre}{item.restringida && <span title="Solo la ven algunas personas"> 🔒</span>}</span>
          <span style={st.filaMeta}>{esCarpeta ? (detalle || "Carpeta") : (item.subidoPorNombre || "")}</span>
          <span style={st.filaMeta}>{esCarpeta ? "" : fechaCorta(item.creadoEn)}</span>
          <span style={{ ...st.filaMeta, width: 70, textAlign: "right" }}>{esCarpeta ? "" : tamanoLegible(item.tamano)}</span>
          {botonMenu}
        </div>
      );
    }
    return (
      <div key={clave} {...comun} style={{ ...st.tarjeta, ...(resaltado ? st.resaltado : {}) }}>
        {botonMenu}
        {mini
          ? <div style={st.miniCaja}><img src={mini} alt="" draggable={false} style={st.miniImg} /></div>
          : <div style={st.tarjetaIcono}>{icono}{item.restringida && <span style={st.candado} title="Solo la ven algunas personas">🔒</span>}</div>}
        <div style={st.tarjetaNombre}>{item.nombre}</div>
        <div style={st.tarjetaMeta}>{meta}</div>
      </div>
    );
  }

  const contenedor = modoLista ? st.lista : st.grilla;

  return (
    <div style={st.pagina}>
      <header style={st.header}>
        <div style={st.headerIzq}>
          <button style={st.btnSec} onClick={volver}>← Volver</button>
          <span style={{ fontSize: 26 }}>📚</span>
          <div>
            <h1 style={st.titulo}>{titulo}</h1>
            <p style={st.sub}>{sub}{datos?.nivel === "ver" && <span style={st.soloVer}>👁️ Solo lectura</span>}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Notificaciones />
          <ThemeSelector />
        </div>
      </header>

      <div style={st.barra}>
        <nav style={st.camino} aria-label="Carpetas">
          <button type="button" style={{ ...st.paso, ...(sobre === "inicio" ? st.resaltado : {}) }} onClick={() => irA(null)} {...(carpetaId ? destino(null, "inicio") : {})}>🏠 Inicio</button>
          {ruta.map((r, i) => (
            <span key={r.id} style={{ display: "inline-flex", alignItems: "center" }}>
              <span style={st.separador}>›</span>
              {i === ruta.length - 1
                ? <span style={st.pasoActual}>{r.nombre}</span>
                : <button type="button" style={{ ...st.paso, ...(sobre === "c_" + r.id ? st.resaltado : {}) }} onClick={() => irA(r.id)} {...destino(r.id, "c_" + r.id)}>{r.nombre}</button>}
            </span>
          ))}
        </nav>
        <div style={st.acciones}>
          <div style={st.buscarCaja}>
            <span>🔍</span>
            <input style={st.buscar} placeholder="Buscar en toda la biblioteca" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            {busqueda && <button type="button" style={st.limpiar} onClick={() => setBusqueda("")} aria-label="Borrar búsqueda">✕</button>}
          </div>
          <button type="button" style={st.btnSec} title={modoLista ? "Ver como íconos" : "Ver como lista"}
            onClick={() => { const v = !modoLista; setModoLista(v); try { localStorage.setItem("mp_bib_vista", v ? "lista" : "grilla"); } catch (e) { /* sin guardado */ } }}>
            {modoLista ? "▦ Íconos" : "☰ Lista"}
          </button>
          {puedeEditar && <>
            <button type="button" style={st.btnSec} onClick={() => setModal({ tipo: "nuevaCarpeta" })}>📁 Nueva carpeta</button>
            <button type="button" style={st.btnSec} onClick={() => inputCarpeta.current && inputCarpeta.current.click()}>📂 Subir carpeta</button>
            <button type="button" style={st.btnPri} onClick={() => inputArchivos.current && inputArchivos.current.click()}>⬆️ Subir archivos</button>
            <button type="button" style={st.btnSec} onClick={() => setModal({ tipo: "papelera" })}>🗑️ Papelera</button>
          </>}
        </div>
      </div>

      <input ref={inputArchivos} type="file" multiple style={{ display: "none" }}
        onChange={e => { const l = Array.from(e.target.files || []).map(f => ({ file: f, ruta: [] })); e.target.value = ""; subirLista(l, carpetaId); }} />
      <input ref={(el) => { inputCarpeta.current = el; if (el) el.setAttribute("webkitdirectory", ""); }} type="file" multiple style={{ display: "none" }}
        onChange={e => {
          const l = Array.from(e.target.files || []).map(f => ({ file: f, ruta: String(f.webkitRelativePath || "").split("/").slice(0, -1) }));
          e.target.value = "";
          subirLista(l, carpetaId);
        }} />

      <main style={st.main} {...zona}>
        {arrastre && <div style={st.soltarAca}>Soltá acá para guardar en {ruta.length ? `«${ruta[ruta.length - 1].nombre}»` : "la biblioteca"}</div>}
        {puedeEditar && !buscando && <p style={st.nota}>Todo se guarda en el Google Drive de la empresa · hasta {MAX_MB} MB por archivo · podés arrastrar archivos o carpetas desde la compu, y arrastrar cosas encima de una carpeta para moverlas.</p>}

        {cargando ? <p style={st.nota}>Cargando…</p>
          : errorCarga ? (
            <div style={st.vacio}>
              <div style={{ fontSize: 42 }}>{errorCarga.code === "permission-denied" ? "🔒" : "⚠️"}</div>
              <p>{errorCarga.code === "permission-denied" ? "No tenés acceso. Pedile permiso al dueño de la empresa." : errorCarga.texto}</p>
              {carpetaId ? <button style={st.btnSec} onClick={() => irA(null)}>🏠 Ir al inicio de la biblioteca</button> : <button style={st.btnSec} onClick={volver}>← Volver</button>}
            </div>
          )
          : buscando ? (
            <div>
              {!resultados ? <p style={st.nota}>Buscando…</p>
                : resultados.error ? <p style={st.nota}>{resultados.error}</p>
                : (resultados.carpetas.length + resultados.archivos.length === 0) ? <p style={st.nota}>No se encontró nada con «{busqueda.trim()}».</p>
                : <div style={contenedor}>
                  {resultados.carpetas.map(c => tarjeta({ clave: "c" + c.id, tipo: "carpeta", item: c, detalle: c.ruta ? "En " + c.ruta : "En Inicio" }))}
                  {resultados.archivos.map(a => tarjeta({ clave: "a" + a.id, tipo: "archivo", item: a, lista: resultados.archivos, detalle: a.ruta || "Inicio" }))}
                </div>}
            </div>
          )
          : (carpetas.length + archivos.length === 0) ? (
            <div style={st.vacio}>
              <div style={{ fontSize: 46 }}>📂</div>
              <p>{carpetaId ? "Esta carpeta está vacía." : "Todavía no hay nada acá."}</p>
              {puedeEditar && <p style={st.nota}>Arrastrá archivos o carpetas acá, o tocá ⬆️ Subir archivos.</p>}
            </div>
          )
          : (
            <div style={contenedor}>
              {modoLista && <div style={st.filaTitulos}><span style={st.filaIcono} /><span style={st.filaNombre}>Nombre</span><span style={st.filaMeta}>Subido por</span><span style={st.filaMeta}>Fecha</span><span style={{ ...st.filaMeta, width: 70, textAlign: "right" }}>Tamaño</span><span style={{ width: 30 }} /></div>}
              {carpetas.map(c => tarjeta({ clave: c.id, tipo: "carpeta", item: c }))}
              {archivos.map(a => tarjeta({ clave: a.id, tipo: "archivo", item: a, lista: archivos }))}
            </div>
          )}
      </main>

      {menu && (
        <div style={{ ...st.menu, left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()} role="menu">
          <div style={st.menuTitulo}>{menu.item.nombre}</div>
          {opciones(menu.tipo, menu.item, menu.tipo === "archivo" ? (buscando && resultados ? resultados.archivos : archivos) : null).map(([ic, txt, fn, peligro]) => (
            <button key={txt} type="button" role="menuitem" style={{ ...st.menuOpcion, ...(peligro ? { color: "#dc2626" } : {}) }} onClick={() => { setMenu(null); fn(); }}>
              <span style={{ width: 22, display: "inline-block" }}>{ic}</span>{txt}
            </button>
          ))}
        </div>
      )}

      {subidas.length > 0 && (
        <div style={st.subidas}>
          <div style={st.subidasTitulo}>
            <span>{subidas.some(s => s.estado === "subiendo" || s.estado === "espera") ? `Subiendo… (${subidas.filter(s => s.estado === "ok").length}/${subidas.length})` : "Subidas"}</span>
            {!subidas.some(s => s.estado === "subiendo" || s.estado === "espera") && <button type="button" style={st.limpiar} onClick={() => setSubidas([])} aria-label="Cerrar">✕</button>}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {subidas.map(s => (
              <div key={s.key} style={st.subidaFila}>
                <span>{s.estado === "ok" ? "✅" : s.estado === "error" ? "❌" : s.estado === "subiendo" ? "⏳" : "•"}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={st.subidaNombre}>{s.carpeta ? "📁 " : ""}{s.nombre}</div>
                  {s.msg && <div style={st.subidaError}>{s.msg}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aviso && (
        <div style={{ ...st.aviso, ...(aviso.tipo === "error" ? st.avisoError : {}) }} role="status">
          <span>{aviso.texto}</span>
          {aviso.tipo === "error" && aviso.code === "failed-precondition" && esAdminApp && (
            <button type="button" style={st.btnPri} onClick={() => navigate("/configuracion/drive")}>🔄 Reconectar Drive</button>
          )}
          {aviso.tipo === "error" && <button type="button" style={st.limpiar} onClick={() => setAviso(null)} aria-label="Cerrar">✕</button>}
        </div>
      )}

      {vista && <VistaPrevia vista={vista} onCerrar={cerrarVista} onDescargar={() => descargar(vista.archivo)} onIr={(a) => abrirVista(a, vista.lista)} />}

      {modal?.tipo === "nuevaCarpeta" && (
        <ModalNombre titulo="Nueva carpeta" boton="Crear" inicial="" onCerrar={() => setModal(null)}
          onAceptar={async (nombre) => { const r = await ejecutar("crearCarpeta", { padreId: carpetaId, nombre }, "📁 Carpeta creada"); if (r) setModal(null); }} />
      )}
      {modal?.tipo === "renombrar" && (
        <ModalNombre titulo={modal.clase === "carpeta" ? "Cambiar nombre de la carpeta" : "Cambiar nombre del archivo"} boton="Guardar" inicial={modal.item.nombre}
          sinExtension={modal.clase === "archivo"} onCerrar={() => setModal(null)}
          onAceptar={async (nombre) => {
            if (nombre === modal.item.nombre) { setModal(null); return; }
            const r = await ejecutar("renombrar", { tipo: modal.clase, id: modal.item.id, nombre }, "✓ Nombre cambiado");
            if (r) setModal(null);
          }} />
      )}
      {modal?.tipo === "mover" && (
        <ModalMover alcance={alcance} clase={modal.clase} item={modal.item} onCerrar={() => setModal(null)}
          onMover={async (destinoId) => { const r = await mover(modal.clase, modal.item.id, destinoId); if (r) setModal(null); }} />
      )}
      {modal?.tipo === "acceso" && (
        <ModalAcceso alcance={alcance} carpeta={modal.item} onCerrar={() => setModal(null)}
          onGuardar={async (restringida, personas) => { const r = await ejecutar("acceso", { carpetaId: modal.item.id, restringida, personas }, "🔒 Permisos guardados"); if (r) setModal(null); }} />
      )}
      {modal?.tipo === "papelera" && (
        <ModalPapelera alcance={alcance} onCerrar={() => setModal(null)}
          onRestaurar={(item) => ejecutar("restaurar", { tipo: item.tipo, id: item.id }, (r) => (r.alInicio ? "♻️ Restaurado en el Inicio (su carpeta sigue en la papelera)" : "♻️ Restaurado"))}
          onQuitar={(item) => ejecutar("quitarDeLaLista", { tipo: item.tipo, id: item.id }, "🧹 Quitado de la lista")} />
      )}
    </div>
  );
}

// ── Vista previa (imágenes, PDF, Word/Excel/PowerPoint como PDF, texto, audio y video) ──
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function VistaPrevia({ vista, onCerrar, onDescargar, onIr }) {
  const { archivo, lista, tv, cargando, url, texto, error } = vista;
  const i = lista.findIndex(a => a.id === archivo.id);
  const ant = i > 0 ? lista[i - 1] : null;
  const sig = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
  let cuerpo;
  if (!tv) cuerpo = <div style={st.vistaMensaje}><div style={{ fontSize: 56 }}>{iconoArchivo(archivo.mime, archivo.nombre)}</div><p>Este tipo de archivo no tiene vista previa.</p><button type="button" style={st.btnPri} onClick={onDescargar}>⬇️ Descargar</button></div>;
  else if (cargando && tv === "imagen" && archivo.miniatura) {
    // Mientras llega la foto entera, se muestra la miniatura agrandada (se ve algo al instante).
    cuerpo = <div style={st.vistaEspera}><img src={archivo.miniatura} alt={archivo.nombre} style={{ ...st.vistaImagen, filter: "blur(1.5px)", width: "min(100%, 720px)" }} /><span style={st.vistaCargando}>Cargando…</span></div>;
  }
  else if (cargando) cuerpo = <div style={st.vistaMensaje}><p>{tv === "documento" ? "Preparando la vista previa… (la primera vez puede tardar unos segundos)" : "Cargando…"}</p></div>;
  else if (error) cuerpo = <div style={st.vistaMensaje}><div style={{ fontSize: 42 }}>⚠️</div><p>{error}</p><button type="button" style={st.btnPri} onClick={onDescargar}>⬇️ Probar descargarlo</button></div>;
  else if (tv === "imagen") cuerpo = <img src={url} alt={archivo.nombre} style={st.vistaImagen} />;
  else if (tv === "pdf" || tv === "documento") cuerpo = <iframe src={url} title={archivo.nombre} style={st.vistaMarco} />;
  else if (tv === "texto") cuerpo = <pre style={st.vistaTexto}>{texto}</pre>;
  else if (tv === "audio") cuerpo = <audio src={url} controls style={{ width: "min(520px, 90%)" }} />;
  else if (tv === "video") cuerpo = <video src={url} controls style={st.vistaImagen} />;
  return (
    <div style={st.vistaFondo} onClick={onCerrar}>
      <div style={st.vistaBarra} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 20 }}>{iconoArchivo(archivo.mime, archivo.nombre)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={st.vistaNombre}>{archivo.nombre}</div>
          <div style={st.vistaMeta}>{[tamanoLegible(archivo.tamano), archivo.subidoPorNombre && "subido por " + archivo.subidoPorNombre, fechaCorta(archivo.creadoEn)].filter(Boolean).join(" · ")}</div>
        </div>
        <button type="button" style={st.vistaBtn} onClick={onDescargar}>⬇️ Descargar</button>
        <button type="button" style={st.vistaBtn} onClick={onCerrar} aria-label="Cerrar">✕</button>
      </div>
      <div style={st.vistaCuerpo} onClick={e => e.stopPropagation()}>
        {ant && <button type="button" style={{ ...st.vistaFlecha, left: 8 }} onClick={() => onIr(ant)} aria-label="Anterior">‹</button>}
        {cuerpo}
        {sig && <button type="button" style={{ ...st.vistaFlecha, right: 8 }} onClick={() => onIr(sig)} aria-label="Siguiente">›</button>}
      </div>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function Modal({ titulo, onCerrar, children, ancho = 440 }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <div style={st.modalFondo} onClick={onCerrar}>
      <div style={{ ...st.modal, maxWidth: ancho }} onClick={e => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <h3 style={st.modalTitulo}>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function ModalNombre({ titulo, boton, inicial, sinExtension, onAceptar, onCerrar }) {
  const [nombre, setNombre] = useState(inicial || "");
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Como en la compu: al cambiar el nombre de un archivo queda marcado sin la extensión.
    const punto = sinExtension ? el.value.lastIndexOf(".") : -1;
    el.setSelectionRange(0, punto > 0 ? punto : el.value.length);
  }, [sinExtension]);
  async function aceptar(e) {
    e.preventDefault();
    if (!nombre.trim() || ocupado) return;
    setOcupado(true);
    await onAceptar(nombre.trim());
    setOcupado(false);
  }
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <form onSubmit={aceptar}>
        <input ref={ref} style={st.input} value={nombre} maxLength={150} onChange={e => setNombre(e.target.value)} placeholder="Nombre" />
        <div style={st.modalAcciones}>
          <button type="button" style={st.btnSec} onClick={onCerrar}>Cancelar</button>
          <button type="submit" style={st.btnPri} disabled={!nombre.trim() || ocupado}>{ocupado ? "Guardando…" : boton}</button>
        </div>
      </form>
    </Modal>
  );
}

// "Mover a…": árbol con todas las carpetas que la persona ve.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function ModalMover({ alcance, clase, item, onMover, onCerrar }) {
  const [carpetas, setCarpetas] = useState(null);
  const [error, setError] = useState("");
  const [elegida, setElegida] = useState(undefined); // undefined = nada elegido; null = Inicio
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    bib("arbol", { alcance }).then(r => setCarpetas(r.carpetas)).catch(e => setError(e.message));
  }, [alcance]);
  const actual = clase === "carpeta" ? (item.padreId || null) : (item.carpetaId || null);
  // Una carpeta no puede ir adentro de sí misma ni de sus subcarpetas.
  const prohibidas = new Set();
  if (clase === "carpeta" && carpetas) {
    prohibidas.add(item.id);
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const c of carpetas) if (c.padreId && prohibidas.has(c.padreId) && !prohibidas.has(c.id)) { prohibidas.add(c.id); crecio = true; }
    }
  }
  const hijas = (padreId) => (carpetas || []).filter(c => (c.padreId || null) === padreId).sort(porNombre);
  const filas = [];
  const armar = (padreId, nivel) => {
    for (const c of hijas(padreId)) {
      if (prohibidas.has(c.id)) continue;
      filas.push({ c, nivel });
      armar(c.id, nivel + 1);
    }
  };
  if (carpetas) armar(null, 1);
  const opcion = (id, nombre, nivel, icono) => {
    const esActual = id === actual;
    const sel = elegida === id;
    return (
      <button key={id || "inicio"} type="button" disabled={esActual} onClick={() => setElegida(id)}
        style={{ ...st.arbolFila, paddingLeft: 10 + nivel * 18, ...(sel ? st.arbolSel : {}), ...(esActual ? { opacity: 0.5, cursor: "default" } : {}) }}>
        {icono} {nombre}{esActual && <span style={st.arbolNota}> (está acá)</span>}
      </button>
    );
  };
  return (
    <Modal titulo={`Mover «${item.nombre}» a…`} onCerrar={onCerrar} ancho={480}>
      {error ? <p style={st.subidaError}>{error}</p> : !carpetas ? <p style={st.nota}>Cargando carpetas…</p> : (
        <div style={st.arbol}>
          {opcion(null, "Inicio", 0, "🏠")}
          {filas.map(f => opcion(f.c.id, f.c.nombre, f.nivel, "📁"))}
        </div>
      )}
      <div style={st.modalAcciones}>
        <button type="button" style={st.btnSec} onClick={onCerrar}>Cancelar</button>
        <button type="button" style={st.btnPri} disabled={elegida === undefined || ocupado}
          onClick={async () => { setOcupado(true); await onMover(elegida); setOcupado(false); }}>{ocupado ? "Moviendo…" : "Mover acá"}</button>
      </div>
    </Modal>
  );
}

// Quién ve una carpeta (solo dueño / acceso total). Lo de adentro hereda.
// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function ModalAcceso({ alcance, carpeta, onGuardar, onCerrar }) {
  const [personas, setPersonas] = useState(null);
  const [error, setError] = useState("");
  const [restringida, setRestringida] = useState(!!carpeta.restringida);
  const [sel, setSel] = useState(() => new Set(carpeta.personas || []));
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    bib("personas", { alcance }).then(r => setPersonas(r.personas)).catch(e => setError(e.message));
  }, [alcance]);
  const alternar = (uid) => setSel(prev => { const n = new Set(prev); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  return (
    <Modal titulo={`¿Quién ve «${carpeta.nombre}»?`} onCerrar={onCerrar} ancho={500}>
      <label style={st.opcionAcceso}>
        <input type="radio" checked={!restringida} onChange={() => setRestringida(false)} />
        <div><b>🌐 Todos</b><div style={st.nota}>Todos los que tienen permiso para esta biblioteca.</div></div>
      </label>
      <label style={st.opcionAcceso}>
        <input type="radio" checked={restringida} onChange={() => setRestringida(true)} />
        <div><b>🔒 Solo estas personas</b><div style={st.nota}>Y todo lo que está adentro de la carpeta también.</div></div>
      </label>
      {restringida && (
        <div style={st.personas}>
          {error ? <p style={st.subidaError}>{error}</p> : !personas ? <p style={st.nota}>Cargando…</p>
            : personas.length === 0 ? <p style={st.nota}>Todavía no hay empleados con permiso para esta biblioteca.</p>
            : personas.map(p => (
              <label key={p.uid} style={st.persona}>
                <input type="checkbox" checked={p.accesoTotal || sel.has(p.uid)} disabled={p.accesoTotal} onChange={() => alternar(p.uid)} />
                <span style={{ flex: 1 }}>{p.nombre}</span>
                <span style={st.arbolNota}>{p.accesoTotal ? "acceso total (ve todo)" : p.nivel === "editar" ? "ve y modifica" : "solo ve"}</span>
              </label>
            ))}
        </div>
      )}
      <p style={st.nota}>El dueño de la empresa y los que tienen acceso total ven todo siempre.</p>
      <div style={st.modalAcciones}>
        <button type="button" style={st.btnSec} onClick={onCerrar}>Cancelar</button>
        <button type="button" style={st.btnPri} disabled={ocupado}
          onClick={async () => { setOcupado(true); await onGuardar(restringida, [...sel]); setOcupado(false); }}>{ocupado ? "Guardando…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
function ModalPapelera({ alcance, onRestaurar, onQuitar, onCerrar }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const cargar = useCallback(() => {
    bib("papelera", { alcance }).then(r => setItems(r.items)).catch(e => setError(e.message));
  }, [alcance]);
  useEffect(() => { cargar(); }, [cargar]);
  return (
    <Modal titulo="🗑️ Papelera" onCerrar={onCerrar} ancho={560}>
      <p style={st.nota}>Lo que se elimina queda acá (y en la papelera del Google Drive de la empresa). Google lo borra para siempre a los 30 días. Lo que borrás directo en el Drive también aparece acá.</p>
      {error ? <p style={st.subidaError}>{error}</p> : !items ? <p style={st.nota}>Cargando…</p>
        : items.length === 0 ? <p style={st.nota}>La papelera está vacía.</p>
        : (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {items.map(it => (
              <div key={it.tipo + it.id} style={st.papeleraFila}>
                <span style={{ fontSize: 20 }}>{it.tipo === "carpeta" ? "📁" : iconoArchivo(it.mime, it.nombre)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={st.subidaNombre}>{it.nombre}</div>
                  <div style={st.arbolNota}>
                    {it.fueraDeDrive ? "Ya no está en el Drive: no se puede recuperar"
                      : it.vencido ? "Pasaron más de 30 días: Google ya lo borró"
                      : (it.desdeDrive ? "Eliminado desde el Drive el " : "Eliminado el ") + fechaCorta(it.eliminadoEn)}
                  </div>
                </div>
                {it.fueraDeDrive || it.vencido
                  ? <button type="button" style={st.btnSec} disabled={ocupado === it.id} title="Saca la ficha de MasterPlan (el Drive no se toca)"
                    onClick={async () => { setOcupado(it.id); await onQuitar(it); setOcupado(null); cargar(); }}>{ocupado === it.id ? "…" : "🧹 Quitar de la lista"}</button>
                  : <button type="button" style={st.btnSec} disabled={ocupado === it.id}
                    onClick={async () => { setOcupado(it.id); await onRestaurar(it); setOcupado(null); cargar(); }}>{ocupado === it.id ? "…" : "♻️ Restaurar"}</button>}
              </div>
            ))}
          </div>
        )}
      <div style={st.modalAcciones}>
        <button type="button" style={st.btnSec} onClick={onCerrar}>Cerrar</button>
      </div>
    </Modal>
  );
}

const st = {
  pagina: { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Segoe UI', sans-serif", display: "flex", flexDirection: "column" },
  header: { background: "var(--nav)", color: "var(--text)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  headerIzq: { display: "flex", alignItems: "center", gap: 14, minWidth: 0 },
  titulo: { margin: 0, fontSize: 19, fontWeight: 700 },
  sub: { margin: 0, fontSize: 13, color: "var(--text2)" },
  soloVer: { marginLeft: 10, fontSize: 12, color: "var(--text2)", border: "1px solid var(--border2)", borderRadius: 6, padding: "1px 6px" },
  barra: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "12px 24px", borderBottom: "1.5px solid var(--border)", background: "var(--card)" },
  camino: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, minWidth: 0 },
  paso: { background: "transparent", border: "1.5px solid transparent", color: "var(--text2)", padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 },
  pasoActual: { padding: "5px 8px", fontSize: 14, fontWeight: 700, color: "var(--text)" },
  separador: { color: "var(--text2)", padding: "0 2px" },
  acciones: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  buscarCaja: { display: "flex", alignItems: "center", gap: 6, border: "1.5px solid var(--border)", borderRadius: 8, padding: "4px 8px", background: "var(--bg)" },
  buscar: { border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 13, width: 190, fontFamily: "inherit" },
  limpiar: { background: "transparent", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 14, padding: "2px 4px" },
  btnSec: { background: "transparent", border: "1px solid var(--border2)", color: "var(--text2)", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" },
  btnPri: { background: "var(--acc)", border: "none", color: "#fff", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  main: { flex: 1, padding: "16px 24px 120px", position: "relative", maxWidth: 1200, width: "100%", margin: "0 auto", boxSizing: "border-box" },
  nota: { fontSize: 12.5, color: "var(--text2)", margin: "4px 0 14px", lineHeight: 1.5 },
  soltarAca: { position: "absolute", inset: 8, border: "2.5px dashed var(--acc)", borderRadius: 14, background: "rgba(59,130,246,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "var(--text)", zIndex: 5, pointerEvents: "none" },
  vacio: { textAlign: "center", color: "var(--text2)", padding: "60px 20px", fontSize: 15 },
  grilla: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 12 },
  lista: { display: "flex", flexDirection: "column", border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--card)" },
  tarjeta: { position: "relative", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "18px 10px 12px", textAlign: "center", cursor: "pointer", userSelect: "none", minWidth: 0 },
  tarjetaIcono: { fontSize: 40, lineHeight: 1.1, marginBottom: 8, position: "relative", display: "inline-block" },
  candado: { position: "absolute", right: -10, bottom: -2, fontSize: 15 },
  tarjetaNombre: { fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  tarjetaMeta: { fontSize: 11, color: "var(--text2)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  masBtn: { position: "absolute", top: 4, right: 4, background: "transparent", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 6 },
  resaltado: { boxShadow: "inset 0 0 0 2px var(--acc)", background: "rgba(59,130,246,0.12)" },
  fila: { position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer", userSelect: "none" },
  filaTitulos: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1.5px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.4, background: "var(--nav)" },
  filaIcono: { width: 26, fontSize: 20, textAlign: "center", flexShrink: 0 },
  vistaEspera: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
  vistaCargando: { position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", color: "#fff", padding: "4px 12px", borderRadius: 20, fontSize: 13 },
  masBtnSobreFoto: { background: "rgba(0,0,0,0.5)", color: "#fff", zIndex: 1, top: 6, right: 6 },
  filaMini: { width: 26, height: 26, objectFit: "cover", borderRadius: 4, verticalAlign: "middle", display: "inline-block" },
  miniCaja: { height: 96, margin: "-6px 0 8px", borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" },
  miniImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
  filaNombre: { flex: 1, minWidth: 0, fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  filaMeta: { width: 130, fontSize: 12, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 },
  menu: { position: "fixed", zIndex: 50, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", padding: 6, minWidth: 210 },
  menuTitulo: { fontSize: 11, color: "var(--text2)", padding: "4px 10px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220, borderBottom: "1px solid var(--border)", marginBottom: 4 },
  menuOpcion: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "var(--text)", padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13.5 },
  subidas: { position: "fixed", right: 16, bottom: 16, width: "min(340px, calc(100vw - 32px))", background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", zIndex: 40, overflow: "hidden" },
  subidasTitulo: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)", background: "var(--nav)" },
  subidaFila: { display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 },
  subidaNombre: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" },
  subidaError: { color: "#dc2626", fontSize: 12, marginTop: 2 },
  aviso: { position: "fixed", left: "50%", top: 14, transform: "translateX(-50%)", background: "var(--card)", color: "var(--text)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", zIndex: 60, display: "flex", gap: 10, alignItems: "center", maxWidth: "min(620px, calc(100vw - 32px))", fontSize: 14 },
  avisoError: { borderColor: "#fca5a5" },
  vistaFondo: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", flexDirection: "column" },
  vistaBarra: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", color: "#fff", background: "rgba(0,0,0,0.4)" },
  vistaNombre: { fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  vistaMeta: { fontSize: 12, opacity: 0.75 },
  vistaBtn: { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" },
  vistaCuerpo: { flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 56px", minHeight: 0 },
  vistaMensaje: { color: "#fff", textAlign: "center", fontSize: 15, maxWidth: 460 },
  vistaImagen: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6, background: "#fff" },
  vistaMarco: { width: "100%", height: "100%", border: "none", borderRadius: 6, background: "#fff" },
  vistaTexto: { width: "100%", height: "100%", overflow: "auto", margin: 0, background: "#fff", color: "#111", padding: 16, borderRadius: 6, fontSize: 13, whiteSpace: "pre-wrap", boxSizing: "border-box" },
  vistaFlecha: { position: "absolute", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 34, width: 42, height: 64, borderRadius: 8, cursor: "pointer" },
  modalFondo: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 },
  modal: { background: "var(--card)", color: "var(--text)", border: "1.5px solid var(--border)", borderRadius: 14, padding: 22, width: "100%", maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box" },
  modalTitulo: { margin: "0 0 14px", fontSize: 17, fontWeight: 700, wordBreak: "break-word" },
  modalAcciones: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" },
  arbol: { border: "1.5px solid var(--border)", borderRadius: 10, maxHeight: 340, overflowY: "auto", padding: 4 },
  arbolFila: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "1.5px solid transparent", color: "var(--text)", padding: "7px 10px", borderRadius: 7, cursor: "pointer", fontSize: 14 },
  arbolSel: { boxShadow: "inset 0 0 0 2px var(--acc)", background: "rgba(59,130,246,0.12)" },
  arbolNota: { fontSize: 12, color: "var(--text2)" },
  opcionAcceso: { display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1.5px solid var(--border)", borderRadius: 10, marginBottom: 8, cursor: "pointer" },
  personas: { border: "1.5px solid var(--border)", borderRadius: 10, padding: 6, maxHeight: 240, overflowY: "auto", marginBottom: 8 },
  persona: { display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", fontSize: 14, cursor: "pointer" },
  papeleraFila: { display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: "1px solid var(--border)" },
};

// 6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse
Biblioteca.__a = "6202 led ozram edsed aírutua atelpmoc us ed se ,socram ossab rop odaerc euf aedi/ogidoc/amargorp etse";
