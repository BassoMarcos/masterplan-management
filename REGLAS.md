# REGLAS DEL PROYECTO — MasterPlan

> **Leer este archivo al inicio de cada sesión de trabajo sobre MasterPlan.**

## 1. Notificaciones obligatorias en cada cambio

**REGLA PRINCIPAL:** Cada vez que se hace una modificación en la app (nueva función,
mejora, corrección), **hay que registrar una notificación** en la colección
`notificaciones` de Firestore para que los usuarios se enteren.

### Cómo registrar la notificación

Al terminar un cambio y antes de dar por cerrada la tarea, crear un documento en
la colección `notificaciones` con esta forma:

```
{
  tipo: "actualizacion",              // "actualizacion" | "trabajo"
  titulo: "Calendario de visitas",     // corto, claro
  detalle: "Ahora en Ventas hay un calendario donde ves las visitas, reservas y firmas programadas.",
  areas: ["comercial"],                // áreas afectadas: ["comercial","administracion","legales","obras"] o [] para todas
  paneles: ["ventas"],                 // paneles afectados: ["datos","filtrado","ventas"] o [] para todos
  soloEmpresaId: null,                 // null = todas las empresas; o el uid de una empresa puntual
  fecha: serverTimestamp(),
  fechaMs: Date.now(),
}
```

### A quién le llega cada notificación

- **Empresas (dueños) y empleados con acceso total:** reciben TODAS las notificaciones.
- **Empleados normales:** solo reciben las notificaciones cuyos `paneles` coincidan
  con los paneles a los que tienen acceso. Si `paneles` está vacío, le llega a todos.
- **`soloEmpresaId`:** si tiene un uid, esa notificación la ve solo esa empresa
  (y sus empleados, según el filtro de paneles).

### Notificaciones de trabajo (automáticas por código)

Además de las de actualización, el código genera notificaciones de tipo `"trabajo"`
cuando ocurre algo que le importa a un usuario puntual (campo `paraUid`):
- Te asignaron datos para filtrar o vender.
- Tenés una fecha vencida sin revisar.

## 2. Otras reglas del proyecto

- **Validar el build antes de subir:** correr `CI=true npx react-scripts build`
  localmente. CRA trata los warnings de ESLint como errores
  (especialmente `no-unused-vars` y `no-mixed-operators`).
- **Deploy:** push a `main` → GitHub Actions publica en Firebase Hosting (~2-3 min).
- **Reglas de Firestore:** se publican MANUALMENTE desde la consola de Firebase.
  Al cambiarlas, entregar el ruleset COMPLETO para copiar y pegar.
- **Acceso total:** un empleado con `accesoTotal: true` tiene los mismos permisos
  que el dueño de la empresa.
