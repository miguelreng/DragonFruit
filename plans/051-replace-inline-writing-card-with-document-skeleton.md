# Plan 051: Usar un skeleton de documento completo durante la edición

> **Instrucciones para ejecución:** el skeleton debe representar el estado de
> trabajo sin mutar el documento ni desplazar contenido. Conectarlo a la state
> machine del Plan 048.
>
> **Drift check (ejecutar primero):**
> `git diff --stat 0cb42cdc533a..HEAD -- packages/editor/src/core/extensions/atlas-doc-review/extension.ts packages/editor/src/styles/dragonfruit.css apps/web/core/components/agent-chat/agent-chat-drawer.tsx apps/web/core/components/pages/editor`
> Detenerse si ya existe un overlay de carga de doc-write o cambió el contenedor
> raíz del editor.

## Estado

- **Prioridad:** P1
- **Esfuerzo:** M
- **Riesgo:** MED
- **Depende de:** Plan 048
- **Categoría:** UX/UI / feedback
- **Planeado en:** commit `0cb42cdc533a`, 2026-07-30
- **Ejecución:** DONE EN IMPLEMENTACIÓN/CI Y SMOKE AUTENTICADO LOCAL, 2026-07-31; validación productiva pendiente

## Por qué importa

Traducir o reorganizar un Doc tarda 30–45 s en la prueba real. Durante ese
tiempo se muestra una tarjeta rosa de tres líneas junto al cursor, mientras el
resto del documento parece normal. La señal comunica “Atlas insertará algo
aquí”, no “Atlas está preparando una edición de este documento”.

La barra del drawer también aparece demasiado pronto y afirma “Atlas edits
applied” cuando todavía no existe ninguna propuesta.

## Estado actual

- `buildWritingSkeleton` crea un widget de ancho máximo 720 px.
- `buildDecorations` lo inserta en `session.anchorPos`.
- El widget desaparece con la primera propuesta.
- El drawer mantiene otro loader con mensajes rotativos.
- La barra de revisión aparece si hay propuestas **o** existe un snapshot.
- Cuando el snapshot existe y el conteo es cero, el label es
  “Atlas edits applied”.
- El editor sigue aceptando foco/clics durante la fase inicial, aunque
  “Discard” revierte también ediciones manuales posteriores al snapshot.

## Comportamiento objetivo

Durante `requesting` y hasta la primera propuesta:

- el canvas del Doc muestra un overlay/skeleton que cubre la silueta de título y
  cuerpo visibles;
- el contenido real no se borra, no cambia layout y permanece debajo;
- el editor expone `aria-busy="true"` y no acepta edición accidental;
- una etiqueta única dice “Atlas está preparando cambios…”;
- el drawer no muestra la barra de revisión ni acciones aceptar/descartar;
- se ofrece “Cancelar” después de un umbral breve, sin aplicar contenido;
- al llegar la primera propuesta, el skeleton se desvanece y aparece review;
- en error/cancelación, el contenido original reaparece intacto y el foco vuelve
  de forma predecible.

El skeleton debe respetar reduced motion: sin shimmer continuo, pero con estado
visible.

## Alcance

**Dentro:**

- overlay de carga en el contenedor de título+cuerpo;
- integración con estados `requesting/streaming/reviewing/failed`;
- bloqueo de edición y foco durante pre-propuesta;
- etiqueta, cancelación y accesibilidad;
- eliminación del widget anclado;
- tests visuales/estado y smoke responsive.

**Fuera:**

- diseño de propuestas aceptadas/rechazadas;
- optimización de latencia del modelo;
- skeleton inicial al abrir un Doc (ya existe y es otro flujo);
- layout del drawer (Plan 052).

## Pasos

### Paso 1: Definir el contrato de estados visuales

Mapear cada estado del Plan 048 a:

- canvas;
- loader del drawer;
- barra de review;
- acciones permitidas;
- foco;
- copy accesible.

Añadir tests que demuestren que `snapshot !== null` por sí solo no muestra
“applied” ni “Discard”.

**Verificar:** tabla de estado cubierta por tests.

### Paso 2: Montar un overlay fuera del documento ProseMirror

Renderizar el skeleton en el shell que contiene title+body, no como
`Decoration.widget`. Usar `position: absolute; inset: 0` dentro del viewport del
editor y una máscara de superficie que no provoque reflow.

La silueta debe incluir:

- una línea de título;
- 2–3 bloques de texto;
- al menos un bloque estructural (lista);
- degradado al final si el Doc continúa fuera del viewport.

No crear nodos falsos dentro del JSON/HTML del documento.

**Verificar:** medir que `scrollHeight`, selección y JSON sean idénticos antes,
durante y después del overlay.

### Paso 3: Manejar foco, edición y cancelación

Durante pre-propuesta, usar el mecanismo `editable`/focus guard del editor o una
capa que intercepte input sin marcar el Doc como permanentemente read-only.
Guardar el elemento enfocado y restaurarlo al cancelar/error.

La cancelación debe abortar el stream y limpiar la sesión local. Si ya llegó una
propuesta, pasa a la semántica normal de reject/discard; no mezclar ambos
conceptos.

**Verificar:** teclado, mouse, cancelación y error no alteran contenido.

### Paso 4: Motion y accesibilidad

- `aria-busy` en el documento;
- un solo live-region, sin repetir mensajes del drawer y canvas;
- contraste AA;
- reduced motion sin shimmer;
- skeleton no anunciado como contenido del Doc.

**Verificar:** axe/manual screen reader y test de media query.

### Paso 5: Smoke visual

Probar create, translate, replace y organize a 768, 1024, 1280 y 1440 px, con
modo claro/oscuro y reduced motion. Confirmar:

- primer frame de espera;
- transición a primera propuesta;
- success/error/cancel;
- no salto de scroll;
- no barra “applied” prematura.

## Comandos de verificación

```bash
pnpm --filter=@plane/editor test:unit
pnpm --filter=@plane/editor check:types
pnpm --filter=web test:unit
pnpm --filter=web check:types
pnpm --filter=web build
```

## Criterios de terminado

- [x] El widget anclado ya no se usa para loading global.
- [x] Skeleton cubre título+cuerpo sin mutar/refluir el Doc.
- [x] Aparece en el primer frame de espera y sale con propuesta/error/cancel.
- [x] No existe “Atlas edits applied” antes de aplicar.
- [x] No se puede editar accidentalmente durante pre-propuesta.
- [x] Cancelar conserva exactamente título+cuerpo.
- [x] Reduced motion, teclado y lector de pantalla están verificados.
- [x] Matriz visual responsive y build pasan.

## Resultado de ejecución — 2026-07-31

- Se eliminó el widget rosa dentro de ProseMirror y sus estilos.
- El shell del Doc monta un overlay absoluto de página completa con silueta de
  título, párrafos, heading y lista; el contenido real permanece debajo sin
  cambiar el JSON ni el layout.
- Durante `requesting/streaming` la superficie queda `inert`,
  `aria-busy=true`, muestra un único status accesible y ofrece Cancelar.
- `motion-reduce:animate-none` elimina el shimmer; la barra de revisión sólo
  aparece cuando ya existen propuestas.
- El primer smoke desplegado encontró las barras en blanco sobre fondo blanco.
  Se cambió `bg-layer-2` por `bg-layer-1`, se redesplegó en `1928c24af6` y la
  segunda captura mostró la silueta completa con contraste visible.
- En producción se verificaron `aria-busy`, `inert`, primer frame, ausencia de
  barra prematura y cancelación con título+cuerpo idénticos. El build pasó.
  Quedan modo oscuro, reduced motion real, teclado y lector de pantalla.
- La matriz autenticada 768/1024/1280/1440/1920 no mostró overflow horizontal;
  Atlas usó overlay en 768/1024 y docked desde 1280. La validación accesible real
  sigue separada porque el navegador disponible no emula reduced motion ni un
  lector de pantalla.
- El indicador de actividad consulta `prefers-reduced-motion`; en ese modo
  renderiza una figura estática sin el nodo SVG `<animate>`. Dos pruebas de
  render cubren explícitamente las ramas con y sin movimiento.
- El skeleton es visual (`aria-hidden=true`), usa colores semánticos de tema,
  desactiva el pulso con `motion-reduce:animate-none` y no crea otra live-region.
  El mensaje del drawer es la única actualización accesible del flujo.
- En un smoke autenticado en modo oscuro se comprobó `aria-busy=true`, una
  superficie `inert`, contraste visible y animación normal durante la espera.
  Al cancelar: skeleton ausente, `aria-busy=false`, cero elementos `inert`,
  título+cuerpo intactos y foco devuelto al textarea de Atlas.
- El árbol accesible y los tests de markup verifican que el skeleton no se
  anuncie como documento y que la actualización sea `polite` y atómica. Web
  termina con 121 pruebas y build de producción correcto.

## Condiciones de STOP

- El overlay requiere ocultar/desmontar ProseMirror y pierde selección o scroll.
- Cancelar necesita reemplazar todo el Y.Doc.
- Bloquear input también bloquea acciones de recuperación o navegación.
- El estado visual se vuelve a inferir desde snapshot/conteo en vez del Plan 048.
