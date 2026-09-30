# CLAUDE.md — MasterPlan (BassoMarcos/masterplan-management)

> Contexto maestro del proyecto para Claude. Leer esto ENTERO al iniciar cualquier sesión, junto con `mapa-data.json` / `mapa.html` (fuente de verdad arquitectónica) y `REGLAS.md`.

## Qué es

- Plataforma **SaaS multi-tenant** para empresas inmobiliarias.
- Stack: **React + Firebase (Firestore)**, deploy vía **GitHub Actions → Firebase Hosting** (`masterplanproyects.web.app`, project `masterplanmanagement-01`).
- Cuatro pilares: **Administración, Comercial, Legales, Desarrollos y Obras**.
- **Autor: Marcos Basso.** Creó **ambas** apps (la App de Administración —repo `fj-app`, antes "FJ App"— y MasterPlan) desde cero junto con Claude. El código lleva sus marcas de autoría: no borrarlas. Sin formación técnica: depende de Claude para todo el código. Español rioplatense, directo y analítico.

## Arco estratégico

- La App de Administración (repo `BassoMarcos/fj-app`) migrará módulo por módulo al pilar **Administración** de MasterPlan. Primero se terminan sus features, después se integra.
- Una venta en **Comercial** debe fluir automáticamente por **Legales** para activar un cliente en **Administración**.
- Mapa neuronal interactivo (`mapa.html` + `mapa-data.json`, fuente única de verdad en este repo) conecta ambos sistemas. **En MasterPlan es SOLO del SuperAdmin** (2026-09-28): SuperAdmin → 🧠 → `/superadmin/mapa`. Ya no se publica `/mapa.html` (lo veían todas las empresas); `scripts/generar-mapa.js` lo mete en la app con los datos adentro (corre solo antes de build/start/test; para el build estricto local: `node scripts/generar-mapa.js` primero). fyj tiene su propia copia en su repo.

## Gate de build (CRÍTICO)

- **ESLint es el verdadero gate de build**: `CI=true npx react-scripts build` captura `no-unused-vars` y `no-mixed-operators` que la validación de Babel deja pasar.
- **Siempre buildear localmente en `/tmp/mpbuild` antes de subir.** (Si se perdió el mount: `ls mpbuild/*/src/pages/` para remontar.)
- Flujo: editar local → copiar a `/tmp/mpbuild` → `CI=true npx react-scripts build` → verificar sin errores → subir → GitHub Actions deploya a Firebase Hosting.
- `mapa-data.json` se actualiza en el mismo lote que cambios estructurales de código.

## Estado actual — Pilar Comercial

- Estructura de hub con agrupación "Estrategia de Ventas" (Carga de Datos, Filtrado, Ventas).
- Recorrido completo de 8 etapas de contacto (Contacto→Filtro→Llamado→Visita→Compra→Reserva→Firma Programada→Firma/Venta), con etapas extra configurables en `comercial_config.recorridoExtra`, barra de progreso horizontal, modales por etapa, resultados con código de color.
- Sistema completo de formularios de reserva (el admin lo diseña una vez, el vendedor lo completa); CSS de impresión A4.
- Carga masiva con pegado de columnas de Excel y mapeo datero→empleado.
- Sistema de notificaciones (colecciones Firestore `notificaciones` + `notif_leidas`); `REGLAS.md` establece que **cada cambio de código debe registrar una notificación**.
- Separación de login: **Personal** = solo empleados; **Empresas** = solo dueños (chequeo de email pre-auth vía colección `emails_empresa`).
- Empleados con `accesoTotal` funcionan igual que el dueño de la empresa.
- Helper `etiquetaEtapa()` en `appConfig.js` unifica el display de estado.
- Asignación inteligente en Carga de Datos: destinatarios con acceso a Ventas → `vendedorUid`; si no → `filtradorUid`.
- Visitas/reservas/firmas vencidas disparan ⚠️ con opciones Reprogramar/Avanzar.
- Config por empresa: `areasVisibles(empresaData)` filtra áreas según `config.areasOcultas` en el doc `empresas/{uid}`.
- Pizarra colaborativa flotante (`PizarraFlotante`) con sync Firestore en tiempo real, aislada por pantalla.
- Sistema de 10 temas de color con preferencias por usuario en Firestore (colección `preferencias`).

## Estado actual — Pilar Administración

- Se rehace desde cero (por defecto para todas las empresas) en 3 secciones que comparten los mismos datos: **Gerencia** (rango más alto, ve en vivo lo que hacen las otras dos; se desarrolla más adelante con el gerente), **Administración** (todo lo que hoy hace el admin de fj-app) y **Cobranzas** (todo lo que hoy hace el colaborador de fj-app).
- Hoy existen las pantallas de entrada (`AdministracionHub.js`) y una portada "en construcción" por sección (`AdministracionPanel.js`, con la lista de lo que va a tener). Los paneles y sus permisos (ninguno/ver/editar) se definen en `AREAS_DEFAULT` de `appConfig.js`.
- Decisión (sep-2026): NO se migran datos de fyj; se arma la base administrativa **para cualquier empresa**, con las reglas de F&J como opciones configurables. Hecho: panel **Configuración** (`AdministracionConfig.js`: financiación por moneda (ARS/USD: si aumenta, cómo, cada cuántos meses, grupos automáticos = N; cuotas y grupo del cliente van en el contrato al firmar), mora por último día de pago, recargo de transferencias, dueños con %, cajas separadas: ahí se elige qué lotes van a cada caja; y desde 2026-09-26 también avisos de mora por WhatsApp, adelantos, permisos de cobro, diferencias, recibos, cierre del mes, casos especiales y certificados en `AdministracionConfigCobros.js`; piezas visuales compartidas en `components/configUI.js`), reglas en `src/config/adminConfigLogica.js`.
- **Asistentes** (`AsistenteProyecto.js`, 2 modos): del proyecto (`/proyecto/:id/configurar`, al crear: áreas/paneles → `estructura`, lotes, datos del proyecto) y de Administración (`/proyecto/:id/administracion/configurar`, la primera vez que se entra al área: financiación, mora, transferencias, dueños, cajas → `adminConfig`). La bienvenida pregunta todo de una (incluido Administración si el proyecto la usa); el asistente de Administración es de respaldo si el área se activa después sin configurar. Todas las pantallas filtran áreas/paneles con `areasDelProyecto` / `panelesDelProyecto` de `appConfig.js`.
- **⚙️ Configuración** (2026-09-27, `Configuracion.js`): el ÚNICO lugar para configurar. 3 modos con las mismas piezas: central del proyecto (lista de grupos a la izquierda + pestañas arriba), de un área (el ⚙️ del encabezado de cada área, solo esa área) y de la empresa (`/configuracion`: cuenta, código, Drive, empleados). Qué hay en cada grupo y quién lo ve: `config/configuracionGrupos.js`; toda opción nueva de un área se suma ahí. El asistente (`AsistenteProyecto.js`) queda para crear el proyecto y para "Repasar todo".
- **Lotes** (2026-09-26): lista única en `proyectos/{id}/lotes`; se cargan en **Desarrollos → Manzanas y lotes** (`DesarrollosLotes.js` + `components/EditorLotes.js`) o en el asistente del proyecto. Administración solo elige la caja de cada lote. `diffLotes` guarda solo los campos cambiados para que las áreas no se pisen. Qué configura cada área: `ESQUEMA_ADMIN_FYJ.md` §13 (fuera del repo).
- Mientras fj-app siga en uso, lo nuevo se construye acá y en fj-app solo se hacen arreglos críticos y de seguridad.

## Biblioteca de documentos (2026-09-29)

- Dos bibliotecas con la misma pantalla (`pages/Biblioteca.js`): la **general de la empresa** (📚 en Mis Proyectos, `/biblioteca/:carpetaId?`) y la **de cada proyecto** (tarjeta 📚 en la pantalla del proyecto, para TODAS las áreas; `/proyecto/:id/biblioteca/:carpetaId?`; desde 2026-09-29 ya no está en Legales y el link viejo redirige).
- **Los archivos están SIEMPRE en el Google Drive de cada empresa** (`MasterPlan/Biblioteca de la empresa` y `MasterPlan/Biblioteca - <proyecto>`). MasterPlan guarda solo la lista y los permisos (`biblioteca_carpetas`, `biblioteca_archivos`, `biblioteca_raices`), que maneja SOLO el servidor: las reglas no dejan leerlas ni escribirlas desde la app.
- Servidor: `functions/biblioteca/` → función `biblioteca` (listar, crearCarpeta, subir, renombrar, mover, eliminar, restaurar, papelera, arbol, buscar, acceso, personas, asegurarRuta) y `bibArchivo` (ver/bajar con el token de la sesión; Word/Excel/PowerPoint se muestran como PDF con una copia en "Vistas previas (no tocar)"). Los archivos ya NO son públicos por link.
- Permisos: dueño y acceso total = todo. Empleados: general → `permisos.bibliotecaGeneral` (Empleados → 📚); proyecto → `permisos.proyectos[<id>]._biblioteca` (Empleados → cada proyecto → 📚; si nunca se guardó, vale el viejo Legales → "documentacion"; `nivelBibliotecaProyecto` en appConfig y lo mismo en `functions/biblioteca/permisos.js`). Cada carpeta puede ser "solo estas personas" (lo de adentro hereda).
- **Todo lo que otra parte de MasterPlan suba tiene que ir por `guardarEnBiblioteca` (`utils/biblioteca.js`)**, así aparece siempre en la Biblioteca. `subirArchivo` de `utils/drive.js` es viejo (no aparece en la Biblioteca).
- Miniaturas (2026-09-29): se guardan en la lista (`miniatura`, imagen chica como texto). Las fotos la traen al subirlas (`hacerMiniatura`); lo viejo, PDF y documentos se la piden a Drive (`miniaturas`); si Drive no la da, la app la arma bajando la foto una vez (`guardarMiniatura`). La pantalla guarda lo ya abierto y trae las fotos al pasar el mouse (y la siguiente/anterior en la vista previa). El servidor usa `@googleapis/drive` (no `googleapis`: tardaba 5 veces más en arrancar) y deja abierta la conexión con el Drive entre pedidos.
- Cambios hechos DIRECTO en el Drive (2026-09-29): al abrir cada carpeta la app llama `sincronizar` (sin hacer esperar): lo que está en la papelera del Drive pasa a la papelera de MasterPlan (restaurable); lo que ya no existe o sacaron de la biblioteca queda "ya no está en el Drive" (`fueraDeDrive`, se borra su miniatura; en la papelera se puede "Quitar de la lista" = `quitarDeLaLista`, borra solo la ficha); renombrado/movido se actualiza. Con `drive.file` la app NO ve archivos que la gente agregue a mano en esas carpetas del Drive (para eso: "Agregar desde Drive", pendiente).
- Límite: 7 MB por archivo subiendo desde la app. Papelera: Google la vacía a los 30 días. Pendiente: "Agregar desde Drive" (Google Picker) para traer archivos que ya estaban en el Drive.

## Reglas de Firestore

- La colección **`emails_empresa`** requiere `allow read: if true` para el chequeo de email pre-auth.
- **Fuente de verdad de las reglas: `firestore.rules` en este repo.** Se publican SOLAS: al cambiar en main, `.github/workflows/deploy-reglas.yml` corre las pruebas del emulador (`pruebas/reglas/test.mjs`) y, si pasan, hace `firebase deploy --only firestore:rules` con la cuenta de servicio `FIREBASE_SERVICE_ACCOUNT_DEPLOY`. **No editar las reglas a mano en la consola** (se pisarían con el próximo deploy). Al cambiarlas: editar el archivo, agregar casos a las pruebas, probar localmente con el emulador.
- Empleados (2026-09-29): cada uno crea SOLO su solicitud (pendiente, sin permisos); no puede cambiarse empresa/estado/permisos/acceso total; la empresa no puede pasar un empleado a otra empresa. (Antes cualquiera podía crearse "aprobado" con acceso total en cualquier empresa.)
- Regla general (2026-09-25): `match /proyectos/{proyectoId}/{coleccion}/{resto=**}` → pueden usar TODO lo de adentro de un proyecto el dueño de la empresa, sus empleados aprobados y el SuperAdmin. Cubre lotes, Desarrollos y lo que venga (clientes, contratos, cobros…): no hace falta tocar reglas al agregar colecciones dentro de un proyecto.

## EmailJS (email de bienvenida al aprobar cuenta)

- service `service_hitlzvt`, template `template_nmympyf`, public key `WjAT2u4juvwDfPndb`.

## Patrón de archivos grandes vía API (referencia)

- Archivos >1MB en este repo, si se usa la API de Contents, deben ir por el endpoint de Git Data blobs (`/git/blobs/{sha}`), no por la Contents API (que trunca). Traer SHA fresco antes de cada PUT. (En Claude Code, con `git` normal, esto deja de ser necesario.)

## En el horizonte

- Resolver los 12 lotes de Etapa 4 mal asignados a Azul (deberían ser Rosa; `calcTrimestrePorCuota` asigna mal el trimestre al cargar).
- Construir los pilares **Legales** y **Desarrollos y Obras** (todavía no existen).
- Pilar **Administración** intencionalmente vacío — espera la migración de la App de Administración.
- **Almacenamiento de archivos**: los archivos van al Google Drive DE CADA EMPRESA (carpeta "MasterPlan" en su cuenta), así cada una paga su espacio y conserva sus archivos. Ver "Biblioteca de documentos".
- **Plano de lotes para Comercial**: subir la imagen del plano del loteo, el admin marca cada lote, el vendedor elige el lote clickeándolo al completar la reserva, y el lote queda como reservado/vendido.

## Cómo trabaja Marcos

- Respuestas concisas; código completo listo para copiar y pegar.
- Preview antes de cambios sensibles a datos.
- Verifica contra planillas físicas (fuente de verdad).
- Retoma donde quedó, sin re-explicar contexto.

## Nota sobre acceso a GitHub (contexto de migración, sep-2026)

- Este repo se migra a **Claude Code** (claude.ai/code) porque las sesiones tipo Cowork/nube quedaron con un proxy de git que bloquea `push`. En Claude Code, con el repo agregado como fuente, el push/deploy funciona normal.
- **Nunca** poner tokens de GitHub en archivos del repo (el secret scanning bloquea el push).
