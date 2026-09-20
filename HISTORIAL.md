# HISTORIAL.md — Bitácora del proyecto (FJ App + MasterPlan)

> Log cronológico de lo trabajado con Claude, reconstruido de los resúmenes de cada chat.
> Sirve para que cualquier sesión nueva entienda el recorrido completo, las decisiones y por qué las cosas son como son.
> **No contiene tokens ni contraseñas** (esos van en la memoria de Claude, nunca en el repo).

---

## 2026-05-31 — FJ App (v1.02xx)
- Reconstrucción completa del formulario "Nuevo Cliente": secciones Titular / Lote(s) / contrato por lote.
- Modos de contrato por lote: **Normal**, **Pendiente**, **Escalonado** (el ICC aplica solo a la cuota base; USD no lleva ICC ni trimestre).
- Cargado el inventario de lotes vacíos de E4; `getLotesDisponibles` filtra ocupados dinámicamente (borrar cliente libera el lote).

## 2026-06-06 — FJ App (v1.0293, ~20% completa)
- Visión de 4 pilares definida (Administración, Comercial, Legales, Desarrollos y Obras).
- Sistema de cliente "pausado" (primera cuota futura excluida de totales/mora hasta su mes).
- Modal resumen pre-cierre; snapshot/revert del último cierre; gráficos y reporte de morosidad.
- Sistema de aprobación pendiente (cobros del colaborador pasan por aprobación del admin); toasts.
- ICC vía `apis.datos.gob.ar`; export/import en pestaña Datos; deploy directo por GitHub Pages.

## 2026-06-07 — FJ App (v1.0289 → v1.0309)
- Arreglos de sync a Google Sheets (mora/extras/balances); coerción de tipos (lote como número rompía `.match()`).
- ICC corrompido por Sheets (fechas ISO) → solución prefijo `STR:` en `mes`/`mesKey`.
- Integración de **Firebase Realtime Database** para sync en tiempo real (`_fbSet`/`_fbGet`/`_fbListen`).
- Dolor recurrente: caché agresivo de GitHub Pages.

## 2026-06-09 — Decisión estratégica
- ~305 clientes en RTDB. Visión SaaS multi-tenant: una venta en Comercial fluye por Legales y activa el cliente en Administración.
- **Se decide construir MasterPlan desde cero** en un chat aparte, e integrar FJ App después.
- Pendientes: migración a Firebase Hosting (caché), login persistente, dominio propio.

## 2026-06-10 — MasterPlan (arranque)
- Creado proyecto Firebase **masterplanproyects** (`masterplanproyects.web.app`).
- Estructura React: AuthPage (doble verificación + verificación de email), Proyectos, ProyectoPilares, SuperAdmin.
- Flujo de aprobación (registros quedan "pending" hasta que el superadmin aprueba); **EmailJS** para el mail de bienvenida.
- Deploy por GitHub Actions → Firebase Hosting; primeras peleas con ESLint. Se evaluó Cloudinary para archivos.

## 2026-06-14 — FJ App (modo oscuro + temas)
- Overhaul a **modo oscuro** (base gris + acentos de color).
- Selector de **10 temas** (🎨); control de % de distribución (reemplaza 70/30 fijo); fusión de cierres; toggle global de mora.

## 2026-06-15 — FJ App
- Fix selección de lotes en Etapa 2/3 (`c.lote` numérico → envolver en `String()` en 5 funciones).
- Confirmación + clave admin en "Marcar/Desmarcar todos".
- Creado **`MAPA.md`** (referencia de arquitectura para onboarding de sesiones futuras).
- Corrección lógica de agrimensores en el cierre: **sí** avanzan cuotas y generan mora; lo único distinto es el ruteo del dinero (base → caja agrimensores, interés → ingresos extras).

## 2026-07-03 — Mantenimiento de infraestructura
- Reglas de Firebase RTDB de fj-app estaban por expirar → reemplazadas por reglas abiertas (`.read/.write: true`).
- Renovación de tokens de GitHub (sin expiración). Se decide no meter Firebase Auth en FJ App (migrará a MasterPlan igual).

## 2026-07-04 — FJ App (cierre + agrimensores + ICC)
- Gestión de lotes vacíos para E1/E2/E3 (antes solo E4).
- Pestaña **Lotes Finalizados** con seguimiento de certificados (solicitado/recibido/entregado).
- Auto-finalización al pagar última cuota; préstamos reciben ICC.
- **Concepto de "mes operativo"** para todo el flujo de ICC (Lista 1 `iccMensual` con % mensuales; dos locks: cierre final del mes operativo + 3 meses consecutivos).
- **Robot ICC**: GitHub Actions + Playwright (espera 15s por el SPA de INDEC), corre a diario, guarda en `icc-data.json`.
- Mora corregida al día-10 del mes operativo.

## 2026-07-21 — FJ App (v1.0353)
- Formulario de pago con **entregó/vuelto** y cálculo en vivo de SAF/SEC.
- Sistema de transferencias (desglose 21%, parcial/total, Caja de Transferencias) + **Caja Física**.
- Escalonado; rediseño de Estadísticas; protecciones de fusión de cierres.
- Bugs: ICC aplicado a USD (restaurados 17 lotes); cierre final registraba mes calendario en vez de operativo; mora off-by-one → **día 11 = 1 día = 2%**.

## 2026-07-29 — FJ App (v1.0432 → v1.0439)
- Corrección masiva de precios: 184 lotes habían vuelto a valores de abril (incidente de datos) → reparados con planilla física + historial.
- **Bug crítico `loadData()`**: reconstruía el cliente campo por campo y perdía campos nuevos (`empresaPaga`, `saldoDifUltimoCobro`). Regla: todo campo nuevo va en **ambas** normalizaciones (~línea 1209 y el `full.map` ~línea 1274).
- Sistema de backups validados (3 botones: inicial del mes / pre-cierre final / extra; rota últimos 12; doble clave).
- Modo consulta (ver/editar sin cobrar/ICC/cierre); categoría **`empresaPaga`** (Retamozo ETAPA 3-53); edición SAF/SEC + reversión de vuelto en desmarcar.

## 2026-07-30 — MasterPlan
- Portado el sistema de 10 temas a MasterPlan (ThemeContext, colección `preferencias`).
- **Pizarra colaborativa** (`PizarraFlotante`) con sync Firestore en tiempo real, aislada por pantalla.
- Abiertos los 4 pilares (AreaSecciones); Administración vacío a propósito (espera FJ App).
- **Config por empresa**: `src/config/appConfig.js` con `areasVisibles(empresaData)` según `config.areasOcultas` en `empresas/{uid}`; botón ⚙️ Config en SuperAdmin.

## 2026-08-01 — FJ App (v1.0473)
- Observaciones de cuota (master-detail) en Historial; rediseño de Balances; registro permanente SAF/SEC.
- Plantillas de mensajes de mora (4 niveles) con variables; panel de historial de cuotas editable; manual Word para abrir/cerrar el mes.
- **Gran esfuerzo de integridad de datos**: huecos de cuota (Mayo 2026), numeración desalineada con el mes operativo; herramientas de diagnóstico y reparación.
- El cierre ahora registra también cuotas impagas (antes solo pagadas → causaba huecos). Préstamos absorbidos avanzan; historial guarda `montoPuroHist` (monto puro, sin inflar).

## 2026-08-12 — FJ App (cajas + agrimensores)
- Trabajo extenso en Caja Física, Caja del día, Caja de Mora, Cierres de Transferencias y Agrimensores.
- **Reglas de negocio confirmadas**: efectivo físico = campo `entregó` (no se resta vuelto); CP = `montoCobrable(c).total`; interés del mes → Caja de Mora, cuota pura → Caja del día; tras cierre final todo lo vencido → Caja de Mora.
- Extras con "rendido"; limpieza de la cola de aprobación (rechazados cobros duplicados). Conciliación: ~$44.1M de efectivo distribuidos correctamente, sin faltantes.

## 2026-09-09 — Mapa de arquitectura (ambos)
- Construido el **mapa neuronal interactivo** de arquitectura: `mapa.html` + `mapa-data.json` (fuente única de verdad en el repo de MasterPlan, servido por `raw.githubusercontent.com`).
- Botón 🧠 agregado en ambas apps (FJ App v1.0593; MasterPlan dentro de ⚙️ Ajustes en `src/pages/Proyectos.js`). `firebase.json` con rewrite para servir `/mapa.html` estático.
- Regla: actualizar `mapa-data.json` en el mismo commit que cambios estructurales (igual que `MAPA.md`).

## 2026-09-19 — MasterPlan (Comercial + Google Drive)
- Recorrido rearmado como barra horizontal interactiva (modal por etapa).
- Formulario de reserva por secciones (admin diseña, vendedor completa; impresión A4); carga masiva (3 columnas, detección de duplicados por últimos 8 dígitos).
- Separación de login (Personal = empleados / Empresas = dueños, chequeo pre-auth vía `emails_empresa`).
- Campana de notificaciones (`notificaciones` + `notif_leidas`) + **`REGLAS.md`** (cada cambio registra una notificación).
- **Integración Google Drive por empresa**: OAuth + 4 Cloud Functions (`drivePorConectar`, `driveEstado`, `driveDesconectar`, `driveSubir`), tokens en Secret Manager, plan Blaze.
- **Pendiente/bug abierto**: botón "🧪 Probar subida de archivo" devuelve `internal` en `driveSubir` (causa probable: refresh token OAuth vencido porque la app sigue en "Testing"; confirmar en los logs de Firebase Functions). Parche preparado (try/catch para exponer el error real + rama `invalid_grant`) — quedó sin deployar por el bloqueo de push.

## 2026-09-19 — FJ App (v1.0631 → v1.0672)
- Simulador ICC; herramienta de cambio manual de trimestre; muchas mejoras de mora/adelantos/cajas.
- Notificaciones de mora reemplazan pendientes de aprobación; historial de adelantos permanente.
- Sistema de auto-actualización (`version.json`) + banner + cierre de sesión instantáneo vía Firebase.
- Fix de saldo fantasma (`saldoDifUltimoCobro`); guarda de frescura antes de subir datos; panel de auditoría pago vs caja; finalizaciones separadas en normales vs préstamos.
- **Bug crítico** `desmarcarPago` borraba TODOS los registros de caja/mora del cliente en vez del último (v1.0647).
- Quedó pendiente de deploy: renombrar "Vista Cliente" → "Cliente" (v1.0672), por el bloqueo de push.

## 2026-09-19 — El bloqueo de GitHub (motivo de la migración a Claude Code)
- Las sesiones tipo Cowork/nube quedaron con un **proxy de git nuevo** que bloquea `push` ("not in this session's authorized repository set") y manda a usar `add_repo`, que no existe en estas sesiones. Bug conocido de Anthropic (abierto desde ago-2026, sin fix).
- Confirmado: leer/clonar funciona; escribir no; el token no es la palanca. Solución: usar **Claude Code** (claude.ai/code), que tiene selector de repos con permiso de escritura → el push/deploy vuelve a funcionar.

---

## Pendientes abiertos (backlog al momento de migrar)

### FJ App
- Resolver los **12 lotes de Etapa 4** mal asignados a trimestre Azul (deberían ser Rosa; `calcTrimestrePorCuota` asigna mal al cargar). Primera cuota julio 2026, cuota 3 cae en septiembre.
- Deployar el rename "Vista Cliente" → "Cliente" (v1.0672).

### MasterPlan
- Debuggear `driveSubir` (revisar logs de Functions; probable `invalid_grant` → reconectar Drive / sacar OAuth de modo "Testing"); deployar el parche del try/catch y el botón de prueba.
- **Plano de lotes** para Comercial: subir imagen del plano, admin marca cada lote, vendedor lo elige clickeando, queda reservado/vendido.
- Subida de boleto firmado (etapa Firma); Legales → segundo archivo de Boletos.
- **Rotar la service account key** que quedó expuesta.
- Construir pilares **Legales** y **Desarrollos y Obras**.
- Pilar **Administración**: vacío hasta migrar FJ App módulo por módulo.
