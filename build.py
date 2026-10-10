#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py — sincroniza dados_curso.js a partir de embedded_data.json.

COMO FUNCIONA (arquitetura zero-build)
---------------------------------------
O site (`index.html`) não passa mais por nenhum passo de build: ele abre
direto no navegador com duplo clique e carrega os dados via
`<script src="dados_curso.js"></script>`, uma tag comum de script.

Este utilitário existe só para conveniência de edição: `embedded_data.json`
é mais fácil de editar/validar como JSON puro (planilhas, ferramentas de
JSON, etc.) do que mexer direto num arquivo `.js`. Quando você editar
embedded_data.json, rode este script para regenerar dados_curso.js.

Se preferir, edite dados_curso.js diretamente — ele também é só um arquivo
de texto (`const DATA = {...};`) e o index.html não se importa de onde ele
veio.

USO
---
    python3 build.py
    # lê embedded_data.json, escreve dados_curso.js

    python3 build.py --data outro.json --out outro_dados.js
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def build(data_path: Path, out_path: Path):
    data_json = data_path.read_text(encoding="utf-8")

    # valida que o JSON é válido antes de gerar (evita gerar um .js quebrado)
    data = json.loads(data_json)

    out = "const DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    out_path.write_text(out, encoding="utf-8")
    print(f"OK: {out_path} gerado ({len(out):,} bytes)")

    try:
        subprocess.run(["node", "--check", str(out_path)], check=True)
        print("OK: sintaxe do JavaScript validada com node --check")
    except FileNotFoundError:
        print("(node não encontrado — pulei a checagem de sintaxe)")
    except subprocess.CalledProcessError:
        print("ERRO DE SINTAXE no JavaScript gerado! Veja a saída acima.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="embedded_data.json")
    ap.add_argument("--out", default="dados_curso.js")
    args = ap.parse_args()
    build(Path(args.data), Path(args.out))
