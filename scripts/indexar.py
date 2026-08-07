#!/usr/bin/env python3
"""Regenera la tabla de vault/00-indice/INDICE.md leyendo el frontmatter de cada nota.

Lee solo la cabecera YAML de cada archivo, no el cuerpo. Reescribe únicamente el
bloque delimitado por los marcadores INDICE:INICIO / INDICE:FIN; el resto del
índice queda intacto.

Uso:
    python3 scripts/indexar.py           # reescribe el índice
    python3 scripts/indexar.py --check   # no escribe, sale 1 si está desactualizado
"""

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
VAULT = RAIZ / "vault"
INDICE = VAULT / "00-indice" / "INDICE.md"

INICIO = "<!-- INDICE:INICIO -->"
FIN = "<!-- INDICE:FIN -->"

# Carpetas que nunca entran al índice.
EXCLUIDAS = {"90-plantillas", "99-adjuntos", ".obsidian", ".trash"}

# La bitácora crece sin límite: solo entran las entradas más recientes.
CARPETA_BITACORA = "50-bitacora"
MAX_BITACORA = 3

TITULOS = {
    "00-indice": "Índice y convenciones",
    "10-contexto": "Contexto",
    "20-decisiones": "Decisiones",
    "30-operacion": "Operación",
    "40-referencia": "Referencia",
    "50-bitacora": "Bitácora",
}

LARGO_MAX_RESUMEN = 140


def leer_frontmatter(ruta: Path) -> dict:
    """Devuelve el frontmatter como dict. Soporta escalares y listas en línea."""
    campos: dict[str, str] = {}
    with ruta.open(encoding="utf-8") as f:
        if f.readline().rstrip("\n") != "---":
            return campos
        for linea in f:
            linea = linea.rstrip("\n")
            if linea == "---":
                break
            if ":" not in linea or linea.startswith(("#", " ", "\t", "-")):
                continue
            clave, _, valor = linea.partition(":")
            campos[clave.strip()] = valor.strip().strip('"').strip("'")
    return campos


def escapar(texto: str) -> str:
    """Los pipes rompen la tabla Markdown."""
    return texto.replace("|", "\\|")


def recolectar() -> tuple[dict[str, list[dict]], list[str]]:
    por_carpeta: dict[str, list[dict]] = {}
    avisos: list[str] = []

    for ruta in sorted(VAULT.rglob("*.md")):
        rel = ruta.relative_to(VAULT)
        if rel.parts[0] in EXCLUIDAS or ruta == INDICE:
            continue

        carpeta = rel.parts[0] if len(rel.parts) > 1 else "."
        fm = leer_frontmatter(ruta)
        resumen = fm.get("resumen", "")
        rel_posix = rel.as_posix()

        if not resumen:
            avisos.append(f"{rel_posix}: sin 'resumen' en el frontmatter")
        elif len(resumen) > LARGO_MAX_RESUMEN:
            avisos.append(
                f"{rel_posix}: 'resumen' de {len(resumen)} caracteres "
                f"(máximo {LARGO_MAX_RESUMEN})"
            )

        por_carpeta.setdefault(carpeta, []).append(
            {
                "ruta": rel_posix,
                "titulo": fm.get("titulo") or ruta.stem,
                "resumen": resumen or "—",
                "estado": fm.get("estado", "—"),
                "actualizado": fm.get("actualizado", "—"),
            }
        )

    return por_carpeta, avisos


def construir_tabla(por_carpeta: dict[str, list[dict]]) -> str:
    bloques: list[str] = []

    for carpeta in sorted(por_carpeta):
        notas = por_carpeta[carpeta]
        encabezado = TITULOS.get(carpeta, carpeta)
        pie = ""

        if carpeta == CARPETA_BITACORA:
            notas = sorted(notas, key=lambda n: n["ruta"], reverse=True)
            total = len(notas)
            if total > MAX_BITACORA:
                pie = (
                    f"\n_{total - MAX_BITACORA} entradas anteriores no listadas. "
                    f"Ver `{CARPETA_BITACORA}/`._\n"
                )
                notas = notas[:MAX_BITACORA]
        else:
            notas = sorted(notas, key=lambda n: n["ruta"])

        filas = "\n".join(
            "| [{titulo}](../{ruta}) | {resumen} | {estado} | {actualizado} |".format(
                titulo=escapar(n["titulo"]),
                ruta=n["ruta"],
                resumen=escapar(n["resumen"]),
                estado=n["estado"],
                actualizado=n["actualizado"],
            )
            for n in notas
        )

        bloques.append(
            f"### {encabezado}\n\n"
            "| Nota | Resumen | Estado | Actualizado |\n"
            "|---|---|---|---|\n"
            f"{filas}\n{pie}"
        )

    return "\n".join(bloques).rstrip() + "\n"


def main() -> int:
    solo_chequear = "--check" in sys.argv

    if not INDICE.exists():
        print(f"error: falta {INDICE.relative_to(RAIZ)}", file=sys.stderr)
        return 2

    original = INDICE.read_text(encoding="utf-8")
    if INICIO not in original or FIN not in original:
        print(
            f"error: {INDICE.relative_to(RAIZ)} no tiene los marcadores "
            f"{INICIO} / {FIN}",
            file=sys.stderr,
        )
        return 2

    por_carpeta, avisos = recolectar()
    antes, _, resto = original.partition(INICIO)
    _, _, despues = resto.partition(FIN)
    nuevo = f"{antes}{INICIO}\n\n{construir_tabla(por_carpeta)}\n{FIN}{despues}"

    total = sum(len(v) for v in por_carpeta.values())

    if solo_chequear:
        if nuevo != original:
            print("El índice está desactualizado. Correr: python3 scripts/indexar.py")
            return 1
        print(f"Índice al día ({total} notas).")
        return 0

    if nuevo != original:
        INDICE.write_text(nuevo, encoding="utf-8")
        print(f"Índice actualizado: {total} notas.")
    else:
        print(f"Índice sin cambios ({total} notas).")

    for aviso in avisos:
        print(f"  aviso: {aviso}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
