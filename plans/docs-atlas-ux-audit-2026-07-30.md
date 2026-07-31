# Auditoría UX/UI: Docs editor + Atlas

**Fecha:** 2026-07-30

**Base auditada:** `main` en `0cb42cdc533a`, más el estado local de solo lectura

**Entorno funcional:** producción autenticada, `https://app.dragonfruit.sh`

**Documento de prueba:** [UX Audit – Docs + Atlas – 2026-07-30](https://app.dragonfruit.sh/rengi-media/projects/7c1b5a22-91bf-469c-b197-da61483f5ec8/pages/db36d20e-8401-4894-9d18-2969ddd82e0e)

## Veredicto ejecutivo — línea base antes de correcciones

Docs + Atlas todavía no es confiable para edición cotidiana de documentos.
La capacidad base existe —Atlas traduce el cuerpo, propone reemplazos y puede
convertir texto en encabezados/listas—, pero el contrato que percibe la persona
no coincide con el comportamiento real:

- “Todo el documento” significa sólo el editor del cuerpo, no el título.
- Una traducción puede conservar las palabras y perder la estructura interna.
- Aceptar o rechazar todas las propuestas puede disparar
  `RangeError: Applying a mismatched transaction` en el editor colaborativo.
- El mismo reemplazo literal tarda ~0.56 s en inglés y ~30 s en español porque
  sólo la formulación inglesa usa el camino determinista.
- Durante la redacción aparece una tarjeta pequeña en el cursor, no un estado
  de carga del documento completo.
- A 768 px exactos, Docs sigue usando el layout de escritorio y el área editable
  quedó reducida a 134 px.

La recomendación es no añadir más tipos de edición antes de cerrar los dos P0:
transacciones de revisión confiables y un contrato de documento real que
incluya título, cuerpo y estructura.

## Resultado de ejecución — 2026-07-31

Los planes 048–052 quedaron implementados y publicados en `main` mediante:

- `7f2e8f31e7` — API de escritura completa;
- `91a9178c0f` — revisión, snapshot, state machine, skeleton y layout;
- `1928c24af6` — contraste del skeleton corregido a partir del smoke visual.

El cliente Web de `1928c24af6` terminó su despliegue de producción el
2026-07-31 a las 06:20 UTC. El push de API sí está en `origin/main`, pero las
sondas autenticadas siguieron llegando a la versión anterior del servidor; por
eso los planes que dependen del nuevo endpoint no se consideran cerrados.

### Cambios entregados

| Problema auditado                            | Resultado local                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mismatched transaction` al aceptar/rechazar | Una sola transacción por acción; resolución tipada e idempotente; targets stale no se aplican                                                           |
| “Todo el documento” excluye el título        | Snapshot versionado con título+cuerpo; propuestas, revisión, aplicación y descarte para ambas superficies                                               |
| Estructura aplanada                          | Find/replace modifica hojas de texto del JSON original; el flujo LLM recibe Markdown estructural por bloque y conserva hard breaks/marks en el renderer |
| Límite silencioso de 80 bloques              | Chunking 80×N, cobertura acumulada, límite explícito de 400 y error parcial sin falso éxito                                                             |
| Reemplazo español lento                      | Parser determinista conservador ES/EN, no-op inmediato sin LLM y telemetría sin contenido                                                               |
| Loading pequeño en el cursor                 | Skeleton absoluto de título+cuerpo, canvas bloqueado, cancelar, `aria-busy` y reduced motion                                                            |
| Estado “applied” prematuro                   | State machine explícita; la barra aparece sólo cuando hay propuestas revisables                                                                         |
| Atlas destruye el ancho de Docs              | Presupuesto basado en contenedor; overlay si quedarían menos de 600 px; 768 exactos tratado como mobile                                                 |
| Limpiar/cambiar chat pierde revisión         | Snapshot, cobertura y propuestas del título viven con el estado del Doc, no con la conversación                                                         |

Un corte del modelo a mitad de un chunk ahora cancela sólo la propuesta
incompleta, conserva las propuestas completas, expone cobertura incompleta y
termina con error recuperable. Nunca envía `session_completed` como si hubiese
revisado el documento entero.

### Evidencia automatizada y de release

- API doc-write: **71 passed**.
- Editor: **13 passed**; incluye siete regresiones de transacciones y 100 ciclos
  aceptar/rechazar sin `mismatched transaction`.
- Web: **114 passed**; incluye 31 casos de presupuesto responsive y persistencia
  del estado de revisión del Doc.
- Lint enfocado: **0 errores, 0 advertencias** en los archivos modificados.
- Typecheck de `@plane/editor` y **Web completo: pasa**.
- Builds de producción de `@plane/editor` y `web`: **pasan**.
- Benchmark local de reemplazo español sobre 161 superficies, 1.000
  iteraciones: p50 **1,264 ms**, p95 **1,394 ms**, máximo **50,624 ms** para
  parsing+construcción de propuestas. No incluye red ni persistencia.

El chequeo global `pnpm check` aún encuentra formato preexistente fuera de este
alcance en componentes de `packages/propel` y `packages/ui`. Los archivos de
Docs+Atlas pasan formato, lint, tipos, pruebas y build.

### Smoke autenticado de producción

| Prueba                                      | Resultado                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Aceptar una sustitución, guardar y recargar | **Pasa**; `Rengi` → `RengiWorld` persistió y luego se restauró                                                |
| Rechazar propuestas repetidas               | **Pasa**; cero `mismatched transaction` nuevos desde el bundle corregido                                      |
| Cambiar de chat con revisión pendiente      | **Pasa**; la barra y la propuesta permanecieron revisables                                                    |
| Skeleton en primer frame                    | **Pasa**; cubre título+cuerpo, `aria-busy=1`, `inert=1`, sin barra “applied” prematura                        |
| Cancelar durante preparación                | **Pasa**; overlay desaparece y título+cuerpo quedan idénticos                                                 |
| Contraste del skeleton en claro             | **Pasa tras corrección**; la primera versión desplegada era blanco sobre blanco y se corrigió en `1928c24af6` |
| Resize por teclado                          | **Pasa**; 320→368→612 px, límite máximo conserva 600 px del panel de Docs                                     |
| Reset, colapso y expansión                  | **Pasa**; `Home` vuelve a 350 px, colapsado 52 px y reabre en 350 px                                          |
| Focus/full                                  | **Pasa**; Docs queda `inert`/oculto, Atlas usa 1.158 px y al salir restaura 350 px                            |
| Overflow horizontal a 1470×780              | **Pasa**; `scrollWidth` se mantuvo en 1470 px                                                                 |
| Dos clientes, actualización en vivo         | **Bloqueado**; la segunda pestaña guardó su edición, pero la primera no la recibió en vivo                    |
| No-op español determinista                  | **Bloqueado por rollout API**; tras 7,57 s seguía en el loader del modelo antiguo                             |

La prueba colaborativa se limpió y ambas pestañas terminaron con el contenido
original. La consola de la nueva Web no registró nuevos
`Applying a mismatched transaction`; sí persiste el aviso de pérdida de
WebSocket y uso del mecanismo de respaldo.

### Cierre adicional de 049–051 — 2026-07-31

Los tres planes quedan **DONE en implementación y CI**:

1. **049 — documento real:** una prueba WebSocket con HocusPocus y dos clientes
   confirma convergencia de los campos reales `title` y `default`, y un tercer
   cliente reconectado recupera el mismo resultado.
2. **050 — español determinista:** el endpoint literal ya no crea el proveedor
   LLM antes de decidir la ruta. Reemplazos/no-op EN y ES funcionan sin
   configuración de modelo; 20 muestras por idioma exigen p95 HTTP local <2 s.
3. **051 — skeleton accesible:** el smoke autenticado oscuro confirma
   `aria-busy`, bloqueo `inert`, contraste, cancelación sin mutación y retorno
   de foco. Reduced motion elimina `<animate>` y el shimmer; el skeleton es
   visual y el drawer conserva una sola actualización accesible.
4. **Validación:** 83 pruebas API, 121 Web, 13 editor y 37 live pasan; types y
   builds de Web/editor/live también pasan.

El único gate restante es operativo: confirmar que el commit de cierre llegue a
la API/live productiva. Después del rollout corresponde observar 24 horas ruta,
duración, cobertura, errores parciales y targets stale; no reabre los planes
salvo que la telemetría incumpla el contrato.

## Ejecución adicional — actividad real y voz de Atlas

Se corrigieron los dos problemas nuevos reportados:

- Atlas ya no responde siempre “I drafted 1 reviewable document edit in the
  page”. El servidor genera confirmaciones breves y naturales en español o
  inglés, diferenciando traducción, título, cuerpo, cantidad y no-op. El copy
  sigue siendo preciso: habla de propuestas para revisar/aplicar y nunca afirma
  que el contenido ya fue aplicado.
- El loader dejó de rotar frases inventadas cada 1,8 segundos. Ahora muestra
  actividad comprobable emitida por el servidor: comprensión de la solicitud,
  lectura del documento, búsqueda de coincidencias, consulta de fuentes,
  preparación del chunk real, finalización y herramientas iniciadas/completadas.
  No se expone chain-of-thought ni razonamiento privado del modelo.
- El estado usa un único `role=status` con `aria-live=polite`; el indicador
  decorativo queda oculto al árbol accesible y la primera respuesta textual
  reemplaza el progreso sin duplicar loaders.

### Verificación de esta iteración

- API enfocada: **80 passed**.
- Web: **24 archivos, 117 tests passed**.
- Editor: **13 passed**.
- Typecheck de Web y editor: **pasa**.
- Builds secuenciales de editor y Web: **pasan**.
- Lint Web enfocado, Ruff y formato de los archivos tocados: **pasan**.

Los builds deben ejecutarse en secuencia: el build de editor limpia su salida,
por lo que correrlo simultáneamente con el build Web puede provocar una carrera
de resolución que no existe en el flujo normal.

### Evidencia productiva actualizada

La sonda autenticada:

`Reemplaza '__atlas_pending_probe__' por
'__atlas_pending_probe_done__' en todo el documento. No cambies nada más.`

tardó más de ocho segundos, devolvió el texto antiguo “I drafted 1 reviewable
document edit in the page” y creó una propuesta aun cuando el término no
existía. La propuesta se rechazó y el documento quedó intacto. Esto confirma
que `api.dragonfruit.sh` continúa ejecutando el backend anterior; no es una
falla del cliente nuevo ni del parser local.

La matriz productiva autenticada, a 780 px de alto, quedó así:

| Viewport | Modo Atlas | Ancho Docs observado | Overflow horizontal |
| -------: | ---------- | -------------------: | ------------------- |
|      768 | overlay    |               710 px | no                  |
|     1024 | overlay    |           720–766 px | no                  |
|     1280 | docked     |               616 px | no                  |
|     1440 | docked     |           720–830 px | no                  |
|     1920 | docked     |         720–1.310 px | no                  |

### Pendientes que requieren infraestructura o validación externa

1. Desplegar la API nueva. El repositorio no tiene un workflow activo que haga
   rollout del backend, no hay CLI/sesión de Railway o Coolify disponible y los
   deployments visibles corresponden sólo a Vercel.
2. Proveer el servicio live/HocusPocus. Producción no tiene un servidor live
   configurado y `live.dragonfruit.sh` no resuelve; sin él no existe una prueba
   honesta de sincronización simultánea entre dos clientes.
3. Después de esos dos cambios: repetir traducción/título/documento largo,
   accept/reject/reload en dos clientes, p95 productivo y observación de 24 h.
4. Ejecutar validación manual en modo oscuro, preferencia real de reduced
   motion y lector de pantalla. El contrato de código existe, pero la sesión de
   navegador disponible no permite emular esas capacidades.

## Alcance y método

Se creó un Doc de prueba claramente identificado y se ejercitaron acciones
reales desde Atlas:

1. Traducción integral inglés → español, solicitando reemplazar también el
   título.
2. Reemplazo literal en español: `Renji` → `Rengi`.
3. Reestructuración sin reescritura: insertar H2 y convertir tres elementos en
   lista con viñetas.
4. Aceptar todas las propuestas.
5. Reemplazo literal equivalente en inglés: `Rengi` → `RengiWorld`.
6. Rechazar todas las propuestas.
7. Observación del loading en editor y drawer.
8. Prueba responsive a 1470×780, 1280×800, 1024×768 y 768×768.
9. Revisión de consola y trazado de cada síntoma hasta frontend, editor
   colaborativo y API.
10. Ejecución de 59 pruebas unitarias de doc-write y 99 pruebas web existentes.

El documento quedó deliberadamente disponible como evidencia. Su cuerpo está en
español y estructurado; el título sigue en inglés. No se probaron colaboración
simultánea con dos usuarios, reconexión offline prolongada ni gestos en un
dispositivo móvil físico.

## Resultado de la matriz

| Flujo                                         | Resultado visible                                                                  | Tiempo observado | Veredicto                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------: | ----------------------------- |
| Traducir todo, incluido título                | Cuatro propuestas tradujeron el cuerpo; el título no cambió                        |            ~45 s | Falla                         |
| Preservar estructura en traducción            | Los tres renglones internos quedaron unidos en una sola línea                      |  incluido arriba | Falla                         |
| Reemplazar `Renji` por `Rengi` en español     | Reemplazo correcto mediante modelo                                                 |            ~30 s | Funciona, pero lento y frágil |
| Reemplazar `Rengi` por `RengiWorld` en inglés | Propuesta literal inmediata                                                        |           564 ms | Pasa                          |
| Insertar H2 y transformar texto en lista      | H2 y lista de tres ítems correctos                                                 |            ~45 s | Pasa                          |
| Aceptar todas                                 | El resultado se vio aplicado                                                       |        inmediato | Falla técnica silenciosa      |
| Rechazar todas                                | El resultado se vio descartado                                                     |        inmediato | Falla técnica silenciosa      |
| Loading de edición                            | Tarjeta rosa de tres líneas junto al cursor; el resto del Doc sigue normal         |  durante 30–45 s | Falla UX                      |
| Estado del drawer al iniciar                  | Mostró “Atlas edits applied” y “Discard Atlas changes” antes de existir propuestas |        inmediato | Falla                         |
| 1280 px                                       | Editor angosto pero utilizable; Atlas permanece docked                             |                — | Riesgo                        |
| 1024 px                                       | Editor ~440 px; toolbar queda por debajo/tras Atlas                                |                — | Falla                         |
| 768 px exactos                                | Columna editable de 134 px y título partido casi palabra por palabra               |                — | Falla crítica                 |

## Hallazgos priorizados

### P0 — Aceptar/rechazar propuestas no es transaccionalmente seguro

**Evidencia de producción:** al usar tanto “Accept all” como “Reject all”, la
consola registró repetidamente:

`RangeError: Applying a mismatched transaction`

El resultado visual de este Doc corto terminó siendo correcto, pero el error
ocurre en la operación que decide qué contenido se conserva. En un documento
grande, con streaming o colaboración concurrente, puede dejar una sesión de
revisión parcialmente resuelta o perder la confianza del usuario.

**Causa probable confirmada en código:** los comandos de Tiptap reciben su
propia transacción, pero `acceptAllProposals` y `rejectAllProposals` construyen
otra desde `view.state` y llaman `view.dispatch` desde dentro del comando. La
primera aplicación cambia el estado sobre el cual el command manager todavía
intenta operar.

**Plan:** [048 — Estabilizar las transacciones de revisión de Atlas](048-stabilize-atlas-doc-review-transactions.md).

### P0 — “Documento completo” no representa el documento completo

**Evidencia de producción:** la petición decía explícitamente “including the
title”; el cuerpo se tradujo y el título quedó en inglés.

**Causa confirmada:** título y cuerpo son dos campos colaborativos distintos
(`title` y `default`). Atlas recibe sólo `activePageEditorRef`, cuyo JSON y
Markdown corresponden al cuerpo. `activeDocTitle` se usa como texto contextual,
no como superficie editable ni como propuesta revisable.

El problema también afecta documentos largos y estructura rica:

- la API recorta la lista a 80 bloques sin comunicar que el alcance se volvió
  parcial;
- `_text_from_pm_node` concatena hijos con espacios, por lo que saltos duros,
  marcas y parte de la forma original no llegan al modelo;
- el test que afirma cubrir un título usa un H1 sintético dentro del JSON del
  cuerpo, distinto a la arquitectura real de producción.

**Plan:** [049 — Hacer que Atlas edite el documento real](049-make-atlas-edits-cover-the-real-document.md).

### P1 — La intención en español se detecta, pero la ejecución rápida no

La interfaz reconoce `reemplaza`, `sustituye`, `cambia` y `traduce` como
peticiones de escritura. Sin embargo, el parser determinista del servidor sólo
acepta `replace`, `swap`, `change` y `rename`. Por eso una sustitución mecánica
en español consume una llamada al modelo y tarda unas 50 veces más que su
equivalente inglés.

El parser también debe reconocer de forma conservadora sufijos seguros como
“en todo el documento” y “no cambies nada más”, sin confundirlos con el texto
de reemplazo.

**Plan:** [050 — Dar paridad en español a las ediciones deterministas](050-add-spanish-deterministic-doc-edits.md).

### P1 — El loading no representa la operación ni protege el foco

La carga actual es un `Decoration.widget` de 720 px máximo insertado en
`anchorPos`. Se percibe como un bloque nuevo que Atlas está agregando en un
punto, aunque esté traduciendo o reemplazando todo el Doc. Simultáneamente, el
drawer muestra un segundo loader con mensajes rotativos.

Además, crear el snapshot hace visible la barra de revisión antes de que exista
una propuesta, lo que produce el estado falso “Atlas edits applied” y ofrece
descartar cambios que todavía no han llegado.

**Plan:** [051 — Usar un skeleton de documento completo](051-replace-inline-writing-card-with-document-skeleton.md).

### P1 — El layout docked ignora el espacio que ya consume la navegación

El ancho máximo de Atlas se calcula como `viewport - 420`, pero ese presupuesto
no descuenta el app rail, gaps, bordes ni chrome del editor. Además,
`windowWidth < 768` trata 768 px exactos como escritorio. El resultado real fue:

- 1280 px: editor de aproximadamente 650 px;
- 1024 px: editor de aproximadamente 440 px y toolbar ocluida;
- 768 px: `contenteditable` de 134 px.

El resize de Plan 036 ya existe y sus 24 pruebas pasan; el problema nuevo no es
añadir otro resize, sino decidir cuándo el dock deja de ser viable y Atlas debe
pasar a overlay/focus.

**Plan:** [052 — Hacer adaptativo el layout Docs + Atlas](052-make-docs-atlas-layout-adaptive.md).

### P2 — El contexto visual de Atlas mezcla el Doc actual con historial ajeno

Al abrir Atlas en el Doc nuevo, el pill mostraba correctamente el documento
actual, pero el drawer reanudó automáticamente una conversación extensa con
trabajo de otros Docs. El código selecciona `sessions[0]` al abrir y sólo
actualiza los campos de contexto; no crea un límite visual ni una sesión nueva
al cambiar de documento.

Esto aumenta carga cognitiva y hace difícil saber qué mensajes están
condicionando la edición. Después de los cinco planes principales, se recomienda
probar una de estas dos soluciones:

- sesión por Doc por defecto, con acceso explícito al historial; o
- un separador “Contexto cambiado a…” que colapse mensajes anteriores y permita
  iniciar un chat limpio con un clic.

Antes de implementar, medir cuántas conversaciones reales cruzan varios Docs;
no se debe borrar historial ni romper continuidad sin esa evidencia.

### P2 — Señales de conectividad sin recuperación explicada

Durante la prueba aparecieron avisos repetidos de pérdida de WebSocket y una
falla de sincronización de contexto. El editor indicó que estaba usando el
mecanismo de respaldo y el contenido terminó guardado, por lo que no se clasifica
como fallo confirmado de datos. Aun así, el estado debería distinguir:

- cambios guardados en tiempo real;
- guardado por respaldo;
- cambios locales pendientes;
- reconexión fallida con acción de reintento.

## Qué sí funciona

- Atlas enruta correctamente órdenes de escritura en español al flujo de
  doc-write.
- La inferencia de alcance reconoce “todo el documento”.
- Las propuestas estructurales pueden producir H2 y listas correctas.
- La revisión individual y por lotes existe y el resultado es comprensible.
- El reemplazo literal determinista cubre todas las ocurrencias del cuerpo que
  recibe.
- El resize de Atlas tiene helpers, accesibilidad de teclado y persistencia.
- 59 pruebas unitarias de scope/find-replace/formato pasaron.
- La suite web disponible terminó con 99 pruebas pasadas, incluidas 24 del
  layout de Atlas.

Estas fortalezas permiten corregir el flujo sin rediseñar todo el editor.

## Secuencia de acción recomendada

1. **Plan 048 — seguridad de revisión.** Ninguna mejora visual compensa una
   transacción que puede quedar desfasada. Bloquear doble submit y formalizar el
   estado de la sesión.
2. **Plan 049 — contrato de documento.** Incluir título, cuerpo, estructura y
   cobertura explícita de documentos mayores a 80 bloques.
3. **Plan 050 — paridad en español.** Mover reemplazos mecánicos al camino
   determinista y medir latencia.
4. **Plan 051 — loading coherente.** Montarlo sobre el estado confiable del Plan
   048, no sobre la mera existencia de un snapshot.
5. **Plan 052 — layout adaptativo.** Conservar el resize de Plan 036, pero
   cambiar automáticamente a overlay cuando no quede un ancho útil.

Los planes 050, 051 y 052 pueden ejecutarse en paralelo después de 048/049
siempre que se respete el único working tree de `main`.

## Métricas de salida

El trabajo no debe darse por terminado hasta cumplir:

- 0 transacciones incompatibles en 100 ciclos aceptar/rechazar con updates
  colaborativos intercalados.
- 100% de título y bloques aplicables modificados cuando el usuario pide
  explícitamente “todo el documento”.
- Ningún documento >80 bloques termina con éxito parcial silencioso.
- Traducción conserva tipo de bloque, listas, saltos duros y marcas que no
  necesitan cambiar.
- Reemplazo literal EN/ES p95 <2 s desde enviar hasta primera propuesta.
- El skeleton aparece en el primer frame de espera, cubre título + cuerpo,
  respeta reduced motion y desaparece al llegar la primera propuesta o error.
- No se muestra “applied” antes de aplicar; todo estado y acción corresponde a
  la fase real.
- Con Atlas abierto, el editor conserva al menos 600 px cuando está docked; si
  no es posible, Atlas usa overlay/focus.
- Sin overflow horizontal ni toolbar ocluida a 768, 1024, 1280 y 1440 px.

## Evidencia técnica principal

- `apps/web/core/components/agent-chat/agent-chat-drawer.tsx`: captura y envía
  sólo el body ref; crea el snapshot antes de propuestas; reanuda la sesión más
  reciente; muestra la barra con snapshot aunque el conteo sea cero.
- `apps/web/core/components/pages/editor/editor-body.tsx`: mantiene
  `titleEditorRef` separado del ref del cuerpo.
- `packages/editor/src/core/hooks/use-collaborative-editor.ts`: usa campos Yjs
  `default` para cuerpo y `title` para título.
- `packages/editor/src/core/extensions/atlas-doc-review/extension.ts`: skeleton
  anclado y bulk actions con `view.dispatch` interno.
- `packages/editor/src/core/helpers/editor-ref.ts`: `getDocument`/`getMarkDown`
  serializan el editor del cuerpo.
- `apps/api/plane/app/views/agent/doc_write.py`: parser literal sólo en inglés,
  extracción plana y límite de 80 bloques.
- `apps/web/ce/components/workspace/content-wrapper.tsx` y
  `apps/web/helpers/atlas-sidebar-layout.ts`: breakpoint `<768` y presupuesto de
  ancho basado sólo en viewport.

## Notas de validación

Comandos ejecutados:

```bash
cd apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane \
POSTGRES_PASSWORD=plane POSTGRES_DB=plane \
REDIS_URL=redis://localhost:6379 \
WEB_URL=http://localhost:3000 APP_BASE_URL=http://localhost:3000 \
.venv/bin/python -m pytest \
  plane/tests/unit/agents/test_doc_write_scope.py \
  plane/tests/unit/agents/test_doc_write_find_replace.py \
  plane/tests/unit/agents/test_doc_write_formatting.py -q
```

Resultado: **59 passed**.

```bash
pnpm --filter=web test:unit -- --run \
  apps/web/helpers/atlas-sidebar-layout.test.ts
```

Resultado real del runner: **20 archivos, 99 tests passed**. Se observó una
advertencia de versión de Node (`22.13.1` frente a `>=22.18.0`), no un fallo de
producto.
