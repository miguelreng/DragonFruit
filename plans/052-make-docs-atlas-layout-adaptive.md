# Plan 052: Hacer adaptativo el layout Docs + Atlas

> **Instrucciones para ejecución:** conservar resize, snap, rail y focus ya
> construidos en Plan 036. Este plan sólo corrige el presupuesto de espacio y el
> cambio automático docked ↔ overlay.
>
> **Drift check (ejecutar primero):**
> `git diff --stat 0cb42cdc533a..HEAD -- apps/web/ce/components/workspace/content-wrapper.tsx apps/web/helpers/atlas-sidebar-layout.ts apps/web/helpers/atlas-sidebar-layout.test.ts apps/web/core/store/theme.store.ts apps/web/core/components/pages/editor/toolbar`
> Detenerse si Plan 036 fue reemplazado o cambió el ancho del app rail.

## Estado

- **Prioridad:** P1
- **Esfuerzo:** M
- **Riesgo:** MED
- **Depende de:** Plan 036
- **Categoría:** UX/UI / responsive
- **Planeado en:** commit `0cb42cdc533a`, 2026-07-30
- **Ejecución:** COMPLETADO Y VALIDADO EN PRODUCCIÓN, 2026-07-31

## Por qué importa

Con Atlas abierto en producción:

- a 1024 px el editor quedó en ~440 px y la toolbar se extendió detrás del
  drawer;
- a 768 px exactos el `contenteditable` quedó en 134 px y el título se partió
  casi palabra por palabra.

El resize existente pasa 24 unit tests, pero su presupuesto usa el viewport
completo. No descuenta el app rail ni el chrome del editor.

## Estado actual

- `MOBILE_BREAKPOINT = 768` con `windowWidth < MOBILE_BREAKPOINT`; 768 es
  escritorio.
- Atlas docked tiene mínimo 320 px.
- El máximo es `min(720, viewportWidth - 420)`.
- El app rail sigue ocupando espacio antes del wrapper del contenido.
- No existe una decisión basada en el ancho **restante** del editor.
- La toolbar no compacta/manda acciones a overflow antes de ser ocluida.
- Plan 036 implementó drag, snap, teclado y persistencia; no deben duplicarse.

## Comportamiento objetivo

La decisión docked no depende de un breakpoint fijo, sino del presupuesto real:

```text
ancho disponible del workspace
- app rail visible
- gaps/bordes
- ancho Atlas solicitado
>= ancho mínimo útil del editor
```

Usar 600 px como punto inicial de ancho útil y validarlo visualmente. Si no
alcanza:

- Atlas abre como overlay sobre un editor que conserva su ancho;
- el ancho persistido del usuario no se borra;
- al recuperar espacio vuelve a docked si esa era la preferencia;
- focus/full sigue disponible;
- a 768 px o menos, navegación y Atlas son overlays, nunca tres columnas.

La toolbar mueve acciones secundarias a “More” antes de overflow y mantiene
visibles título/contexto y acciones primarias.

## Alcance

**Dentro:**

- helpers de presupuesto real y modo dock/overlay;
- medición con `ResizeObserver` del contenedor, no sólo `window.innerWidth`;
- corrección de 768 exactos;
- transición y preferencia persistida;
- overflow responsive de toolbar;
- tests unitarios y matriz visual.

**Fuera:**

- cambiar los controles de resize/snap;
- rediseñar el contenido interno del chat;
- rehacer app rail;
- mobile native.

## Pasos

### Paso 1: Convertir la evidencia en tests de layout

Extender `atlas-sidebar-layout.test.ts` con casos que incluyan:

- viewport/container 768, 1024, 1280, 1440;
- app rail visible/oculto;
- Atlas 320, 350 y 720;
- editor mínimo 600;
- gaps/bordes;
- ancho persistido mayor al espacio actual.

La salida debe ser `{ mode: "docked" | "overlay", atlasWidth,
remainingEditorWidth }`.

**Verificar:** 768 y 1024 actuales fallan el criterio docked.

### Paso 2: Medir el contenedor real

Usar `ResizeObserver` sobre el wrapper que contiene editor+Atlas. Pasar ese ancho
a los helpers. El cálculo no debe duplicar a mano el ancho del app rail si el
elemento observado ya lo excluye.

Corregir el límite móvil para incluir 768 o, preferiblemente, hacer que la misma
decisión por presupuesto gobierne el modo.

**Verificar:** resize de ventana/app rail actualiza modo sin loop de layout.

### Paso 3: Implementar overlay adaptativo

Reutilizar el estilo absoluto que ya existe por debajo de `md`. Cuando
`mode=overlay`, el editor conserva 100% del contenedor y Atlas flota con
`w-[min(560px,calc(100%-24px))]`.

Conservar:

- drawer montado;
- chat/foco/scroll;
- ancho regular preferido;
- collapsed/full controls;
- separación visual y backdrop/dismissal adecuados.

No escribir el ancho temporal clamped sobre la preferencia persistida.

**Verificar:** cambiar 1440→1024→1440 conserva el ancho elegido y el chat.

### Paso 4: Hacer la toolbar resiliente

Clasificar acciones primarias/secundarias. Mantener las primarias y mover las
secundarias a overflow según el ancho observado. No ocultar una acción sin ruta
alternativa ni dejar controles interactivos debajo de Atlas.

**Verificar:** todos los controles son alcanzables por teclado a cada ancho.

### Paso 5: Runtime y regresión de Plan 036

Matriz:

| Ancho | App rail | Atlas esperado         | Editor                |
| ----: | -------- | ---------------------- | --------------------- |
|   768 | overlay  | overlay                | ancho completo detrás |
|  1024 | visible  | overlay                | ≥600 px               |
|  1280 | visible  | docked 320–350         | ≥600 px               |
|  1440 | visible  | docked/redimensionable | ≥600 px               |
|  1920 | visible  | docked hasta 720       | ≥600 px               |

En cada uno probar abrir/cerrar, collapse, focus, drag, snap, teclado, reload y
toolbar.

## Comandos de verificación

```bash
pnpm --filter=web test:unit -- --run \
  apps/web/helpers/atlas-sidebar-layout.test.ts
pnpm --filter=web check:types
pnpm --filter=web build
```

## Criterios de terminado

- [x] 768 exactos nunca usa tres columnas.
- [x] 1024 no reduce el editor por debajo del mínimo útil.
- [x] Docked sólo se activa con ≥600 px restantes.
- [x] Preferencia de ancho sobrevive al cambio overlay↔docked.
- [x] Toolbar no se oculta detrás de Atlas ni causa overflow horizontal.
- [x] Resize/snap/teclado de Plan 036 siguen funcionando.
- [x] Matriz 768/1024/1280/1440/1920 queda registrada.
- [x] Tests, types y build pasan.

## Resultado de ejecución — 2026-07-31

- El modo se decide con el ancho real del contenedor observado por
  `ResizeObserver`, no con el viewport completo.
- A 768 px o cuando quedarían menos de 600 px para Docs, Atlas usa overlay y
  conserva la preferencia de ancho para volver a docked al recuperar espacio.
- El ancho docked se reduce antes de sacrificar el canvas; resize, snap, teclado,
  rail y focus de Plan 036 se conservan.
- La toolbar y sus grupos aceptan shrink/overflow horizontal sin quedar debajo
  del drawer.
- Los 31 tests del helper cubren los anchos de la matriz y la suite Web completa
  pasó con 114 tests; typecheck y build pasaron.
- En producción a 1470×780: docked 350 px; resize por teclado hasta 612 px dejó
  exactamente 600 px en el panel de Docs; `Home` restauró 350 px; colapsar dejó
  52 px y reabrir conservó 350 px; focus usó 1.158 px y restauró el split; no
  hubo overflow horizontal.
- La matriz autenticada real, con alto 780 px, pasó sin overflow horizontal:
  768 overlay/Docs 710 px; 1024 overlay/Docs 720–766 px; 1280 docked/Docs
  616 px; 1440 docked/Docs 720–830 px; 1920 docked/Docs 720–1.310 px.

## Condiciones de STOP

- El modo adaptativo desmonta el drawer o pierde el chat.
- La medición produce oscilación continua docked↔overlay.
- Para alcanzar 600 px se ocultan acciones sin alternativa accesible.
- La solución reescribe o elimina la preferencia de ancho de Plan 036.
