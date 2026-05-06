"""Ingest CIAA Spain materials into LightRAG.

GATED. Set CIAA_PERMISSION_GRANTED=true ONLY after explicit written permission
from CIAA Spain (now FIAB — Federación Española de Industrias de Alimentación
y Bebidas, https://www.fiab.es/). Without permission, the script exits 0
cleanly without ingesting anything (so CI/CD pipelines that run it
unconditionally are not broken).

Source: https://www.fiab.es/ (formerly ciaa.es)
License: Permission required.
"""

from __future__ import annotations

import argparse
import logging
import os

log = logging.getLogger(__name__)

SOURCE_ID = "ciaa-spain"
ERA = "modern"

PERMISSION_INSTRUCTIONS = """\
CIAA Spain ingestion is currently GATED.

To enable:
  1. Email permissions@fiab.es (or the current FIAB contact) explaining your
     use case (private RAG store for kitchen yield/waste suggestions, with
     citation-or-no-suggestion guarantee at the consumer side).
  2. Obtain explicit written permission to redistribute their materials inside
     a private RAG store with attribution.
  3. Store the permission email in your operational records.
  4. Set the environment variable CIAA_PERMISSION_GRANTED=true.
  5. Re-run this script.

Until permission is granted, this script does nothing. Exit code: 0.
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest CIAA Spain materials (GATED)")
    parser.add_argument("--source-list", type=str, default=None, help="Path to URL list (TBD)")
    parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)

    granted = os.environ.get("CIAA_PERMISSION_GRANTED", "false").strip().lower()
    if granted != "true":
        print(PERMISSION_INSTRUCTIONS)
        return 0

    log.info("ciaa.permission_granted_proceeding")
    print(
        "CIAA_PERMISSION_GRANTED=true detected. Ingestion logic for CIAA materials is "
        "intentionally not implemented in this slice — it will be filled in once the "
        "permission is in hand and a corpus structure is agreed with CIAA. "
        "See LICENSE_NOTE.md for context."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
