---
titulo: Cómo trabajar con Claude sobre este vault
resumen: Runbook para pedirle cosas a Claude gastando pocos tokens y dejando el vault al día.
tags: [operacion, meta]
estado: activo
actualizado: 2026-08-07
---

# Cómo trabajar con Claude sobre este vault

## Al pedir algo

Nombrá la carpeta o la nota cuando la sepas. `"mirá 20-decisiones y decime si
esto contradice algo"` cuesta una fracción de `"revisá el proyecto"`, porque la
segunda versión obliga a rastrear el vault entero.

Si no sabés dónde está, pedí que se busque por índice: `"buscá en el índice si
hay algo sobre X"`. Eso lee un solo archivo.

## Al cerrar una tarea

Pedí explícitamente que se actualice el vault. No pasa solo:

> "Actualizá las notas que correspondan y regenerá el índice."

Lo que se decidió va a `20-decisiones/` como nota nueva. Lo que cambió de un dato
existente se edita en la nota que ya existe — no se crea una segunda nota con la
versión nueva, porque después conviven dos verdades.

## Qué mantener corto

`CLAUDE.md` y `00-indice/INDICE.md` se leen en cada sesión: son costo fijo.
Todo lo que se agregue ahí se paga siempre. Si algo se consulta de vez en cuando,
va en una nota, no en el índice.

## Señales de que el vault se está degradando

- Notas con `actualizado` de hace meses y `estado: activo`.
- Resúmenes del tipo "notas varias sobre el proyecto" — no permiten decidir si
  abrir la nota, así que se termina abriendo todo.
- Más de una nota respondiendo la misma pregunta con datos distintos.
- `50-bitacora/` con información que debería estar en una nota temática.

## Comandos

```bash
# Regenerar el índice tras cambios en las notas
python3 scripts/indexar.py

# Ver qué notas están desactualizadas o en borrador
grep -rn "estado: borrador" vault/
```
