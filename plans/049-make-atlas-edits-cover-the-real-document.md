# Plan 049: Hacer que Atlas edite el documento real

> **Instrucciones para ejecución:** diseñar primero el contrato
> título+cuerpo+estructura y sus pruebas. No simular el título como un H1 dentro
> del JSON del cuerpo.
>
> **Drift check (ejecutar primero):**
> `git diff --stat 0cb42cdc533a..HEAD -- packages/editor/src/core/hooks/use-collaborative-editor.ts packages/editor/src/core/helpers/editor-ref.ts apps/web/core/components/pages/editor/editor-body.tsx apps/web/core/store/pages/page-editor-info.ts apps/web/core/components/agent-chat/agent-chat-drawer.tsx apps/api/plane/app/views/agent/doc_write.py apps/api/plane/app/views/agent/chat.py`
> `apps/api/plane/app/views/agent/chat.py` ya tiene cambios locales de throttling
> y formato; preservarlos. Detenerse si se superponen con el endpoint doc-write.

## Estado

- **Prioridad:** P0
- **Esfuerzo:** L
- **Riesgo:** HIGH
- **Depende de:** Plan 048
- **Categoría:** bug / contrato de producto
- **Planeado en:** commit `0cb42cdc533a`, 2026-07-30
- **Ejecución:** DONE EN IMPLEMENTACIÓN/CI, 2026-07-31; validación del rollout productivo pendiente

## Por qué importa

Una orden explícita de traducir todo el documento, incluido el título, tradujo
cuatro bloques del cuerpo y dejó el título en inglés. Además, los saltos internos
del bloque de prioridades se aplanaron. “Todo el documento” no puede ser una
promesa parcial y silenciosa.

## Estado actual

- El cuerpo vive en el campo Yjs `default`; el título vive en `title`.
- `EditorBody` conserva un `titleEditorRef` privado y registra sólo el ref del
  cuerpo en `PageEditorInstance`.
- `getDocument()` y `getMarkDown()` serializan únicamente el editor del cuerpo.
- `ChatThread` recibe `activeDocTitle` como string y
  `activePageEditorRef` como superficie editable.
- El payload usa `document_json`/`document_markdown` del cuerpo.
- `_document_blocks_from_json` reduce cada bloque a texto plano y devuelve como
  máximo 80.
- El test “title H1 block is included” usa un heading sintético en el body, por
  lo que no cubre la arquitectura real.

## Contrato objetivo

Atlas recibe un snapshot versionado del Doc:

```ts
type AtlasDocumentSnapshot = {
  version: string;
  title: { json: JSONContent; text: string };
  body: { json: JSONContent; markdown: string };
  manifest: Array<{
    surface: "title" | "body";
    blockId: string;
    nodeType: string;
    text: string;
    structure: unknown;
  }>;
};
```

Cada propuesta identifica `surface` y `targetBlockId`. El título se revisa
inline en el título; el cuerpo conserva la revisión actual. Una operación de
traducción/reemplazo que no cambia estructura modifica hojas de texto dentro de
la estructura existente para conservar:

- tipo de bloque;
- listas y niveles;
- hard breaks;
- marks/enlaces;
- attrs que no son contenido traducible.

Una orden de reorganización sí puede proponer estructura nueva, validada contra
el schema del editor.

Para documentos mayores al límite de contexto, el servidor procesa chunks con
un manifest completo y reporta progreso/cobertura. Nunca emite éxito de
“entire_document” si quedaron bloques sin inspeccionar.

## Alcance

**Dentro:**

- snapshot combinado y refs de título/cuerpo;
- tipos/payload/eventos doc-write versionados;
- propuestas dirigidas a título o cuerpo;
- preservación estructural en translate/find-replace;
- estrategia explícita para >80 bloques;
- tests unitarios e integración reales.

**Fuera:**

- reemplazo español rápido (Plan 050, aunque consumirá este contrato);
- skeleton visual (Plan 051);
- imágenes, tablas complejas y cambios de layout visual no soportados hoy;
- edición de Sheets/Briefs fuera del editor Doc.

## Pasos

### Paso 1: Escribir tests de contrato que fallen

Añadir casos para:

1. título real en campo `title` + body en `default`;
2. “translate the entire document, including the title”;
3. párrafo con hard breaks y bold/link;
4. lista anidada;
5. Doc de 81 y 160 bloques;
6. versión de snapshot obsoleta;
7. respuesta con `surface` o `blockId` inválido.

Eliminar o renombrar el test sintético de H1 para que no afirme cubrir título
real.

**Verificar:** los casos de título/estructura/>80 fallan antes del cambio.

### Paso 2: Exponer un bridge seguro de documento

Registrar ambos refs en `PageEditorInstance` o exponer un `AtlasDocumentBridge`
desde `EditorBody`. El bridge debe:

- capturar título+cuerpo de la misma versión lógica de Y.Doc;
- devolver snapshot y selection;
- iniciar/actualizar/resolver revisión por superficie;
- rechazar propuestas de un snapshot stale;
- no reemplazar el Y.Doc completo para una edición normal.

No acceder al DOM del título desde el drawer.

**Verificar:** unit test del bridge con campos `title` y `default`.

### Paso 3: Versionar el payload y los eventos

Sustituir el payload ambiguo por `document_snapshot` y añadir
`surface`, `snapshot_version` y `coverage` a propuestas/eventos. Mantener
compatibilidad temporal en el servidor si existe un cliente desplegado de una
versión anterior.

Validar schema, tamaño por bloque y IDs. Una propuesta inválida debe generar un
error recuperable, no caer silenciosamente a inserción.

**Verificar:** tests de serialización, validación y compatibilidad.

### Paso 4: Preservar estructura en ediciones textuales

Para translate/find-replace, construir un manifest de hojas de texto por path y
aplicar sólo reemplazos de texto sobre el nodo original. No reconstruir un
paragraph desde una cadena plana.

Para reorganización, aceptar `content_json` validado o el Markdown-lite actual,
pero declarar que es una operación estructural.

**Verificar:** round-trip conserva hard breaks, marks, attrs y forma de listas.

### Paso 5: Cubrir documentos largos sin éxito parcial

Elegir y documentar una estrategia:

- chunking secuencial por bloques con cobertura acumulada; o
- rechazo explícito antes de escribir si el tamaño no puede procesarse.

La opción recomendada es chunking con un límite total defensivo, progreso
`processed/total` y una sola sesión de review. Si falla un chunk, mantener las
propuestas recibidas como borrador y mostrar que la cobertura es incompleta.

**Verificar:** 160 bloques aplicables producen cobertura 160/160 o un error
explícito antes de “completed”; nunca 80/160 marcado como éxito.

### Paso 6: Smoke de traducción real

Crear un Doc con:

- título en inglés;
- H2;
- párrafo con bold/link/hard breaks;
- lista anidada;
- más de 80 bloques en una segunda corrida.

Pedir traducción completa, aceptar, recargar y confirmar título, cuerpo y
estructura en dos clientes.

## Comandos de verificación

```bash
cd apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane \
POSTGRES_PASSWORD=plane POSTGRES_DB=plane \
REDIS_URL=redis://localhost:6379 \
WEB_URL=http://localhost:3000 APP_BASE_URL=http://localhost:3000 \
.venv/bin/python -m pytest plane/tests/unit/agents/test_doc_write_*.py -q

cd ../../
pnpm --filter=@plane/editor test:unit
pnpm --filter=@plane/editor check:types
pnpm --filter=web test:unit
pnpm --filter=web check:types
```

## Criterios de terminado

- [x] El título real participa en snapshot, propuesta, revisión y aplicación.
- [x] “Entire document” cubre título y 100% de bloques aplicables.
- [x] Translate/find-replace conserva estructura y marks no editados.
- [x] Documentos >80 bloques no terminan con éxito parcial silencioso.
- [x] Propuestas stale o con IDs inválidos no se aplican.
- [x] Aceptar, rechazar y recargar produce el mismo resultado en dos clientes.
- [x] Tests API/editor/web y typechecks pasan.

## Resultado de ejecución — 2026-07-31

- El payload y los eventos usan un snapshot versionado con superficies
  `title`/`body`; el título tiene ref real, revisión y aplicación propia.
- Find/replace modifica hojas de texto del JSON original y conserva marks,
  enlaces, hard breaks, attrs y estructura de listas.
- El límite silencioso de 80 bloques se reemplazó por chunks de 80 con cobertura
  acumulada y límite defensivo explícito de 400 bloques.
- Si un stream falla después de emitir propuestas, Atlas cancela la propuesta
  incompleta, conserva las completas, emite cobertura incompleta y no envía
  `session_completed`.
- Los tests cubren título real, 160 bloques, hard breaks, marks, listas,
  snapshot/surface y targets stale.
- El cliente Web nuevo está desplegado y envía el snapshot multi-superficie,
  pero la API de producción continuó comportándose como la versión anterior
  después del push. Por eso título, chunks, cobertura y error parcial todavía
  no tienen evidencia E2E desplegada.
- El smoke con dos clientes también queda pendiente hasta recuperar el
  WebSocket: el fallback guardó cambios, pero no los propagó en vivo.
- La sonda posterior con un término inexistente todavía devolvió el copy
  antiguo y creó una propuesta falsa después de más de ocho segundos. La
  propuesta se rechazó sin modificar el documento; esto confirma que el
  bloqueo es el rollout de API.
- Se añadió una prueba de colaboración con servidor HocusPocus y dos
  `HocuspocusProvider` WebSocket reales. La transacción de aceptación actualiza
  `title` y `default`, converge en el segundo cliente y conserva exactamente el
  mismo estado al destruirlo y conectar un tercer cliente.
- La suite live termina con 37 pruebas, incluida la convergencia/reconexión; API
  termina con 83 pruebas enfocadas, editor con 13 y Web con 121.
- El criterio funcional queda cerrado y se publica con el commit de este
  cierre. Confirmar el rollout de API/live en producción sigue siendo un gate
  operativo independiente.

## Condiciones de STOP

- La solución duplica el título dentro del body para hacerlo editable.
- Aplicar una propuesta requiere reemplazar todo el Y.Doc y puede borrar
  ediciones concurrentes.
- El nuevo contrato no puede coexistir durante el rollout web/API.
- Los cambios locales existentes en `chat.py` serían sobrescritos.
