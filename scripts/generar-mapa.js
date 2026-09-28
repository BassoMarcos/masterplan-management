// Arma src/generado/mapaArquitectura.js a partir de mapa.html + mapa-data.json (raíz del repo).
// El mapa de arquitectura es solo para el SuperAdmin: ya NO se publica como archivo suelto
// (/mapa.html lo podía abrir cualquier empresa). Va dentro de la app, en /superadmin/mapa,
// con los datos incluidos (no los baja de GitHub).
// Corre solo antes de build / start / test (package.json: prebuild, prestart, pretest).
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "mapa.html"), "utf8");
const datos = JSON.parse(fs.readFileSync(path.join(raiz, "mapa-data.json"), "utf8"));

const CARGA = "fetch(DATA_URL+'?t='+Date.now())";
if (!html.includes(CARGA)) throw new Error("mapa.html cambió: no encuentro dónde carga mapa-data.json");
// "<" escapado para que ningún texto de los datos pueda cerrar el <script> del mapa.
const json = JSON.stringify(datos).replace(/</g, "\\u003c");
const htmlConDatos = html.replace(CARGA, `Promise.resolve({ok:true,json:function(){return ${json};}})`);

const salida = path.join(raiz, "src", "generado");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(
  path.join(salida, "mapaArquitectura.js"),
  "// ARCHIVO GENERADO por scripts/generar-mapa.js — no editar a mano (se edita mapa.html / mapa-data.json).\n" +
  `export const MAPA_HTML = ${JSON.stringify(htmlConDatos)};\n`
);
console.log("mapa de arquitectura generado");
