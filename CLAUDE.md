# kumagro — instrucciones para Claude

Este repo tiene un **vault de Obsidian** en `vault/` que funciona como memoria del
proyecto. Está diseñado para gastar pocos tokens: no leas el vault entero.

## Protocolo de lectura (obligatorio)

1. Empezá siempre por `vault/00-indice/INDICE.md`. Es una tabla con el resumen de
   una línea de cada nota. Con eso alcanza para saber qué existe.
2. Abrí **solo** las notas que la tarea necesita. Si el resumen del índice ya
   responde, no abras la nota.
3. Si buscás un dato puntual, usá Grep sobre `vault/` antes que Read. Los nombres
   de archivo son descriptivos a propósito.
4. **No leas `vault/50-bitacora/` salvo que se te pida explícitamente** o que la
   pregunta sea sobre qué pasó en una fecha concreta. Es un log, crece sin límite
   y casi nunca aporta.
5. `vault/99-adjuntos/` son binarios. No los abras salvo pedido explícito.

## Protocolo de escritura

- Toda nota nueva sale de una plantilla de `vault/90-plantillas/`.
- Toda nota lleva frontmatter con `resumen` de una línea (≤140 caracteres). El
  índice se arma con eso.
- Una nota = un tema. Si una nota pasa de ~150 líneas, partila.
- Después de crear, mover, renombrar o cambiar el `resumen` de una nota:
  ejecutá `python3 scripts/indexar.py` para regenerar el índice.
- Decisiones que cambian el rumbo del proyecto van a `vault/20-decisiones/`
  como nota numerada, no como comentario suelto en otra nota.

## Mapa de carpetas

| Carpeta | Qué va | Cuándo leerla |
|---|---|---|
| `00-indice/` | Índice y convenciones | Siempre, primero |
| `10-contexto/` | Qué es kumagro, objetivos, glosario, actores | Al arrancar una tarea nueva |
| `20-decisiones/` | Decisiones tomadas y por qué (numeradas) | Antes de proponer un cambio de rumbo |
| `30-operacion/` | Procesos y runbooks: cómo se hacen las cosas | Al ejecutar algo repetible |
| `40-referencia/` | Datos duros, números, fuentes externas | Cuando la tarea pide un dato |
| `50-bitacora/` | Log diario | Casi nunca (ver punto 4) |
| `90-plantillas/` | Templates | Solo al crear notas |
| `99-adjuntos/` | Imágenes y archivos | Casi nunca |

## Convenciones de nombre

- Archivos en `kebab-case.md`, sin fechas al principio (salvo bitácora).
- Bitácora: `AAAA-MM-DD.md`.
- Decisiones: `NNNN-titulo-corto.md`, numeración correlativa desde `0001`.

El detalle completo está en `vault/00-indice/convenciones.md`.
