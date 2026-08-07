---
titulo: Convenciones del vault
resumen: Reglas de formato, nombres y frontmatter que mantienen el vault barato de leer.
tags: [meta]
estado: activo
actualizado: 2026-08-07
---

# Convenciones del vault

La regla que ordena todo lo demás: **el índice tiene que alcanzar para el 80% de
las consultas.** Si para saber algo hay que abrir tres notas, el resumen de esas
notas está mal escrito.

## Frontmatter

Todas las notas llevan este bloque arriba de todo:

```yaml
---
titulo: Rotación de lotes 2026
resumen: Qué se siembra en cada lote esta campaña y por qué.
tags: [operacion, campana-2026]
estado: activo
actualizado: 2026-08-07
---
```

| Campo | Regla |
|---|---|
| `titulo` | Frase corta, en castellano, sin abreviaturas internas. |
| `resumen` | **Una línea, ≤140 caracteres.** Es lo único que se ve en el índice. Escribilo pensando en "¿me sirve abrir esto?". |
| `tags` | Lista corta, en `kebab-case`, sin `#`. Máximo 4. |
| `estado` | `activo`, `borrador` o `archivado`. Las archivadas no se leen salvo pedido. |
| `actualizado` | `AAAA-MM-DD`. Si no está al día, el dato es sospechoso. |

## Nombres de archivo

- `kebab-case.md`, sin tildes ni espacios.
- Descriptivo: `costo-por-hectarea.md`, no `costos2.md`. El nombre tiene que
  permitir encontrar la nota con Grep sin abrirla.
- Bitácora: `AAAA-MM-DD.md`.
- Decisiones: `NNNN-titulo-corto.md`, correlativo desde `0001`. Los números no
  se reciclan aunque se archive una decisión.

## Tamaño

Una nota que pasa de ~150 líneas se parte en dos y se enlazan entre sí. Una nota
larga obliga a leer todo para usar una parte, que es exactamente lo que queremos
evitar.

## Un tema por nota

Si el `resumen` necesita un "y" para ser fiel al contenido, probablemente son dos
notas.

## Enlaces

Enlaces relativos de Markdown (`[texto](../10-contexto/nota.md)`), no wikilinks.
Así siguen funcionando en GitHub y los puede seguir cualquier herramienta, no
solo Obsidian.

## Regenerar el índice

Después de crear, renombrar, mover o cambiar el `resumen` de una nota:

```bash
python3 scripts/indexar.py
```

Reescribe la tabla de `INDICE.md` leyendo solo el frontmatter de cada archivo.
No toca el resto del contenido del índice.
