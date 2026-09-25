# CLAUDE.md — MasterPlan (BassoMarcos/masterplan-management)

> Contexto maestro del proyecto para Claude. Leer esto ENTERO al iniciar cualquier sesión, junto con `mapa-data.json` / `mapa.html` (fuente de verdad arquitectónica) y `REGLAS.md`.

## Qué es

- Plataforma **SaaS multi-tenant** para empresas inmobiliarias.
- Stack: **React + Firebase (Firestore)**, deploy vía **GitHub Actions → Firebase Hosting** (`masterplanproyects.web.app`, project `masterplanmanagement-01`).
- Cuatro pilares: **Administración, Comercial, Legales, Desarrollos y Obras**.
- Marcos es **empleado administrativo** de F&J Desarrollos (no el dueño). Creó **ambas** apps (fj-app y masterplan) desde cero junto con Claude. Sin formación técnica: depende de Claude para todo el código. Español rioplatense, directo y analítico.

## Arco estratégico

- FJ App (repo `BassoMarcos/fj-app`) migrará módulo por módulo al pilar **Administración** de MasterPlan. Primero se terminan las features de FJ App, después se integra.
- Una venta en **Comercial** debe fluir automáticamente por **Legales** para activar un cliente en **Administración**.
- Mapa neuronal interactivo (`mapa.html` + `mapa-data.json`, fuente única de verdad en este repo) conecta ambos sistemas; accesible desde ambas apps con el botón 🧠.

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
- Decisión (sep-2026): NO se migran datos de fyj; se arma la base administrativa **para cualquier empresa**, con las reglas de F&J como opciones configurables. Hecho: panel **Configuración** (`AdministracionConfig.js`: financiación por moneda (ARS/USD: si aumenta, cómo, cada cuántos meses, grupos automáticos = N; cuotas y grupo del cliente van en el contrato al firmar), mora por último día de pago, recargo de transferencias, dueños con %, cajas separadas, **lotes** en `proyectos/{id}/lotes`), reglas en `src/config/adminConfigLogica.js`.
- **Asistente de proyecto nuevo** (`AsistenteProyecto.js`, `/proyecto/:id/configurar`): se abre al crear un proyecto; define áreas/paneles del proyecto (`proyectos/{id}.estructura`) y toda la configuración. Todas las pantallas filtran áreas/paneles con `areasDelProyecto` / `panelesDelProyecto` de `appConfig.js`.
- Mientras fj-app siga en uso, lo nuevo se construye acá y en fj-app solo se hacen arreglos críticos y de seguridad.

## Reglas de Firestore

- La colección **`emails_empresa`** requiere `allow read: if true` para el chequeo de email pre-auth.
- Las reglas de Firebase se entregan como rulesets completos para pegar en la consola.
- **Fuente de verdad de las reglas: `firestore.rules` en este repo.** Se publican SOLAS: al cambiar en main, `.github/workflows/deploy-reglas.yml` corre las pruebas del emulador (`pruebas/reglas/test.mjs`) y, si pasan, hace `firebase deploy --only firestore:rules` con la cuenta de servicio `FIREBASE_SERVICE_ACCOUNT_DEPLOY`. **No editar las reglas a mano en la consola** (se pisarían con el próximo deploy). Al cambiarlas: editar el archivo, agregar casos a las pruebas, probar localmente con el emulador.
- Regla general (2026-09-25): `match /proyectos/{proyectoId}/{coleccion}/{resto=**}` → pueden usar TODO lo de adentro de un proyecto el dueño de la empresa, sus empleados aprobados y el SuperAdmin. Cubre lotes, Desarrollos y lo que venga (clientes, contratos, cobros…): no hace falta tocar reglas al agregar colecciones dentro de un proyecto.

## EmailJS (email de bienvenida al aprobar cuenta)

- service `service_hitlzvt`, template `template_nmympyf`, public key `WjAT2u4juvwDfPndb`.

## Patrón de archivos grandes vía API (referencia)

- Archivos >1MB en este repo, si se usa la API de Contents, deben ir por el endpoint de Git Data blobs (`/git/blobs/{sha}`), no por la Contents API (que trunca). Traer SHA fresco antes de cada PUT. (En Claude Code, con `git` normal, esto deja de ser necesario.)

## En el horizonte

- Resolver los 12 lotes de Etapa 4 mal asignados a Azul (deberían ser Rosa; `calcTrimestrePorCuota` asigna mal el trimestre al cargar).
- Construir los pilares **Legales** y **Desarrollos y Obras** (todavía no existen).
- Pilar **Administración** intencionalmente vacío — espera la migración de FJ App.
- **Almacenamiento de archivos**: decidido integrar la cuenta de Google Drive de cada empresa directamente (en vez de Cloudinary o Firebase Storage), para que cada empresa pague su propio storage y conserve sus archivos. Se acepta el mayor tiempo de desarrollo. Setup arranca desde Google Cloud Console.
- **Plano de lotes para Comercial**: subir la imagen del plano del loteo, el admin marca cada lote, el vendedor elige el lote clickeándolo al completar la reserva, y el lote queda como reservado/vendido.

## Cómo trabaja Marcos

- Respuestas concisas; código completo listo para copiar y pegar.
- Preview antes de cambios sensibles a datos.
- Verifica contra planillas físicas (fuente de verdad).
- Retoma donde quedó, sin re-explicar contexto.

## Nota sobre acceso a GitHub (contexto de migración, sep-2026)

- Este repo se migra a **Claude Code** (claude.ai/code) porque las sesiones tipo Cowork/nube quedaron con un proxy de git que bloquea `push`. En Claude Code, con el repo agregado como fuente, el push/deploy funciona normal.
- **Nunca** poner tokens de GitHub en archivos del repo (el secret scanning bloquea el push).
