# Plan 054: El Storybook como fuente única del sistema de diseño

> **Instrucciones para ejecución:** ejecutar las fases en orden. Las fases 1 y 2
> son bloqueantes: migrar usos (fase 3) antes de resolver los duplicados (fase 1)
> significa migrar hacia un componente que quizá se borre después.
>
> **Drift check (ejecutar primero):**
> `git diff --stat -- packages/ui/src/design-system packages/propel/src/button packages/propel/src/icon-button packages/tailwind-config/index.css .oxlintrc.json`
> Detenerse si el catálogo (`packages/ui/src/design-system/`) ya no existe o si
> `@plane/ui` volvió a exportar un `Button` propio.

> **Registro de sesión:** el punto de retorno para continuar (qué se hizo, qué falta,
> y las trampas que costaron tiempo) está en
> [`054-SESSION-LOG.md`](054-SESSION-LOG.md).

## Estado

- **Prioridad:** P1
- **Esfuerzo:** L (fraccionable — cada fase entrega valor sola)
- **Riesgo:** BAJO en fases 0–2, MEDIO en fase 3 (toca ~110 vistas)
- **Depende de:** —
- **Categoría:** Design system / DX
- **Planeado en:** 2026-08-25
- **Ejecución:** fases 0, 1, 2 y 4 COMPLETADAS 2026-08-25. Fase 3 EN CURSO: 81/127
  icon-buttons migrados, los 70 `type=` cerrados, **ratchet a cero** (todo `@plane/ui`
  documentado) y build estático funcionando (451 stories). El build destapó **tres
  duplicados más** que el escaneo por imports no veía porque un lado tenía cero
  consumidores: Badge y Tabs → propel, Collapsible → `@plane/ui`.
  Pendiente: 46 icon-buttons, 59 `title=`→Tooltip, 16 overlays, Popover y el destino
  del deploy.

## Por qué importa

Cada vez que se construye una feature nueva se reinventan comportamientos que ya
existen. Medido sobre `apps/web`, `apps/space` y `apps/admin`:

- **674** `<button>` crudos, de los cuales **128** son icon-buttons a mano con
  **28 tratamientos de hover distintos** — mientras `IconButton` existe.
- **42** `title=` nativos sobre controles, teniendo `<Tooltip>`.
- **16** archivos montan su propio overlay de modal, teniendo `ModalCore`.

La causa no es indisciplina. Es que **no había dónde mirar**: había dos Storybooks
compitiendo por el puerto 6006, ninguno documentaba cuándo usar qué, y las
convenciones establecidas (baseline de headers, tiers de z-index, clases `t-*`)
sólo existían como conocimiento tribal.

## Estado actual (lo ya hecho, no repetir)

- `Button` consolidado: una sola implementación en `@plane/propel/button`. El
  `Button` legacy de `@plane/ui` fue borrado y hay regla `no-restricted-imports`
  que impide reintroducirlo.
- `t-focus` añadido en `packages/tailwind-config/index.css` — el sistema no tenía
  ningún indicador de foco (fallo WCAG 2.4.7 global). `Button` e `IconButton` lo
  llevan en su clase base.
- `loading` en `Button`/`IconButton` ahora renderiza spinner y marca `aria-busy`;
  antes sólo deshabilitaba.
- Catálogo único en `packages/ui/src/design-system/` sobre el puerto 6006. Vive
  en `ui` y no en `propel` porque `ui → propel` es la dirección de dependencias:
  es el único paquete que puede renderizar ambas capas en vivo.
- Stories existentes: `Buttons` (8 páginas), `Component Catalog` (5 páginas),
  `Philosophy`.

## Comportamiento objetivo

Cuando alguien va a construir una vista nueva, abre el Storybook y encuentra —
sin preguntar a nadie — qué componente resuelve cada slot, qué variantes tiene,
cómo se comporta y cómo se compone la página. Sólo inventa un componente si el
catálogo demuestra que no existe.

---

## Fase 0 — Guardarraíles (S, sin riesgo) — ✅ HECHO

Hacer que el estándar se sostenga solo antes de invertir en contenido.

1. Extender `no-restricted-imports` en `.oxlintrc.json` a todos los duplicados
   con ganador claro, con mensaje que apunte al catálogo:
   - `@plane/propel/avatar` → usar `@plane/ui`
   - `@plane/propel/menu` → usar `CustomMenu` de `@plane/ui`
   - `@plane/propel/skeleton` → usar `Loader` de `@plane/ui`
   - `Tooltip` desde `@plane/ui` → usar `@plane/propel/tooltip`
2. Añadir al `AGENTS.md` una línea: antes de crear un componente nuevo, revisar
   `pnpm --filter @plane/ui storybook`.

**STOP:** no restringir `Card`/`Table`/`Popover` todavía — no tienen ganador
(fase 1).

## Fase 1 — Resolver los duplicados (M, riesgo bajo) — ✅ HECHO salvo Popover

Seis conceptos están implementados por separado en ambos paquetes. No son
wrappers; es código paralelo que ya empezó a divergir.

| Slot | Canónico | Acción |
| --- | --- | --- |
| Spinner | `@plane/propel` | Es un primitivo y el `Button` de propel ya depende de él. Las dos implementaciones **renderizan idéntico** (`fill="currentFill"` es inválido y hereda el mismo accent), así que migrar los 39 usos es visualmente neutro. |
| Tooltip | `@plane/propel` (124 vs 2) | Migrar los 2 y borrar el de `ui` |
| Dropdown | `@plane/ui` `CustomMenu` (113 vs 1) | Migrar 1 y borrar `@plane/propel/menu` |
| Avatar | `@plane/ui` (46 vs 4) | Migrar 4 y borrar el de propel |
| Skeleton | `@plane/ui` `Loader` | `@plane/propel/skeleton` tiene **0 usos** — borrar |
| Card | `@plane/propel` ✅ | Eran copias idénticas salvo el import de `cn`. Primitivo puro. Borrado el de `ui` |
| Table | **ambos, a propósito** ✅ | No era duplicado: propel = primitivos composicionales, `ui` = renderer genérico `data`/`columns`. Distinto nivel de abstracción |
| Popover | `@plane/propel` (decidido) ⏳ | El de `ui` usa headlessui+react-popper y **no portalea** (un ancestro `overflow-hidden` lo recorta). Migración **diferida**: 2 consumidores, ambos color pickers en formularios/kanban, y el cambio headlessui→base-ui necesita verificación visual en la app autenticada |

**Criterio para decidir Card/Table/Popover, y regla permanente:** `propel` =
primitivo sin lógica de dominio; `ui` = compuesto que puede conocer conceptos de
la app. Aplicar esa regla y borrar el otro lado. Escribirla en el catálogo para
que la siguiente duda se resuelva sola.

**STOP:** cada borrado va en su propio commit, con `pnpm --filter web check:types`
verde antes de seguir al siguiente.

## Fase 2 — Completar el catálogo (M, sin riesgo) — ✅ HECHO

Documentar lo que existe. **Esta es la fase que cumple el objetivo**; las demás
la habilitan o la aprovechan.

1. **Layout** — hoy sin documentar, y es lo que más se reinventa:
   - `Header` (37 usos), `Row` (38), `ContentWrapper` (12), `Breadcrumbs` (51).
   - El baseline de chrome: los cuatro header strips comparten 56px / centerline
     28. La banda de tabs debe quedarse en `h-14`.
   - Scrollers de contenido: sin padding superior propio (van pegados bajo el
     header) + la utilidad `.scroll-shadow`.
2. **Behaviors** — convenciones que hoy sólo se conocen por haberlas sufrido:
   - Tiers de z-index: los poppers portaleados a `body` necesitan `z-[120]` para
     superar el `z-[100]`/`z-[110]` de `ModalCore`.
   - Sistema de movimiento `t-*`: `t-colors`, `t-press`, `t-focus`, `t-dropdown`,
     `t-field`. Se ajustan en `tailwind-config`, nunca en el componente hoja.
   - Trampas de containing block: un `transform` en un ancestro captura los
     poppers `position: fixed`; un `mask-image` los recorta.
3. **Empty states** — hay tres compitiendo (`SimpleEmptyState` 12, `EmptyState`
   11, `DetailedEmptyState` 9) sin criterio. **Definir cuándo va cada uno** y
   documentarlo; si dos son redundantes, fusionarlos. Convención vigente: glifo
   Solar duotono gris, cero ilustraciones; los estados filtrados llevan glifo de
   búsqueda + "Clear filters".
4. **Forms** — `Input`, `CustomSelect`, `CustomSearchSelect`, `ToggleSwitch`:
   variantes, estados de error y de disabled, más el criterio para elegir entre
   `CustomSelect` / `CustomSearchSelect` / `CustomMenu`. ✅ **HECHO** — cerró los
   huecos `form-fields`, `dropdown` y `modals` del ratchet (10 → 7).
5. **Feedback** — `setToast` y sus tipos; cuándo toast vs modal vs inline.

**Entregable por sección:** ejemplo renderizado en vivo + tabla de variantes +
un par Do/Don't tomado de un caso real del repo, no inventado.

## Fase 3 — Migrar los usos incoherentes (L, riesgo medio) — 🔄 EN CURSO

**Hecho:** `ghost` recalibrado (texto `tertiary → primary`, fondo alpha intacto);
variante `success-outline` añadida a `IconButton`; su prop `icon` ampliada de
`FC` a `ComponentType` para aceptar componentes de clase; **81 de 127**
icon-buttons migrados vía codemod.

**Lección para los 46 restantes — el typecheck NO basta.** El codemod introdujo
tres regresiones que compilaban limpias y sólo aparecieron con una auditoría de
props eliminadas contra el diff:

1. Descartó un `onClick` multilínea (anidación > 3 niveles, fuera del alcance del
   regex) dejando **muerto** el botón "Comment" del bubble-menu del editor.
2. Descartó `className` condicional, perdiendo el **estado activo** de dos toggles
   (`view-mode-toggle`, `workspace-docs-root`).
3. Convirtió un `<Checkbox>` de selección que no era un icon-button.

Cualquier lote futuro debe correr esa auditoría de props antes de darse por bueno.


Sólo después de la fase 1, para no migrar hacia algo que se borrará.

Orden por retorno:

1. **Recalibrar la variante `ghost` de `IconButton` primero.** El hover ad-hoc
   dominante es `hover:bg-layer-1 hover:text-primary` (53 casos) pero `ghost` usa
   `hover:bg-layer-transparent-hover`. Una línea, y 53 migraciones dejan de tener
   diferencia visual. **Sin esto, la migración de la fase 3.2 cambia el aspecto
   de la app.**
2. 128 icon-buttons a mano → `IconButton` (+33 `aria-label` que faltan).
   Concentrados: `agent-chat-drawer` (12), `sheet-editor` (9), `calendar-root`
   (5), `flow-canvas` (5), `wiki-settings-modal` (5), `bookmark-board` (5).
3. ~~70 `<button>` sin `type=`~~ ✅ **HECHO**: 61 seguros por lote + 9 revisados a
   mano por estar dentro de un `<form>` (tres de ellos llamaban `preventDefault()`
   justamente para compensar el submit accidental). De paso apareció un
   `<button>` **anidado dentro de otro** en el onboarding — HTML inválido, ahora `<span>`.
4. ~~`animate-pulse` → `Loader`; `animate-spin` → `Spinner`~~ **DESCARTADO**: al
   inspeccionar el código, los `animate-pulse` son la librería de esqueletos a
   medida de `core/components/ui/loader/*` y los `animate-spin` son iconos que
   giran a propósito. El conteo original tomó una clase de utilidad como prueba de
   reinvención; no lo era.
5. 42 `title=` sobre `<button>`/`<a>` → `<Tooltip>` + `aria-label`. **No tocar**
   los 11 `title=` sobre texto truncado: ahí es el uso correcto.
6. 16 overlays/`Dialog` a mano → `ModalCore`; 6 `Menu` de headlessui →
   `CustomMenu`.
7. `t-focus` a los `<button>` que legítimamente sigan crudos (celdas de grid,
   nodos de canvas, días de calendario).

**STOP:** 2, 4 y 5 son mecánicos y admiten lotes grandes. 6 es caso por caso —
cada overlay a mano puede tener una razón; leerla antes de reemplazar.

## Fase 4 — Mantenerlo vivo (S, el que decide si esto perdura) — ✅ HECHO salvo publicar

Sin esto, el catálogo envejece y volvemos al punto de partida.

1. **Regla de aceptación:** un componente nuevo en `packages/ui` o
   `packages/propel` no se da por terminado sin su story. Añadirlo al `AGENTS.md`
   junto a la regla ya existente sobre `EDITOR_CAPABILITIES`.
2. **Test de cobertura:** ✅ `packages/ui/src/design-system/catalog-coverage.test.ts`
   (`pnpm --filter @plane/ui test:unit`). Es un **ratchet**: los 10 componentes sin
   story de hoy quedan registrados en `KNOWN_GAPS_UI` y sólo pueden salir de la
   lista, nunca entrar. Falla si (a) llega un componente nuevo sin story, (b)
   reaparece un duplicado ya consolidado, o (c) se cierra un hueco sin quitarlo de
   la lista. Verificado que muerde en las tres direcciones.
3. **Publicar el catálogo.** `pnpm --filter @plane/ui build-storybook` ✅ funciona
   (451 stories, 9.6 MB en `packages/ui/storybook-static`, verificado sirviéndolo).
   Requirió silenciar `MODULE_LEVEL_DIRECTIVE` en el rollup del preview: varias deps
   de propel traen `"use client"` y el build estático escalaba el aviso a error.
   **Falta sólo el destino** — crear el proyecto en Vercel apuntando a esa carpeta;
   es una acción en la cuenta de Miguel, no la ejecuto yo.
4. ~~Retirar el Storybook de `propel`~~ ✅ **HECHO**: borrado su `.storybook`, y el
   catálogo de `ui` lee también `../../propel/src/**` para que las stories de
   primitivos no queden huérfanas.

---

## Verificación

- `pnpm --filter web check:types` verde tras cada fase.
- El catálogo levanta y todas las stories renderizan:
  `pnpm --filter @plane/ui storybook`.
- Tras la fase 3: recuento de `<button>` crudos por debajo de 550 (los ~120
  legítimamente bespoke), y `grep` de `title=` sobre `button|a` en cero.
- Tras la fase 4: el test de cobertura falla si se borra una story a propósito.

## Decisiones que necesitan a Miguel

Estas bloquean partes del plan y no las decido yo:

1. **Card / Table / Popover** — qué capa se queda cada uno (fase 1).
2. **Empty states** — si los tres tienen razón de existir o se fusionan (fase 2.3).
3. **Escala de tamaños de botón** — `sm` = 20px y `base` = 24px quedan por debajo
   del mínimo de 24px de WCAG 2.5.8. Es coherente con la densidad del producto,
   pero difícil de defender en táctil. Cambiarla mueve toda la app, por eso está
   fuera de este plan hasta que lo decida.
