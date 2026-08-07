# kumagro

Repo del proyecto kumagro. El contexto, las decisiones y los procesos viven en un
**vault de Obsidian** versionado acá adentro, en `vault/`.

## Abrir el vault

En Obsidian: **Open folder as vault** → elegí la carpeta `vault/` de este repo
(no la raíz). La configuración, las plantillas y los plugins core ya vienen
seteados en `vault/.obsidian/`.

Si todavía no tenés Obsidian: https://obsidian.md/download

## Estructura

```
vault/
├─ 00-indice/      índice generado + convenciones
├─ 10-contexto/    qué es kumagro, objetivos, glosario
├─ 20-decisiones/  decisiones numeradas y su porqué
├─ 30-operacion/   procesos y runbooks
├─ 40-referencia/  datos duros y fuentes
├─ 50-bitacora/    log diario
├─ 90-plantillas/  templates de notas
└─ 99-adjuntos/    imágenes y archivos
```

## Mantener el índice al día

Después de crear, mover o renombrar notas, o de cambiar un `resumen`:

```bash
python3 scripts/indexar.py
```

Regenera la tabla de `vault/00-indice/INDICE.md` leyendo solo el frontmatter.
`--check` no escribe nada y sale con código 1 si el índice quedó desactualizado
(sirve para CI o un hook de pre-commit).

## Por qué está armado así

Para que una sesión con Claude arranque leyendo un archivo en vez del proyecto
entero. El detalle está en la decisión
[0001](vault/20-decisiones/0001-vault-como-memoria-del-proyecto.md), y el
protocolo de lectura en [`CLAUDE.md`](CLAUDE.md).
