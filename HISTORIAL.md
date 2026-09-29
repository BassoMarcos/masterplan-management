# HISTORIAL.md — Bitácora del proyecto (App de Administración + MasterPlan)

> Log cronológico de lo trabajado con Claude, reconstruido de los resúmenes de cada chat.
> Sirve para que cualquier sesión nueva entienda el recorrido completo, las decisiones y por qué las cosas son como son.
> **No contiene tokens ni contraseñas** (esos van en la memoria de Claude, nunca en el repo).

---

## 2026-05-31 — App de Administración (v1.02xx)
- Reconstrucción completa del formulario "Nuevo Cliente": secciones Titular / Lote(s) / contrato por lote.
- Modos de contrato por lote: **Normal**, **Pendiente**, **Escalonado** (el ICC aplica solo a la cuota base; USD no lleva ICC ni trimestre).
- Cargado el inventario de lotes vacíos de E4; `getLotesDisponibles` filtra ocupados dinámicamente (borrar cliente libera el lote).

## 2026-06-06 — App de Administración (v1.0293, ~20% completa)
- Visión de 4 pilares definida (Administración, Comercial, Legales, Desarrollos y Obras).
- Sistema de cliente "pausado" (primera cuota futura excluida de totales/mora hasta su mes).
- Modal resumen pre-cierre; snapshot/revert del último cierre; gráficos y reporte de morosidad.
- Sistema de aprobación pendiente (cobros del colaborador pasan por aprobación del admin); toasts.
- ICC vía `apis.datos.gob.ar`; export/import en pestaña Datos; deploy directo por GitHub Pages.

## 2026-06-07 — App de Administración (v1.0289 → v1.0309)
- Arreglos de sync a Google Sheets (mora/extras/balances); coerción de tipos (lote como número rompía `.match()`).
- ICC corrompido por Sheets (fechas ISO) → solución prefijo `STR:` en `mes`/`mesKey`.
- Integración de **Firebase Realtime Database** para sync en tiempo real (`_fbSet`/`_fbGet`/`_fbListen`).
- Dolor recurrente: caché agresivo de GitHub Pages.

## 2026-06-09 — Decisión estratégica
- ~305 clientes en RTDB. Visión SaaS multi-tenant: una venta en Comercial fluye por Legales y activa el cliente en Administración.
- **Se decide construir MasterPlan desde cero** en un chat aparte, e integrar App de Administración después.
- Pendientes: migración a Firebase Hosting (caché), login persistente, dominio propio.

## 2026-06-10 — MasterPlan (arranque)
- Creado proyecto Firebase **masterplanproyects** (`masterplanproyects.web.app`).
- Estructura React: AuthPage (doble verificación + verificación de email), Proyectos, ProyectoPilares, SuperAdmin.
- Flujo de aprobación (registros quedan "pending" hasta que el superadmin aprueba); **EmailJS** para el mail de bienvenida.
- Deploy por GitHub Actions → Firebase Hosting; primeras peleas con ESLint. Se evaluó Cloudinary para archivos.

## 2026-06-14 — App de Administración (modo oscuro + temas)
- Overhaul a **modo oscuro** (base gris + acentos de color).
- Selector de **10 temas** (🎨); control de % de distribución (reemplaza 70/30 fijo); fusión de cierres; toggle global de mora.

## 2026-06-15 — App de Administración
- Fix selección de lotes en Etapa 2/3 (`c.lote` numérico → envolver en `String()` en 5 funciones).
- Confirmación + clave admin en "Marcar/Desmarcar todos".
- Creado **`MAPA.md`** (referencia de arquitectura para onboarding de sesiones futuras).
- Corrección lógica de agrimensores en el cierre: **sí** avanzan cuotas y generan mora; lo único distinto es el ruteo del dinero (base → caja agrimensores, interés → ingresos extras).

## 2026-07-03 — Mantenimiento de infraestructura
- Reglas de Firebase RTDB de fj-app estaban por expirar → reemplazadas por reglas abiertas (`.read/.write: true`).
- Renovación de tokens de GitHub (sin expiración). Se decide no meter Firebase Auth en App de Administración (migrará a MasterPlan igual).

## 2026-07-04 — App de Administración (cierre + agrimensores + ICC)
- Gestión de lotes vacíos para E1/E2/E3 (antes solo E4).
- Pestaña **Lotes Finalizados** con seguimiento de certificados (solicitado/recibido/entregado).
- Auto-finalización al pagar última cuota; préstamos reciben ICC.
- **Concepto de "mes operativo"** para todo el flujo de ICC (Lista 1 `iccMensual` con % mensuales; dos locks: cierre final del mes operativo + 3 meses consecutivos).
- **Robot ICC**: GitHub Actions + Playwright (espera 15s por el SPA de INDEC), corre a diario, guarda en `icc-data.json`.
- Mora corregida al día-10 del mes operativo.

## 2026-07-21 — App de Administración (v1.0353)
- Formulario de pago con **entregó/vuelto** y cálculo en vivo de SAF/SEC.
- Sistema de transferencias (desglose 21%, parcial/total, Caja de Transferencias) + **Caja Física**.
- Escalonado; rediseño de Estadísticas; protecciones de fusión de cierres.
- Bugs: ICC aplicado a USD (restaurados 17 lotes); cierre final registraba mes calendario en vez de operativo; mora off-by-one → **día 11 = 1 día = 2%**.

## 2026-07-29 — App de Administración (v1.0432 → v1.0439)
- Corrección masiva de precios: 184 lotes habían vuelto a valores de abril (incidente de datos) → reparados con planilla física + historial.
- **Bug crítico `loadData()`**: reconstruía el cliente campo por campo y perdía campos nuevos (`empresaPaga`, `saldoDifUltimoCobro`). Regla: todo campo nuevo va en **ambas** normalizaciones (~línea 1209 y el `full.map` ~línea 1274).
- Sistema de backups validados (3 botones: inicial del mes / pre-cierre final / extra; rota últimos 12; doble clave).
- Modo consulta (ver/editar sin cobrar/ICC/cierre); categoría **`empresaPaga`** (Retamozo ETAPA 3-53); edición SAF/SEC + reversión de vuelto en desmarcar.

## 2026-07-30 — MasterPlan
- Portado el sistema de 10 temas a MasterPlan (ThemeContext, colección `preferencias`).
- **Pizarra colaborativa** (`PizarraFlotante`) con sync Firestore en tiempo real, aislada por pantalla.
- Abiertos los 4 pilares (AreaSecciones); Administración vacío a propósito (espera App de Administración).
- **Config por empresa**: `src/config/appConfig.js` con `areasVisibles(empresaData)` según `config.areasOcultas` en `empresas/{uid}`; botón ⚙️ Config en SuperAdmin.

## 2026-08-01 — App de Administración (v1.0473)
- Observaciones de cuota (master-detail) en Historial; rediseño de Balances; registro permanente SAF/SEC.
- Plantillas de mensajes de mora (4 niveles) con variables; panel de historial de cuotas editable; manual Word para abrir/cerrar el mes.
- **Gran esfuerzo de integridad de datos**: huecos de cuota (Mayo 2026), numeración desalineada con el mes operativo; herramientas de diagnóstico y reparación.
- El cierre ahora registra también cuotas impagas (antes solo pagadas → causaba huecos). Préstamos absorbidos avanzan; historial guarda `montoPuroHist` (monto puro, sin inflar).

## 2026-08-12 — App de Administración (cajas + agrimensores)
- Trabajo extenso en Caja Física, Caja del día, Caja de Mora, Cierres de Transferencias y Agrimensores.
- **Reglas de negocio confirmadas**: efectivo físico = campo `entregó` (no se resta vuelto); CP = `montoCobrable(c).total`; interés del mes → Caja de Mora, cuota pura → Caja del día; tras cierre final todo lo vencido → Caja de Mora.
- Extras con "rendido"; limpieza de la cola de aprobación (rechazados cobros duplicados). Conciliación: ~$44.1M de efectivo distribuidos correctamente, sin faltantes.

## 2026-09-09 — Mapa de arquitectura (ambos)
- Construido el **mapa neuronal interactivo** de arquitectura: `mapa.html` + `mapa-data.json` (fuente única de verdad en el repo de MasterPlan, servido por `raw.githubusercontent.com`).
- Botón 🧠 agregado en ambas apps (App de Administración v1.0593; MasterPlan dentro de ⚙️ Ajustes en `src/pages/Proyectos.js`). `firebase.json` con rewrite para servir `/mapa.html` estático.
- Regla: actualizar `mapa-data.json` en el mismo commit que cambios estructurales (igual que `MAPA.md`).

## 2026-09-19 — MasterPlan (Comercial + Google Drive)
- Recorrido rearmado como barra horizontal interactiva (modal por etapa).
- Formulario de reserva por secciones (admin diseña, vendedor completa; impresión A4); carga masiva (3 columnas, detección de duplicados por últimos 8 dígitos).
- Separación de login (Personal = empleados / Empresas = dueños, chequeo pre-auth vía `emails_empresa`).
- Campana de notificaciones (`notificaciones` + `notif_leidas`) + **`REGLAS.md`** (cada cambio registra una notificación).
- **Integración Google Drive por empresa**: OAuth + 4 Cloud Functions (`drivePorConectar`, `driveEstado`, `driveDesconectar`, `driveSubir`), tokens en Secret Manager, plan Blaze.
- **Pendiente/bug abierto**: botón "🧪 Probar subida de archivo" devuelve `internal` en `driveSubir` (causa probable: refresh token OAuth vencido porque la app sigue en "Testing"; confirmar en los logs de Firebase Functions). Parche preparado (try/catch para exponer el error real + rama `invalid_grant`) — quedó sin deployar por el bloqueo de push.

## 2026-09-19 — App de Administración (v1.0631 → v1.0672)
- Simulador ICC; herramienta de cambio manual de trimestre; muchas mejoras de mora/adelantos/cajas.
- Notificaciones de mora reemplazan pendientes de aprobación; historial de adelantos permanente.
- Sistema de auto-actualización (`version.json`) + banner + cierre de sesión instantáneo vía Firebase.
- Fix de saldo fantasma (`saldoDifUltimoCobro`); guarda de frescura antes de subir datos; panel de auditoría pago vs caja; finalizaciones separadas en normales vs préstamos.
- **Bug crítico** `desmarcarPago` borraba TODOS los registros de caja/mora del cliente en vez del último (v1.0647).
- Quedó pendiente de deploy: renombrar "Vista Cliente" → "Cliente" (v1.0672), por el bloqueo de push.

## 2026-09-19 — El bloqueo de GitHub (motivo de la migración a Claude Code)
- Las sesiones tipo Cowork/nube quedaron con un **proxy de git nuevo** que bloquea `push` ("not in this session's authorized repository set") y manda a usar `add_repo`, que no existe en estas sesiones. Bug conocido de Anthropic (abierto desde ago-2026, sin fix).
- Confirmado: leer/clonar funciona; escribir no; el token no es la palanca. Solución: usar **Claude Code** (claude.ai/code), que tiene selector de repos con permiso de escritura → el push/deploy vuelve a funcionar.

## 2026-09-21 — MasterPlan: pilar Administración en 3 secciones
- Los paneles de Administración pasan de `cobros/mora/caja/cierres` a **`gerencia / administracion / cobranzas`** (`appConfig.js`). Nuevas pantallas `AdministracionHub` y `AdministracionPanel` (portada "en construcción" por sección, con control de permisos por panel) y rutas `/proyecto/:id/administracion` y `/proyecto/:id/administracion/:panelId`.
- Decisiones: Administración = lo del admin de fj-app; Cobranzas = lo del colaborador; Gerencia = rango más alto, se desarrolla más adelante con el gerente. El cajero puede anular un cobro del mes en curso (queda registrado quién). Portal del cliente con DNI: pendiente para más adelante.
- `mapa-data.json` actualizado con los 3 nodos nuevos. Regla de trabajo: cada pedido empieza con `Mp-` (MasterPlan) o `fyj-` (fj-app).

---

## 2026-09-21 — MasterPlan: renombrar proyectos
- En la pantalla Proyectos, el admin (o empleado con acceso total) ve un botón ✏️ en cada tarjeta para cambiar el nombre.
- El nombre vive solo en el documento `proyectos/{id}` (campo `nombre`); todas las pantallas lo leen de ahí, así que el cambio llega a todos los empleados sin tocar nada más (se ve al abrir/recargar la pantalla).

## 2026-09-21 — MasterPlan: Configuración de Administración
- Decisión de Marcos: NO se migran datos de fyj. Se arma en MasterPlan la base del sistema administrativo **para cualquier empresa** (funcionamiento parecido a fyj, estética MasterPlan, mejor diseño). Gerencia se arma después. Los valores de F&J se cargan al final como configuración de F&J.
- Nuevo cuarto panel **Configuración** dentro de Administración (`AdministracionConfig.js`), guardado en `proyectos/{id}.adminConfig`: forma de financiación (moneda, cuotas, incremento: sin/ICC/fijo/manual, cada cuántos meses, grupos de aumento con meses y color, USD aumenta o no), mora (activa, % por día, desde qué día), impuesto de transferencias, reparto de caja (A/B) y cajas especiales (agrimensores, escribanos, la empresa…).
- Todavía NO mueve plata. Pendiente a definir a detalle: cómo se aplica un cambio de configuración a mitad de mes.
- Esquema completo del administrador de fyj: `ESQUEMA_ADMIN_FYJ.md` (fuera de los repos).

## 2026-09-22 — MasterPlan: Configuración con lista de secciones
- Marcos: el panel anterior se sentía "limitado y mezclado". Rediseño a **lista de izquierda + detalle a la derecha** (como los Ajustes de cualquier app): Financiación, Mora, Transferencias, Distribución de ganancias y Cajas especiales, cada una como una sección aparte con todas sus opciones ampliadas.
- Se separaron mora / transferencias / distribución (antes una sola tarjeta) en 3 secciones independientes de la lista.
- Si al guardar hay un error, el panel salta directo a la sección con el problema.
- Mismos datos y misma validación que la versión anterior (probado en Node: config por defecto, config vieja sin romper, caso tipo F&J con ICC/3 grupos/mora/transferencia/reparto, y 8 errores con su sección correcta).

## 2026-09-22 — MasterPlan: Financiación pasa a ser "planes" (varios por proyecto)
- Marcos: en un mismo proyecto puede haber, por ejemplo, 10 lotes donde la mitad paga en dólares y la otra mitad en pesos con ICC. Una sola Financiación por proyecto no alcanza.
- Financiación ahora es una lista de **planes de financiación**: cada uno con su propio nombre, moneda, cantidad de cuotas, tipo de incremento y grupos de aumento. Se pueden agregar y quitar planes libremente (mínimo 1).
- Qué lote usa cada plan se define más adelante, en la sección de Lotes (todavía no existe) — cada lote va a apuntar a un `planId`.
- Compatibilidad: la config vieja de ayer (una sola financiación sin "planes") se migra sola al abrir el panel, como un único plan. No hace falta tocar nada a mano.
- Probado en Node: 1 plan por defecto, migración desde la config vieja, el caso de Marcos (USD sin incremento + ARS con ICC), y que un error en el 2do plan lo identifique por nombre.

## 2026-09-24 — MasterPlan: sección Lotes (inventario del proyecto)
- Marcos: los planes de financiación y las cajas especiales hay que asignarlos a lotes concretos, sobre el total de lotes y manzanas del proyecto. Hasta ahora MasterPlan no tenía lotes uno por uno (Desarrollos solo guarda manzanas con una cantidad).
- Nueva sección **🧩 Lotes** en Administración → Configuración. Guarda un documento por lote en `proyectos/{id}/lotes` con `{etapa, manzana, numero, planId, cajaId}`. Es la **lista única de lotes del proyecto**: más adelante Comercial (plano de lotes, reservas), Legales y Desarrollos van a usar esta misma colección.
- Alta en bloque ("Etapa 1, M1, del 1 al 20") o suelta ("4B"); la manzana es opcional (hay etapas sin manzanas). No deja crear repetidos.
- Grilla por etapa → manzana, cada lote con el color de su plan (punteado = sin plan) y ★ si está en una caja especial. Filtro (sin plan / por plan / por caja), selección por manzana o de todo lo visible, asignar plan, pasar a caja, editar o eliminar.
- Se guarda con el mismo botón que la configuración y en la misma tanda (hasta ~450 lotes todo junto o nada). No deja guardar si quedan lotes apuntando a un plan o caja que se quitó.
- Probado en Node: lotes con y sin manzana, orden 1-2-4B-10, repetidos, lote sin número, plan/caja quitados, y que al guardar solo se escribe lo que cambió.
- Riesgo conocido: si las reglas de Firestore (se pegan a mano en la consola) no permiten la subcolección `lotes`, al guardar aparece "falta permiso en las reglas".

## 2026-09-24 — MasterPlan: Configuración ajustada (paso 1 del asistente)
- Marcos propuso un **asistente paso a paso** al crear un proyecto (diseño en `ESQUEMA_ADMIN_FYJ.md` §11, fuera del repo). Paso 1: ajustar la Configuración a lo que va a preguntar el asistente.
- **Mora**: en vez de "desde qué día corre", se pregunta el **último día del mes para pagar sin interés** (`mora.ultimoDia`; 10 → quien paga el 11 tiene 1 día de atraso). Las configs viejas con `desdeDia` se convierten solas (desdeDia − 1).
- **Dueños** (`duenos: [{nombre, porcentaje}]`): reemplaza el reparto fijo parte A / parte B. Varios dueños con su %, tienen que sumar 100 (acepta 33,33 + 33,33 + 33,34). El reparto viejo se convierte solo.
- **Transferencias**: se muestra como "recargo sobre el valor base" con un ejemplo en pesos.
- **Cajas separadas**: cada caja muestra cuántos lotes tiene y un botón "Elegir lotes" con la grilla del proyecto (los que están en otra caja se marcan con ★; tocarlos los pasa a esta). Quitar una caja con lotes avisa y los devuelve a la caja principal.
- **Lotes con letras**: "del 1 al 4" + letras "A, B" crea 1A,1B,2A,2B,3A,3B,4A,4B (acepta "A-D"). Además, con un lote seleccionado, "Desplegar en letras" parte un número en las letras que quieran (el 2 → 2A,2B,2C, conservando plan y caja; si ya estaba partido, suma las letras que falten).
- Arreglo: al abrir Configuración de un proyecto nuevo podía decir "Tenés cambios sin guardar" sin haber tocado nada (la config inicial se armaba dos veces con ids distintos).
- Pendiente (próximos pasos): áreas y paneles por proyecto (Administración es opcional: una empresa puede solo vender), y el asistente en sí. El asistente tiene que preguntar cuántas manzanas y lotes por manzana.

## 2026-09-24 — MasterPlan: asistente de proyecto nuevo + áreas por proyecto
- Idea de Marcos: al crear un proyecto, el sistema hace las preguntas y la empresa configura todo desde el inicio (después se puede cambiar).
- **Asistente** (`AsistenteProyecto.js`, ruta `/proyecto/:id/configurar`): se abre solo al crear un proyecto (queda `asistente: {completo: false}`). Paso a paso con barra de progreso: Bienvenida → Áreas y paneles → Lotes (etapas, cuántas manzanas, lotes por manzana del … al …, letras) → Financiación (¿en qué moneda?, planes, qué lotes van con cada uno) → Mora → Transferencias → Dueños → Cajas separadas (con sus lotes) → Resumen → guardar todo junto.
- Si el proyecto **no usa Administración** (ej. solo vende), se saltean financiación, mora, transferencias, dueños y cajas. Lotes va si usa Administración, Comercial o Desarrollos.
- Se puede **pausar** ("Salir y seguir después"): guarda un borrador en `asistente.borrador` en cada paso. La pantalla del proyecto muestra "Falta terminar la configuración" con botón para continuar. Botón "⚙️ Configuración del proyecto" (dueño / acceso total) para volver a abrirlo y cambiar respuestas.
- **Áreas y paneles por proyecto** (`proyectos/{id}.estructura`, helpers en `appConfig.js`: `areaActivaEnProyecto`, `panelActivoEnProyecto`, `areasDelProyecto`, `panelesDelProyecto`): siempre dentro de lo que el SuperAdmin habilitó para la empresa. Proyectos viejos sin `estructura` ven todo como antes. Configuración de Administración no se puede apagar si el área está activa.
- Reglas de configuración separadas en `src/config/adminConfigLogica.js` (sin pantallas): las usan Configuración y el asistente, así validan y guardan igual. El guardado de config + lotes quedó en `guardarConfigYLotes` (una tanda).
- Probado: build estricto; lógica en Node (loteo con/sin manzanas y letras, errores, conservar asignaciones al volver atrás); y una **simulación de navegador** (base de datos en memoria) que recorre el asistente completo, el caso "solo vende" y la pantalla de Configuración.
- Pendiente: el editor de permisos de Empleados todavía muestra todas las áreas (no filtra por las del proyecto); regla "no se cobra hasta terminar la configuración" cuando existan los cobros.

## 2026-09-24 — MasterPlan: logo del proyecto comprimido
- El logo se guardaba con el tamaño original adentro del proyecto (Firestore). Una foto de celular superaba el límite de 1 MB por registro y no dejaba crear el proyecto.
- Ahora se achica al subirlo (`src/utils/imagen.js`): 256 px de lado, WebP (con transparencia; PNG si el navegador no soporta WebP). Probado en navegador: foto de 6.214 KB → 18 KB.
- Decisión con Marcos: el logo va en Firestore (no como link al Drive: se rompe si borran la foto o desconectan el Drive). El Drive queda para archivos pesados (boletos, PDFs, fotos de obra).
- Estimación de costo charlada (500 empresas × 3 proyectos × 500 clientes, 4 años): ~27 GB, ~US$ 70-260/mes en total (lo que más pesa son las lecturas). Guardar las 48 cuotas de un lote juntas en un solo registro.

## 2026-09-25 — MasterPlan: reglas de Firestore para lo de adentro de los proyectos
- El asistente de proyecto nuevo mostraba "No se pudo abrir el proyecto": las reglas no permitían la colección `proyectos/{id}/lotes`. Tampoco permitían las secciones de **Desarrollos y Obras** (`proyectos/{id}/desarrollos_*`).
- Nueva regla general (`firestore.rules`, guardado en el repo): todo lo que está dentro de un proyecto lo pueden usar el dueño de la empresa, sus empleados aprobados y el SuperAdmin. Probado en el emulador de Firebase: 18 casos (dueño, empleado aprobado/pendiente, otra empresa, sin sesión, SuperAdmin, tanda de 200 lotes + proyecto, reglas viejas intactas).
- El asistente ahora dice si el error es de permisos.

## 2026-09-25 — MasterPlan: financiación por moneda, grupos automáticos y letras en lista
- Pedido de Marcos tras probar el asistente:
  - **Financiación del proyecto = reglas por moneda** (pesos / dólares): ¿se usa?, ¿aumenta?, ¿cómo (ICC / % fijo / manual / fija)? y ¿cada cuántos meses? **Sin cantidad de cuotas**: eso, el valor de la cuota y el grupo de cada cliente se ponen **al firmar cada lote** (contrato). Datos: `adminConfig.financiacion = { ARS: {habilitada, incremento, grupos}, USD: {...} }`. Lo guardado con "planes" se convierte solo (primer plan de cada moneda).
  - **Grupos de aumento automáticos**: aumenta cada N meses → N grupos; el grupo k arranca en el mes k (cada 3: G1 Ene-Abr-Jul-Oct, G2 Feb-May-Ago-Nov, G3 Mar-Jun-Sep-Dic). Si N no divide a 12, los meses cambian por año. Solo se editan nombre y color (se conservan si cambia N).
  - **Se sacó el plan de los lotes** ("¿Qué lotes van con cada financiación?" y asignar plan en Lotes): se define al comprar el lote.
  - **Letras en lista**: "¿Están partidos?" → No / 2 partes (A,B) / 3 partes (A,B,C) … hasta 6. En Configuración → Lotes: "Partir el lote N en…".
- Probado: reglas en Node y simulación de navegador (asistente completo, solo vende, Configuración con config vieja).

## 2026-09-25 — MasterPlan: aumentos con fecha fija para todos
- Nueva opción por moneda: **¿Cómo se reparten los aumentos?** → *Por grupos* (cada cliente según su firma, lo que ya estaba) o *Fecha fija para todos* (todos aumentan juntos en meses fijos). En fecha fija se elige el **mes del primer aumento** y se calculan los demás (cada 4 desde enero = Ene · May · Sep; desde marzo = Mar · Jul · Nov). Datos: `incremento.modo` (`grupos` | `calendario`) y `incremento.mesInicio`.
- Regla de Marcos: en fecha fija, aunque el cliente haya firmado hace un mes, **aumenta igual que todos** (sin mínimo ni proporcional).
- **Regla para la firma de lotes (a implementar en contratos):** el período de aumento cuenta desde la FIRMA. Con aumento cada N meses (modo grupos) aumenta en las cuotas N, 2N, 3N…: la primera tanda tiene N−1 cuotas al precio inicial (ej. cada 3: cuotas 1-2, después 3-5, 6-8). El grupo del cliente sale del mes en que le cae la cuota N (igual que fyj `calcTrimestrePorCuota`).
- Probado: Node y simulación de navegador (4 casos).

## 2026-09-25 — MasterPlan: base de la mora y dueños en vivo
- **Mora**: nueva opción "¿Sobre qué valor se calcula el interés?" → la última cuota del mes anterior (por defecto) o la primera cuota (precio de la firma). `cobranza.mora.base` = `anterior` | `primera`. (Marcos descartó "la cuota atrasada".)
- **Dueños**: los % se reparten solos para sumar siempre 100. Al cambiar uno, la diferencia se reparte en partes iguales entre los que NO se tocaron (si ya se tocaron todos, absorbe el tocado hace más tiempo). Ej. 3 dueños: A = 20 → B y C = 40/40; B = 50 → solo C (30). Al quitar un dueño, su % va a los no tocados. Lógica en `rebalancearDuenos` / `quitarDueno`.
- Probado: Node y simulación de navegador (5 casos).

## 2026-09-26 — MasterPlan: configuración en partes (asistente del proyecto + asistente de Administración)
- Acordado con Marcos: el inicio no se sobrecarga; cada área configura lo suyo la primera vez que se usa.
- **Asistente del proyecto** (al crear): Bienvenida → Áreas → Lotes → **Datos del proyecto** (tipo, dirección, localidad, provincia → `proyectos/{id}.datos`) → Resumen. Ya NO pregunta nada de Administración.
- **Asistente de Administración** (`/proyecto/:id/administracion/configurar`, mismo componente con `modo="administracion"`): Financiación → Mora → Transferencias → Dueños → Cajas → Resumen. Guarda `adminConfig`, la caja de cada lote y `adminAsistente.completo`. Pausable (`adminAsistente.borrador`).
- La entrada de Administración muestra "Falta configurar Administración" hasta completarlo (solo dueño / acceso total puede configurarla; los demás ven que se lo pidan). Las secciones redirigen a la entrada. Proyectos que ya tenían `adminConfig` cuentan como configurados (`administracionConfigurada`).
- Configuración de Administración tiene links a los dos asistentes.
- Probado: build estricto + simulación de navegador (7 casos).

## 2026-09-26 — MasterPlan: la bienvenida vuelve a preguntar todo
- Marcos prefirió el asistente de bienvenida como estaba ("ya con eso configurábamos bastante"): vuelve a incluir Financiación, Mora, Transferencias, Dueños y Cajas cuando el proyecto usa Administración, y suma el paso **Datos del proyecto**. Al terminar queda `adminConfig` y `adminAsistente.completo`.
- El asistente de Administración queda **de respaldo**: la entrada del área lo pide solo si Administración no está configurada (ej. se activó después).
- Probado: simulación de navegador (7 casos).

## 2026-09-26 — MasterPlan: qué se configura en cada área + Lotes pasan a Desarrollos
- Acordado con Marcos qué va en la Configuración de cada área (Administración, Desarrollos, Comercial, Legales, Empresa); detalle en ESQUEMA_ADMIN_FYJ.md §13 (fuera del repo). Regla: cada área configura TODO lo suyo; lo compartido se carga en un lugar y las demás lo leen.
- **Lotes → Desarrollos**: nueva pantalla `DesarrollosLotes.js` (Desarrollos → Manzanas y lotes) con el editor `components/EditorLotes.js`, sobre la lista única `proyectos/{id}/lotes`. Reemplaza la tabla escrita a mano (`desarrollos_manzanas`): esos registros viejos se muestran abajo, sin borrarse solos.
- Administración ya no tiene la sección Lotes; en **Cajas separadas** se eligen los lotes de cada caja y hay link a Desarrollos (o a la configuración del proyecto si no usa Desarrollos).
- Guardado de lotes: `diffLotes` ahora escribe solo los campos que cambiaron (`update`), así Desarrollos (etapa/manzana/número) y Administración (caja) no se pisan. Si otro borró el lote mientras se editaba, avisa claro y no guarda a medias.
- Probado: simulación de navegador (7 casos nuevos + asistente).

## 2026-09-26 — MasterPlan: Configuración de Administración completa (lo que tenía fyj)
- Secciones nuevas (`AdministracionConfigCobros.js`), agrupadas en la lista: **Cuotas** (Financiación, Mora + tope de interés, Avisos de mora, Adelantos, Transferencias) · **Cobros** (Permisos de cobro, Diferencias al cobrar, Recibos, Cierre del mes) · **Casos** (Casos especiales, Lotes terminados) · **Plata** (Dueños, Cajas separadas).
- Adelantos: se permiten / cancelan las últimas, las próximas o lo elige quien cobra / aprobación. Si cancelan las próximas y hay aumento en el medio: **opción** "quedan al precio de hoy" o "paga la diferencia" (se deja configurable en vez de decidirlo).
- Avisos de mora: grupos por cantidad de cuotas (por defecto 1 · 2-3 · 4-6 · 7+) con color y mensaje de WhatsApp, saludo y firma, variables {nombre} {lote} {cuotas} {meses} {monto} {cuotapura} y vista previa.
- Permisos de cobro (Cobranzas / con aprobación / solo Administración): cobrar todo por transferencia, otro interés o descuento, anular, marcar sin cobrar.
- Diferencias (se ignoran hasta $X; el saldo se aplica solo en el próximo pago o no), recibos (título, número inicial, pie, WhatsApp), cierre (respaldos, simulador), casos especiales (primera cuota futura, escalonado, refinanciación, préstamos, la empresa paga), certificado de lotes terminados con pasos editables.
- Estilos compartidos pasan a `components/configUI.js` (con `Opciones` y `SiNo`). Configs viejas abren sin cambios (valores por defecto al leer).
- Todavía no mueven plata: las van a usar los cobros.
- Probado: simulación de navegador (6 casos nuevos + lotes + asistente).

## 2026-09-27 — MasterPlan: ⚙️ Configuración central + orden general (auditoría)
- Nueva pantalla **⚙️ Configuración** (`ConfiguracionProyecto.js`, ruta `/proyecto/:id/configuracion/:grupo/:seccion`): lista por área a la izquierda (Proyecto · Desarrollos y Obras · Administración · Comercial · Legales · Empresa) y el detalle a la derecha. Reemplaza las configuraciones desparramadas:
  - Proyecto: **Datos del proyecto** y **Áreas y paneles** se editan directo (antes solo rehaciendo el asistente). "Lotes" aparece acá si el proyecto no usa Desarrollos.
  - Administración: todas sus secciones (la lista la dibuja la pantalla central; `AdministracionConfig` ya no tiene lista propia). El cuadro "Configuración" del área lleva acá.
  - Comercial: Recorrido y reserva + Formulario de filtro (antes en dos pantallas sueltas; las direcciones viejas redirigen). El diseñador de la reserva vuelve acá.
  - Legales / Desarrollos / Comercial: ítem **"Lo que viene"** con lo acordado (§13) para que se vea el plan.
  - Empresa: atajos a Ajustes de la empresa (se abre directo) y Empleados.
  - Pregunta antes de salir con cambios sin guardar; "Volver" regresa a donde estabas. Empleados: solo ven las partes con permiso (ver = solo lectura).
- El asistente pasa a llamarse **🧭 Asistente** (sirve para crear y para "Repasar todo"); comparte validación y guardado de áreas con la pantalla central (`validarEstructura` / `limpiarEstructura` en appConfig).
- Orden / auditoría:
  - Legales y Desarrollos: las tarjetas salen de `AREAS_DEFAULT` (la misma lista que permisos y Áreas y paneles). Legales tenía 5 tarjetas pero 3 permisos; ahora 4 y parejas (sale "Estados legales de lotes": el estado del lote va en Desarrollos; entra **Biblioteca de documentos**). Se borró código muerto de Administración/Comercial en `AreaSecciones`.
  - Desarrollos respeta permisos por panel (antes cualquiera con acceso podía editar/borrar; "ver" ahora es solo lectura y sin permiso no entra).
  - Paneles que se agreguen a la app en el futuro arrancan **prendidos** en proyectos existentes (`estructura.areas[x].conocidos`).
  - `LotesProyecto` (componente) = la lista de lotes con su guardado, usada en Desarrollos y en Configuración.
- Probado: simulación de navegador (33 casos).

## 2026-09-27 — MasterPlan: ⚙️ Configuración con pestañas + la de cada área + la de la empresa
- Pedido de Marcos: una configuración central con todas las áreas (y lo de la empresa), y en cada área su ⚙️ con SOLO lo de esa área, sincronizado. Y que al elegir un área sus opciones vayan como títulos arriba, sin desplegarse en la lista (se perdía lo demás).
- `Configuracion.js` (antes ConfiguracionProyecto) con 3 modos, mismas piezas y mismos datos:
  - Central: `/proyecto/:id/configuracion/:grupo/:seccion` — izquierda: solo la lista de grupos (Proyecto, cada área en el orden de AREAS_DEFAULT, Empresa); las opciones del grupo van como **pestañas arriba del recuadro** (con títulos chicos Cuotas/Cobros/Casos/Plata en Administración).
  - De un área: `/proyecto/:id/:area/configuracion/:seccion` — el **⚙️ Configuración** del encabezado de cada área (`BotonConfiguracion`, aparece solo si la persona tiene algo para configurar). Botón "Ver toda la configuración".
  - De la empresa: `/configuracion/:seccion` — el ⚙️ de la pantalla de proyectos (reemplaza el cartel "Ajustes"): Cuenta (mail + cambiar contraseña por mail), Código de la empresa, Google Drive, Empleados y permisos, Lo que viene. Lo mismo aparece como grupo "Empresa" en la central (`components/AjustesEmpresa.js`).
- Qué se configura en cada área y quién lo ve: `config/configuracionGrupos.js` (`SECCIONES_ADMIN`, `LO_QUE_VIENE`, `armarGrupos`, `tieneConfiguracion`). Un área nueva en AREAS_DEFAULT aparece sola.
- Administración: "Configuración" deja de ser una tarjeta y pasa al ⚙️ de arriba, como en las demás áreas.
- Probado: simulación de navegador (38 casos) + captura visual de la central y de Comercial.

## 2026-09-28 — MasterPlan: el mapa de arquitectura pasa a ser solo del SuperAdmin
- Marcos se dio cuenta de que /mapa.html lo podía abrir cualquier empresa (y el botón estaba en Configuración → Empresa → Cuenta).
- Se saca `public/mapa.html` (y su rewrite en firebase.json) y el botón de Cuenta. Nueva ruta protegida `/superadmin/mapa` (botón 🧠 en el panel SuperAdmin) que muestra el mapa con los datos ADENTRO (`scripts/generar-mapa.js` arma `src/generado/mapaArquitectura.js` antes de build/start/test; carga aparte, solo al abrirlo).
- Contexto: Marcos cree que hay competencia armando algo parecido a MasterPlan (no a M2). Pendiente de su ok: pasar el repo a privado (el código y las notas siguen públicos en GitHub).

## 2026-09-29 — MasterPlan: Biblioteca de documentos (en el Drive de cada empresa)
- Pedido de Marcos: una biblioteca por proyecto (Legales) + una general de la empresa; todo guardado en el Google Drive de cada empresa; que aparezca siempre lo que se sube desde MasterPlan; permisos por biblioteca y por carpeta; vista previa antes de bajar (fotos, PDF, documentos); crear carpetas, cambiar nombre, mover, eliminar — "cualquier cosa tipo compu".
- Hecho: explorador con camino arriba, íconos o lista, subir archivos o carpetas enteras (botón o arrastrando desde la compu), arrastrar encima de una carpeta para mover, "Mover a…", menú con botón derecho, vista previa con flechas (Word/Excel/PowerPoint como PDF), descargar, papelera con restaurar (Google la vacía a los 30 días), buscar en toda la biblioteca, "Quién la ve" por carpeta. Empleados → permiso 📚 Biblioteca general.
- Servidor nuevo (`functions/biblioteca/`): el "portero" revisa permisos en cada pedido; los empleados no necesitan cuenta de Drive. Los archivos dejan de ser públicos por link (`driveSubir` ya no los comparte).
- Seguridad (de paso): se cerró un agujero en las reglas de `empleados` — cualquiera con cuenta podía crearse un perfil aprobado con acceso total en cualquier empresa, o darse permisos solo.
- Probado: 45 pruebas de reglas en el emulador, 9 del servidor, conector de Drive con un Google de mentira, y 4 recorridos de la pantalla conectada al servidor real (dueño, empleada solo lectura, sin permiso, sin Drive, archivo grande).
- Pendiente: "Agregar desde Drive" (Google Picker) para archivos que ya estaban en el Drive; archivos de más de 7 MB.

## 2026-09-29 — Biblioteca: miniaturas y más rápida
- Marcos conectó su Drive (se había vencido: Google corta la conexión a los 7 días mientras la app está "en prueba"; ahora ⚙️ Configuración → Google Drive avisa y deja reconectar).
- Pidió ver las fotos de un vistazo y que abran más rápido: miniaturas en las tarjetas (y en la lista), la foto se empieza a traer al pasar el mouse, lo ya abierto queda guardado, la vista previa muestra la miniatura mientras llega la foto entera. Servidor: arranca más rápido (@googleapis/drive) y reusa la conexión con Drive.

## 2026-09-29 — La biblioteca del proyecto sale de Legales
- Pedido de Marcos: que la biblioteca de cada proyecto no esté adentro de Legales, porque otras áreas también la necesitan.
- Ahora es la tarjeta **📚 Biblioteca del proyecto** en la pantalla del proyecto (al lado de las áreas), con su propio permiso por proyecto en Empleados. Quien tenía acceso por Legales lo conserva hasta que se le guarden los permisos de nuevo. No depende de que Legales esté prendida.
- Marcos va a ajustar después cómo se da el acceso.

## Pendientes abiertos (backlog al momento de migrar)

### App de Administración
- Resolver los **12 lotes de Etapa 4** mal asignados a trimestre Azul (deberían ser Rosa; `calcTrimestrePorCuota` asigna mal al cargar). Primera cuota julio 2026, cuota 3 cae en septiembre.
- Deployar el rename "Vista Cliente" → "Cliente" (v1.0672).

### MasterPlan
- Debuggear `driveSubir` (revisar logs de Functions; probable `invalid_grant` → reconectar Drive / sacar OAuth de modo "Testing"); deployar el parche del try/catch y el botón de prueba.
- **Plano de lotes** para Comercial: subir imagen del plano, admin marca cada lote, vendedor lo elige clickeando, queda reservado/vendido.
- Subida de boleto firmado (etapa Firma); Legales → segundo archivo de Boletos.
- **Rotar la service account key** que quedó expuesta.
- Construir pilares **Legales** y **Desarrollos y Obras**.
- Pilar **Administración**: vacío hasta migrar App de Administración módulo por módulo.
