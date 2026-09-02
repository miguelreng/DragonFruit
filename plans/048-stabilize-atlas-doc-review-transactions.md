# Plan 048: Estabilizar las transacciones de revisión de Atlas

> **Instrucciones para ejecución:** corregir primero la integridad de
> aceptar/rechazar y luego el estado visual. No cambiar el formato de propuestas
> ni el contrato de la API en este plan.
>
> **Drift check (ejecutar primero):**
> `git diff --stat 0cb42cdc533a..HEAD -- packages/editor/src/core/extensions/atlas-doc-review apps/web/core/components/agent-chat/agent-chat-drawer.tsx packages/editor/src/core/helpers/editor-ref.ts`
> Detenerse si otra implementación ya reemplazó los comandos internos de
> `view.dispatch` o el modelo de estado de revisión.

## Estado

- **Prioridad:** P0
- **Esfuerzo:** M
- **Riesgo:** HIGH
- **Depende de:** ninguno
- **Categoría:** bug / integridad de edición
- **Planeado en:** commit `0cb42cdc533a`, 2026-07-30
- **Ejecución:** BLOQUEADO POR INFRAESTRUCTURA, 2026-07-31; smoke individual pasa, pero producción no tiene servidor live/HocusPocus para cerrar el gate de dos clientes

## Por qué importa

En producción, “Accept all” y “Reject all” generaron repetidamente
`RangeError: Applying a mismatched transaction`. Aunque el Doc corto terminó
visualmente bien, esta es la operación que conserva o descarta contenido real.
Una falla parcial bajo streaming, colaboración o doble clic puede dejar
propuestas huérfanas o contenido duplicado.

## Estado actual

- `extension.ts:150-240` crea transacciones desde `view.state` y despacha con
  `view.dispatch`.
- `extension.ts:480-531` llama esos helpers dentro de comandos Tiptap que ya
  reciben `state`, `tr` y `dispatch`.
- Los controles individuales del DOM también llaman los mismos helpers.
- El drawer borra `atlasReviewSnapshot` antes de saber si aceptar/rechazar
  terminó con éxito.
- La UI infiere fases a partir de dos valores independientes
  (`snapshot !== null` y conteo de propuestas); por eso puede mostrar un estado
  imposible.
- No hay prueba del editor que intercale una actualización colaborativa entre
  streaming y resolución.

## Comportamiento objetivo

- Cada acción de revisión usa exactamente una transacción basada en el estado
  que el command manager entregó.
- No hay `view.dispatch` anidado dentro de un comando Tiptap.
- Los handlers DOM construyen y despachan una sola transacción desde el
  `view.state` actual.
- Aceptar/rechazar es idempotente mientras una resolución está en curso; doble
  clic o eventos repetidos no aplican contenido dos veces.
- El snapshot sólo se descarta después de una resolución confirmada.
- La sesión tiene un estado explícito:
  `idle | requesting | streaming | reviewing | resolving | applied | rejected | failed`.
- Un error deja una acción recuperable y un mensaje claro; nunca afirma que los
  cambios fueron aplicados.

## Alcance

**Dentro:**

- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts`
- helpers/tipos de revisión bajo
  `packages/editor/src/core/extensions/atlas-doc-review/`
- `packages/editor/src/core/helpers/editor-ref.ts`
- `packages/editor/src/core/types/editor.ts`
- `apps/web/core/components/agent-chat/agent-chat-drawer.tsx`
- pruebas unitarias de transacciones y estado

**Fuera:**

- título del Doc y contrato multi-superficie (Plan 049);
- parser español (Plan 050);
- diseño del skeleton (Plan 051);
- formato o prompt de las propuestas.

## Pasos

### Paso 1: Reproducir el error con un harness determinista

Crear un estado ProseMirror con tres bloques objetivo y propuestas insertadas.
Ejecutar aceptar/rechazar all:

1. sin cambios concurrentes;
2. después de una transacción remota simulada;
3. dos veces seguidas;
4. con un target eliminado o movido;
5. con mezcla de replace/delete/insert.

La prueba debe fallar con el comando actual o incluir una caracterización que
demuestre el doble dispatch. Si `@plane/editor` sigue sin runner unitario, añadir
un `test:unit` mínimo con Vitest al package en vez de dejar la regresión sin
cobertura.

**Verificar:** el caso de doble dispatch reproduce el `RangeError` antes del fix.

### Paso 2: Convertir los helpers en constructores de una sola transacción

Hacer que aceptar/rechazar individual, seleccionado y all operen con los
argumentos `{ state, tr, dispatch }` del comando. Resolver targets y rangos
contra ese mismo `state`, aplicar deletes de mayor a menor y anexar un solo meta
de plugin.

Los handlers DOM pueden invocar una función que reciba explícitamente
`view.state` y despachar una sola vez. No deben llamar un comando que vuelva a
despachar dentro de otro command manager.

**Verificar:** todas las pruebas del Paso 1 pasan y cada acción registra un solo
dispatch.

### Paso 3: Hacer la resolución idempotente y observable

Introducir `resolving` y deshabilitar controles mientras la transacción está en
curso. Los métodos del ref deben devolver un resultado tipado
(`applied | no-op | stale | failed`) o una promesa equivalente, no `void`.

Sólo después de `applied`/`rejected`:

- limpiar snapshot;
- ocultar controles;
- emitir toast de éxito.

En `stale`/`failed`, mantener el snapshot y ofrecer “Try again” o una salida
segura.

**Verificar:** doble clic produce una sola resolución y un fallo simulado no
borra el snapshot.

### Paso 4: Unificar el estado de sesión

Reemplazar la inferencia por conteo+snapshot con un reducer o state machine
pequeño. Las transiciones permitidas deben estar probadas. En particular:

- `requesting` no muestra “applied”;
- `streaming` puede tener cero o más propuestas;
- `reviewing` requiere al menos una propuesta pendiente;
- `applied/rejected` sólo ocurre después de la resolución;
- `failed` no elimina una ruta de recuperación.

**Verificar:** tests de transición y Web typecheck.

### Paso 5: Smoke colaborativo

Con dos clientes en el mismo Doc:

1. iniciar una edición de Atlas;
2. editar otro párrafo desde el segundo cliente mientras llegan propuestas;
3. aceptar all;
4. repetir y rechazar all;
5. repetir con selección parcial y controles individuales;
6. reconectar uno de los clientes durante la revisión.

Capturar consola y estado final de ambos clientes.

## Comandos de verificación

```bash
pnpm --filter=@plane/editor test:unit
pnpm --filter=@plane/editor check:types
pnpm --filter=web test:unit
pnpm --filter=web check:types
```

Si el Paso 1 crea por primera vez el script `test:unit` de editor, el plan debe
dejarlo documentado en `packages/editor/package.json`.

## Criterios de terminado

- [x] El repro automatizado falla antes y pasa después del fix.
- [x] Ningún comando Tiptap hace `view.dispatch` anidado.
- [x] Individual/selected/all comparten la misma semántica transaccional.
- [x] Doble clic y comando repetido son idempotentes.
- [x] Snapshot y controles sólo cambian después de resultado confirmado.
- [x] 100 ciclos aceptar/rechazar con updates intercalados producen 0
      `mismatched transaction`.
- [ ] Smoke de dos clientes deja el mismo documento en ambos.
- [x] Editor y Web typechecks pasan.

## Resultado de ejecución — 2026-07-31

- Los comandos individual, selected y all construyen una sola transacción desde
  el `EditorState` entregado por Tiptap; se eliminó el dispatch anidado.
- Los refs devuelven `applied | no-op | stale`; targets eliminados, movidos o
  con texto cambiado no se aplican.
- Los deletes bulk se ordenan de mayor a menor y los targets duplicados se
  eliminan una sola vez.
- La sesión usa fases explícitas y conserva snapshot, título y cobertura en el
  estado del Doc incluso al limpiar o cambiar la conversación.
- El test automatizado ejecutó 100 ciclos frescos aceptar/rechazar sin
  `mismatched transaction`; la combinación exacta de dos clientes y updates
  remotos sigue siendo un gate de runtime.
- Verificación: 13 tests de editor y 114 tests web pasaron; ambos typechecks y
  los builds editor/web pasaron.
- En producción se aceptó, guardó, recargó, revirtió y rechazó una sustitución
  real. No apareció ningún `mismatched transaction` nuevo en la consola.
- El smoke de dos pestañas no pudo completar el update intercalado: la edición
  remota se guardó, pero la primera pestaña no la recibió en vivo y registró la
  pérdida del WebSocket. Ambas pestañas se limpiaron y terminaron idénticas tras
  recargar. Producción no tiene un servidor live/HocusPocus configurado y
  `live.dragonfruit.sh` no resuelve; el gate colaborativo queda bloqueado por
  infraestructura, no por trabajo pendiente en la transacción local.

## Condiciones de STOP

- Resolver el error requiere desactivar colaboración o reemplazar el Y.Doc.
- Un target stale sólo puede “resolverse” borrando contenido no propuesto.
- Las pruebas no pueden distinguir un dispatch del doble dispatch actual.
- Hay cambios locales ajenos superpuestos en los archivos objetivo y su
  intención no puede preservarse.
