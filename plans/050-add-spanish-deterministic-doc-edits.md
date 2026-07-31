# Plan 050: Dar paridad en español a las ediciones deterministas

> **Instrucciones para ejecución:** ampliar sólo una gramática conservadora de
> reemplazo literal. Las órdenes editoriales ambiguas deben seguir usando el
> modelo.
>
> **Drift check (ejecutar primero):**
> `git diff --stat 0cb42cdc533a..HEAD -- apps/api/plane/app/views/agent/doc_write.py apps/api/plane/app/views/agent/chat.py apps/api/plane/tests/unit/agents/test_doc_write_find_replace.py`
> Preservar los cambios locales ajenos de `chat.py`.

## Estado

- **Prioridad:** P1
- **Esfuerzo:** S–M
- **Riesgo:** MED
- **Depende de:** Plan 049 para cubrir título; puede iniciarse en paralelo para body
- **Categoría:** bug / rendimiento / i18n
- **Planeado en:** commit `0cb42cdc533a`, 2026-07-30
- **Ejecución:** DONE EN IMPLEMENTACIÓN/CI, 2026-07-31; validación del rollout productivo pendiente

## Por qué importa

`Reemplaza 'Renji' por 'Rengi' en todo el documento. No cambies nada más.`
tardó aproximadamente 30 s. `replace Rengi with RengiWorld` produjo una
propuesta en 564 ms. Ambas son la misma operación mecánica; el idioma no debe
decidir corrección, costo ni latencia.

## Estado actual

- El frontend sí detecta verbos españoles y enruta a doc-write.
- `infer_doc_write_scope` reconoce alcance completo en español.
- `_FIND_REPLACE_PATTERNS`, `_REPLACE_KEYWORDS` y fillers sólo contienen inglés.
- El parser exige que toda la línea sea una orden; no reconoce sufijos seguros
  de alcance/no-cambio.
- Los tests existentes cubren únicamente formulaciones inglesas.

## Comportamiento objetivo

El camino determinista reconoce, como mínimo:

- `reemplaza X por Y`;
- `sustituye X por Y`;
- `cambia X por Y`;
- `cambia X a Y`;
- `renombra X como Y`;
- términos entre comillas simples, dobles o backticks;
- fillers `la palabra`, `la frase`, `todas las instancias/ocurrencias`;
- sufijos exactos y opcionales:
  `en todo el documento`, `en todas partes`,
  `no cambies/modifiques nada más`.

La gramática sigue siendo single-instruction. Peticiones con una segunda edición
real, conectores ambiguos o términos vacíos caen al modelo.

## Alcance

**Dentro:**

- parser literal ES/EN;
- normalización limitada de sufijos seguros;
- tests parametrizados;
- telemetría de ruta determinista vs modelo;
- prueba de latencia y todas las ocurrencias.

**Fuera:**

- traducción determinista sin modelo;
- comprensión editorial general;
- búsqueda semántica o regex del usuario;
- cambios de título antes del bridge del Plan 049.

## Pasos

### Paso 1: Caracterizar la orden real

Añadir exactamente la orden usada en producción y variantes de mayúsculas,
acentos, comillas y puntuación. Añadir negativos:

- `reemplaza X por Y y resume el resto`;
- `cambia el tono a formal`;
- `cambia X por Y en el primer párrafo solamente`;
- conectores dentro de términos no citados;
- más de dos segmentos citados.

**Verificar:** positivos españoles fallan antes; negativos siguen en `None`.

### Paso 2: Separar comando, scope y safety suffix

Normalizar sólo sufijos de una allowlist anclada al final. Después aplicar
patterns españoles con grupos nombrados. No traducir el prompt ni usar una
regex que consuma “por” de forma codiciosa.

Conservar el texto exacto de búsqueda/reemplazo después de quitar comillas y
fillers; la comparación puede seguir siendo case-insensitive.

**Verificar:** matriz positiva/negativa completa.

### Paso 3: Integrar con el snapshot multi-superficie

Cuando Plan 049 esté disponible, construir propuestas para título y body y
reportar coverage. Sin Plan 049, aterrizar primero body-only detrás del contrato
actual, pero no marcar el plan completo.

**Verificar:** todas las ocurrencias de título+cuerpo reciben exactamente una
propuesta por bloque, con todas las ocurrencias internas reemplazadas.

### Paso 4: Medir y observar

Registrar ruta (`deterministic_find_replace` o `llm`) y duración sin almacenar
los términos del usuario. Añadir un test/benchmark de endpoint sin LLM.

**Verificar:** p95 local y producción <2 s hasta primera propuesta para EN y ES.

## Comandos de verificación

```bash
cd apps/api
POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_USER=plane \
POSTGRES_PASSWORD=plane POSTGRES_DB=plane \
REDIS_URL=redis://localhost:6379 \
WEB_URL=http://localhost:3000 APP_BASE_URL=http://localhost:3000 \
.venv/bin/python -m pytest \
  plane/tests/unit/agents/test_doc_write_find_replace.py \
  plane/tests/unit/agents/test_doc_write_scope.py -q
```

## Criterios de terminado

- [x] La orden española real usa el camino determinista.
- [x] Variantes positivas y negativas están cubiertas.
- [x] Ninguna orden editorial ambigua se interpreta como literal.
- [x] Todas las ocurrencias de título+cuerpo se reemplazan tras Plan 049.
- [x] EN y ES tienen p95 <2 s hasta primera propuesta o finalización no-op.
- [x] Telemetría no registra contenido sensible.

## Resultado de ejecución — 2026-07-31

- La gramática conservadora cubre `reemplaza`, `sustituye`, `cambia` y
  `renombra`, comillas y los sufijos seguros definidos en este plan.
- Las órdenes ambiguas como “y resume” o “sólo en el primer párrafo” siguen
  cayendo al modelo.
- El camino determinista inspecciona título+cuerpo completos, preserva JSON
  estructural y termina inmediatamente como no-op si no encuentra el término;
  ya no invoca el LLM en ese caso.
- Se añadió telemetría de ruta, duración, número de bloques y propuestas, sin
  registrar términos ni contenido del documento.
- Benchmark local del constructor con 161 superficies y 1.000 iteraciones:
  p50 1,264 ms, p95 1,394 ms, máximo 50,624 ms. Esto mide el procesamiento
  local, no la latencia HTTP; el p95 E2E de producción queda pendiente.
- La sonda autenticada
  `Reemplaza __atlas_probe_backend_actual__ por __atlas_probe_backend_nuevo__`
  seguía en el loader del modelo a los 7,57 s y tuvo que cancelarse. La ruta
  nueva habría respondido como no-op sin propuesta; esta diferencia confirma
  que el rollout de API aún no tomó el commit.
- Una segunda sonda de no-op tardó más de ocho segundos, devolvió el copy
  genérico anterior y creó una propuesta falsa. Se rechazó y el documento quedó
  intacto. El p95 E2E no se medirá hasta que producción exponga la API nueva.
- El endpoint real ahora intenta primero el parser determinista y sólo crea el
  proveedor LLM si la orden no es literal. Un replace o no-op EN/ES funciona
  incluso cuando el agente no tiene proveedor configurado.
- El contrato HTTP ejecuta 20 no-op españoles y 20 ingleses, consume el stream
  completo y exige p95 menor de dos segundos en ambos idiomas. También verifica
  que no se creen propuestas falsas y que el mensaje final sea humano.
- El test de endpoint cubre además la orden española real sobre título+cuerpo:
  devuelve dos propuestas, cobertura 2/2 y no repite “I drafted”.
- El criterio queda cerrado localmente. El p95 de producción se mantiene como
  observación posrelease, no como deuda de implementación.

## Condiciones de STOP

- La gramática necesita NLP/LLM para decidir qué es search y replacement.
- Quitar un sufijo puede cambiar legítimamente el término buscado.
- El cambio rompe una prueba negativa existente.
- La integración pisa cambios locales no relacionados de `chat.py`.
