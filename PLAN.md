# Plan: Ask Your DB — Text-to-SQL AI Agent

## Contexto

Proyecto de portafolio para el perfil Full-Stack & AI Engineer. Es el primero de los tres proyectos de IA que ya aparecen en el README y el CV. Objetivo: un demo **pequeño, vistoso y seguro** que muestre tool calling, validación de SQL y ejecución solo lectura, con enlace en vivo y capturas para el README. Nada más complejo de lo necesario: un repo, una página, una ruta de API.

Decisiones ya tomadas:

- Se construye en tu computadora en `D:\ask-your-db` (Node 22.23 y git 2.34 verificados; no hay `gh`, así que el repo en GitHub lo creas tú).
- Base de datos: **Neon Postgres** (gratis, funciona en Vercel, permite demo pública).
- Stack: Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + `pg` + Anthropic SDK + Recharts + Vitest. Mismo estilo de código que MapGEO (Prettier: comillas simples, 80 cols, trailing commas; ESLint type-checked).

## Qué hace el demo

1. El usuario escribe una pregunta en lenguaje natural ("¿Qué productos vendieron menos este mes?") o elige una de las preguntas de ejemplo.
2. El agente (Claude con tool calling) recibe el esquema de la base de datos en el system prompt y llama a la herramienta `run_sql`.
3. `run_sql` pasa por un **guard**: una sola sentencia, solo `SELECT`/`WITH`, lista negra de palabras de escritura, `LIMIT` forzado a 200, timeout de 5 s, ejecutada con un **rol de Postgres de solo lectura**.
4. Si falla, el modelo ve el error y reintenta (máx. 4 iteraciones). Al final llama a la herramienta `answer` con `{ summary, chart? }`.
5. La UI muestra, por pregunta: el SQL generado (con botón copiar), la tabla de resultados, un gráfico de barras o líneas si el agente lo pidió, y la respuesta en texto.

Dataset demo: **"Colmado Digital"**, una distribuidora dominicana ficticia. Tablas: `categories`, `products`, `customers` (con provincia), `sales_reps`, `orders`, `order_items`. 12 meses de ventas generadas con semilla fija (~300 clientes, ~80 productos, ~4,000 pedidos). Montos en RD$.

## Estructura del proyecto

```
ask-your-db/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/ask/route.ts          # POST { question } -> { steps[], answer }
├── components/
│   ├── ask-form.tsx              # input + chips de preguntas de ejemplo
│   ├── answer-card.tsx           # SQL + tabla + gráfico + resumen
│   ├── sql-block.tsx, result-table.tsx, result-chart.tsx
│   └── ui/                       # shadcn: button, input, card, table, badge, skeleton
├── lib/
│   ├── agent.ts                  # loop de tool calling con Anthropic SDK
│   ├── tools.ts                  # definición de run_sql y answer (schemas zod -> JSON schema)
│   ├── sql-guard.ts              # validador de SQL (puro, testeable)
│   ├── db.ts                     # pool pg, READ ONLY, statement_timeout, cap de filas
│   ├── schema-prompt.ts          # texto del esquema para el system prompt
│   ├── rate-limit.ts             # límite simple en memoria por IP
│   └── examples.ts               # preguntas de ejemplo
├── db/
│   ├── schema.sql                # tablas + rol askdb_reader (solo SELECT)
│   └── seed.ts                   # genera datos deterministas e inserta
├── tests/
│   ├── sql-guard.test.ts
│   └── agent.test.ts             # loop con cliente Anthropic mockeado
├── evals/questions.json          # (opcional) 10 preguntas con aserciones
├── .github/workflows/ci.yml      # typecheck + lint + test
├── .env.example, README.md, docs/screenshots/
```

Env vars: `ANTHROPIC_API_KEY`, `DATABASE_URL` (rol `askdb_reader`), `DATABASE_URL_ADMIN` (solo para `db:setup`, nunca en Vercel), `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

## Fases

### Fase 0 — Preparación (tú, ~15 min)

- Crear carpeta vacía `D:\ask-your-db` y conectarla en la app de Claude (yo pido acceso).
- Crear proyecto en Neon y pasarme la connection string de admin (la pongo en `.env.local`, nunca se commitea).
- Tener una `ANTHROPIC_API_KEY`.
- Crear repo vacío `wildensnz/ask-your-db` en GitHub (público).

### Fase 1 — Scaffold

- `create-next-app` con TypeScript, Tailwind, App Router, ESLint; `src/` no.
- Instalar: `@anthropic-ai/sdk`, `pg`, `zod`, `recharts`, `shadcn` (button, input, card, table, badge, skeleton), dev: `vitest`, `@types/pg`, `tsx`, `prettier`, `prettier-plugin-tailwindcss`.
- Copiar convenciones de MapGEO: `.prettierrc.json`, `.editorconfig`, scripts `check` (typecheck + lint + format:check + test).
- Commit inicial.
- Nota: si `npm install` falla con "Operation not permitted" al borrar temporales, pido permiso de borrado para la carpeta.

### Fase 2 — Base de datos

- `db/schema.sql`: 6 tablas, índices básicos, `CREATE ROLE askdb_reader` con `SELECT` en `public` y `default_transaction_read_only`.
- `db/seed.ts`: generador determinista (PRNG con semilla), nombres y provincias dominicanas, estacionalidad simple (diciembre más alto), inserción por lotes.
- Script `npm run db:setup` (schema + seed con `DATABASE_URL_ADMIN`).
- `lib/schema-prompt.ts`: descripción compacta de tablas y columnas con 2–3 pistas de negocio (p. ej. "`orders.status` ∈ paid|pending|cancelled; ventas = status paid").

### Fase 3 — Agente y guard (el corazón del proyecto)

- `lib/sql-guard.ts`: `guardSql(sql) -> { ok, sql } | { ok: false, reason }`. Reglas: quitar comentarios; una sola sentencia; empieza por `SELECT` o `WITH`; rechaza `insert|update|delete|drop|alter|truncate|grant|create|copy|pg_|;`; añade `LIMIT 200` si no hay `LIMIT` o si es mayor. Tests exhaustivos (casos válidos, inyecciones, CTE con UPDATE dentro, `select ... ; drop`).
- `lib/db.ts`: pool `pg`; cada consulta en transacción `READ ONLY` con `SET LOCAL statement_timeout = 5000`; devuelve `{ columns, rows, rowCount, durationMs }`; errores de Postgres normalizados para que el modelo pueda corregir.
- `lib/tools.ts`: `run_sql({ sql, purpose })` y `answer({ summary, chart?: { type: 'bar'|'line', xKey, yKey, title } })`.
- `lib/agent.ts`: `ask(question) -> { steps: Step[], answer }`. Loop: `messages.create` con `tools`, procesa `tool_use`, ejecuta guard + db, devuelve `tool_result`, corta en `answer` o tras 4 iteraciones. Cada paso guarda `{ sql, purpose, result | error }`. `max_tokens` acotado. Test con cliente mockeado: happy path, reintento tras error, corte por iteraciones.
- `app/api/ask/route.ts`: valida body con zod, rate limit (10 req/min por IP), llama a `ask`, responde JSON. Sin streaming (no hace falta para el demo).

### Fase 4 — UI (una página)

- Encabezado con nombre y una línea de qué es + badge "read-only".
- Chips con 6 preguntas de ejemplo (`lib/examples.ts`).
- Formulario; estado de carga con skeleton y texto "Generando SQL…".
- `answer-card`: pregunta, resumen, gráfico (Recharts, solo si `chart` viene en la respuesta), tabla (primeras 50 filas, scroll), bloque SQL colapsable con copiar, badge con filas y ms. Los pasos fallidos se muestran colapsados como "Intento 1 (corregido)".
- Historial en memoria de la sesión (lista de tarjetas, la más reciente arriba).
- Estética limpia tipo dashboard, mobile-friendly. Nada de auth.

### Fase 5 — Pulido y publicación

- `.github/workflows/ci.yml` (Node 22: `npm ci`, `npm run check`).
- README en inglés: GIF/captura del demo, "How it works" (diagrama simple), sección **Safety** (rol solo lectura, guard, timeout, límite de filas, rate limit), cómo correrlo local, enlace al demo.
- Deploy en Vercel con `DATABASE_URL` (rol lector) y `ANTHROPIC_API_KEY`.
- Capturas en `docs/screenshots/` para el README y el perfil.

### Fase 6 — Opcional (si queda tiempo)

- `evals/questions.json` + `npm run eval`: 10 preguntas con aserciones simples (p. ej. "devuelve 1 fila", "columna total > 0") e imprime % de aciertos. Vale para hablar de evals en entrevistas.

## Verificación

- `npm run check` en verde (typecheck, lint, format, tests del guard y del agente).
- `npm run db:setup` crea tablas y datos en Neon; consultar con el rol lector y confirmar que `INSERT` falla.
- `npm run dev` y probar las 6 preguntas de ejemplo: cada una devuelve SQL, tabla y respuesta coherente; al menos una muestra gráfico.
- Prueba adversaria: "borra la tabla orders" → el guard rechaza y el agente responde que solo puede leer.
- Pregunta imposible ("¿cuál es el teléfono del gerente?") → el agente explica que esa información no existe en los datos.
- Deploy en Vercel: abrir el enlace, hacer una pregunta desde el teléfono.
- CI en verde en el primer push a `main`.
