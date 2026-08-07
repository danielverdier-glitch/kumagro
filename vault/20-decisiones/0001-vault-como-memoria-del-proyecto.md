---
titulo: Usar un vault de Obsidian como memoria del proyecto
resumen: El contexto de kumagro vive en notas atómicas versionadas, no en el historial de chat.
tags: [decision, meta]
estado: activo
actualizado: 2026-08-07
---

# 0001 — Usar un vault de Obsidian como memoria del proyecto

## Contexto

El contexto de kumagro estaba solo en conversaciones. Cada sesión nueva arrancaba
de cero: había que reexplicar qué es el proyecto, qué se decidió antes y por qué.
Eso cuesta tokens en cada arranque y, peor, el contexto se pierde cuando la
conversación se corta.

## Decisión

El contexto vive en un vault de Obsidian versionado en este repo (`vault/`),
organizado en notas atómicas con un `resumen` de una línea cada una. Un índice
generado automáticamente concentra esos resúmenes, y `CLAUDE.md` obliga a leer el
índice primero y solo después las notas que la tarea necesita.

## Alternativas descartadas

- **Un `CLAUDE.md` largo con todo adentro** — se carga entero en cada sesión,
  aunque la tarea use el 5%. Crece hasta volverse el costo fijo más caro.
- **Notion o Google Docs** — no versiona junto al código y obliga a una llamada
  externa para leer cada documento.
- **Vault en la raíz del repo** — Obsidian indexaría `.git`, código y artefactos
  de build. Por eso el vault vive en `vault/`.

## Consecuencias

**Más fácil:** arrancar una sesión leyendo ~1 archivo; ver el historial de
decisiones con `git log`; editar las notas desde la app de Obsidian en cualquier
dispositivo.

**Más difícil:** hay que mantener disciplina de frontmatter y correr
`scripts/indexar.py` al agregar notas. Si el índice queda desactualizado, el
sistema pierde su ventaja: se vuelve a leer todo por las dudas.
