# Plan 054 — registro de sesión (design system)

> Punto de retorno para continuar desde Orca u otra sesión. El plan completo está en
> [`054-design-system-single-source-of-truth.md`](054-design-system-single-source-of-truth.md);
> esto es el estado vivo y las decisiones ya tomadas, para no re-litigarlas.

**Sesión Claude:** https://claude.ai/code/session_01RcJzr5XxwWQY4HCcEJUP6z
**Última actualización:** 2026-09-01 · rama `main` · nada commiteado todavía

## Verde ahora mismo

`apps/web`, `apps/space`, `apps/admin` y `packages/editor` en **0 errores de tsc**.
`pnpm --filter @plane/ui test:unit` → 4/4. Ambos paquetes compilan.

## Hecho

- **Un solo `Button`.** Borrado el legacy de `@plane/ui`; regla `no-restricted-imports`
  en `.oxlintrc.json` impide reintroducirlo.
- **`t-focus`** en `packages/tailwind-config/index.css` — el sistema no tenía ningún
  indicador de foco (fallo WCAG 2.4.7 global). `Button` e `IconButton` lo llevan.
- **`loading` real**: renderiza spinner y marca `aria-busy`; antes sólo deshabilitaba.
- **9 slots duplicados consolidados** — Button, Tooltip, Card, Spinner → `@plane/propel`;
  Avatar, CustomMenu, Loader, Collapsible → `@plane/ui`; Badge y Tabs → propel.
  `Table` se queda en ambos **a propósito** (propel = primitivos composicionales,
  `ui` = renderer `data`/`columns`).
- **Catálogo único** en `packages/ui` (`pnpm --filter @plane/ui storybook`, puerto 6006).
  451 stories. El Storybook de propel fue retirado y sus stories se leen desde
  `../../propel/src/**`. Build estático verificado (9.6 MB).
- **Ratchet a cero**: `catalog-coverage.test.ts` — falla si llega un componente sin story,
  si reaparece un duplicado, o si se cierra un hueco sin registrarlo.
- **Los 70 `<button>` sin `type=`** → 0. De paso: un `<button>` anidado dentro de otro en
  el onboarding (HTML inválido) ahora es un `<span>`.
- **109 de 127 icon-buttons migrados** a `<IconButton>`.

## Decisiones tomadas (no volver a discutir)

| Tema | Decisión |
|---|---|
| Dónde vive el catálogo | `packages/ui` — es el único que puede importar ambas capas sin ciclo (`ui → propel`) |
| Regla de capas | propel = primitivo sin dominio; `ui` = compuesto que puede conocer conceptos de la app |
| `ghost` de IconButton | Recalibrado a `text-tertiary → text-primary` en hover (lo que la app ya hacía en 53 sitios). Fondo alpha intacto |
| Escala de tamaños | **No se toca.** `sm`=20px cumple WCAG 2.5.8 por la excepción de espaciado |
| Empty states | Los tres se quedan: Simple (sin acción) → Detailed (con botones) → Section (inline) |
| `animate-pulse` / `animate-spin` | **DESCARTADO.** No eran reinvenciones: los pulse son la librería de esqueletos a medida de `core/components/ui/loader/*`; los spin son iconos que giran a propósito |

## Pendiente

1. ~~18 icon-buttons a mano.~~ **Cerrado 2026-09-01** — pero *no* migrándolos.
   Al abrirlos uno a uno, los ~10 «migrables» tampoco lo eran de verdad: todos llevan
   `className` que anula por completo las variantes de `IconButton` (geometría propia,
   `bg` transparente) y varios pasan `strokeWidth` al icono, que `IconButton` no reenvía.
   Meterlos dentro obligaba a escribir `className="bg-transparent hover:bg-transparent"`
   — indirección sin consolidación, y cambios visuales no pedidos.
   **Lo que sí faltaba era lo accesible**, así que los 18 recibieron `t-focus` (+ `aria-label`
   / `aria-pressed` donde no lo había), sin tocar el marcado ni un píxel:
   `password.tsx` ×2, `wiki-settings-modal` ×2, `sheet-editor` ×2 (align + paleta de color
   de pestaña), `calendar-root` (cerrar evento), `agent-chat-drawer` ×2 (borrar chat),
   toolbars de `space`/`lite-text`/`sticky-editor`/`pages` (con `aria-pressed` del estado
   activo), `code-block-node-view` (copiar), `attachment-menu`, `workspace-docs-root`,
   `my-tasks-section`, `onboarding/profile`.
   `issues/select/base.tsx` y `bookmark-board.tsx` ya cumplían y no se tocaron.
   Sigue en **109 de 127** migrados: los 18 restantes se quedan como `<button>` a
   propósito. Verificado: `web`/`space`/`editor` en 0 errores de tsc, `@plane/ui` 4/4.
2. **51 `title=` → `<Tooltip>`** en 19 archivos. 20 están en la toolbar del sheet-editor:
   envolver cada uno mete un elemento en el DOM y puede descolocar la barra. Necesita
   verse, no barrerse.
3. **16 overlays / `Dialog` de headlessui → `ModalCore`.** Caso por caso.
4. **Popover** (2 archivos, color pickers). Decidido a favor de propel — el de `ui` no
   portalea y un `overflow-hidden` lo recorta — pero la migración headlessui→base-ui
   necesita verificación visual en la app autenticada.
5. **Publicar el catálogo estático.** El build funciona; falta crear el proyecto en Vercel
   apuntando a `packages/ui/storybook-static`. Acción en la cuenta de Miguel.

## Regla aprendida (importante)

**El typecheck NO es red de seguridad para un codemod de JSX.** Migrar 81 botones produjo
tres regresiones que compilaban limpias:

1. Un `onClick` multilínea descartado (anidación > 3 niveles) dejó **muerto** el botón
   "Comment" del bubble-menu del editor.
2. `className` condicional descartado → perdido el **estado activo** de dos toggles.
3. Un `<Checkbox>` de selección convertido aunque nunca fue un icon-button.

La raíz es que **TypeScript es ciego a esto**: en `IconButton` todas las props menos
`icon` son opcionales, así que perder un `onClick` en el swap es código válido.

Esa auditoría manual ya está **automatizada** en `packages/codemods/audit-jsx-prop-loss.mjs`
(2026-09-01), y es la regla en `AGENTS.md` para cualquier codemod de esta forma:

```bash
node packages/codemods/audit-jsx-prop-loss.mjs              # working tree vs HEAD
node packages/codemods/audit-jsx-prop-loss.mjs --ref main --verbose
```

Parsea el TSX con el propio compilador (`ts.createSourceFile`) en ambos lados del diff
y compara atributos por nombre + valor. Dos niveles para que la señal no se ahogue:
**pérdida** (el nombre bajó de cuenta en el archivo → algo se quedó sin handler) frente a
**reescritura** (misma cuenta, otro valor → normalmente deliberado, sólo con `--verbose`).
Ignora `type="button"` porque todos los primitivos lo traen por defecto, pero **no**
`type="submit"`. Aparte cuenta los `className={cn(…)}` aplanados, que es justo cómo se
perdió el estado activo de los dos toggles.

**Encontró dos regresiones más que la auditoría a mano no vio**, ambas verdes bajo `tsc`:

1. El chevron de subtareas había perdido su `rotate-90` al expandir, en
   `issue-layouts/list/block.tsx` y en `issue-layouts/spreadsheet/issue-row.tsx`.
   `aria-expanded` correcto, la flecha simplemente no giraba. Arreglado con `iconClassName`.
2. Peor: el botón de filtro de columna del sheet (`sheet-editor.tsx`) perdió a la vez su
   posicionamiento (`absolute … -translate-y-1/2`, se salía de la celda de cabecera) y el
   `text-accent-primary` de `isColumnFiltered` — ya no se veía qué columnas tenían filtro.

Con eso, de las 5 regresiones del lote **3 las encontró el script y 2 la revisión a mano**.
Quedan 20 avisos vs `HEAD`, todos verificados como intencionados (el composer de columnas
kanban es trabajo sin commitear de Miguel; el resto son condicionales que sí se movieron
bien al contenedor o al icono).

Ojo con falsos positivos de trabajo sin commitear en el mismo archivo: el script dice qué
desapareció, no si querías que desapareciera. Recuperar valores originales de
`git show HEAD:<archivo>`, nunca de memoria.

## Artefactos de revisión

- Triaje de icon-buttons: https://claude.ai/code/artifact/e469eb44-c84d-47d0-bf9a-559beb843b91
- Bench de migración (con glifos reales): https://claude.ai/code/artifact/3669a7a6-69df-4169-9e57-ba2bcc4bbeea
