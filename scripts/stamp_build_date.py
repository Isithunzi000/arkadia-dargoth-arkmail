#!/usr/bin/env python3
"""Stamp daty builda ArkMail: nadpisuje PLUGIN_BUILD_DATE dzisiejsza
data (DD-MM-YYYY) w src/arkmail/meta.ts. Odpalac przed bundle/zip.
Wzorzec musi trafic dokladnie raz, inaczej exit 1.
Re-run tego samego dnia = no-op.

Uzycie: python3 scripts/stamp_build_date.py"""
import os
import re
import sys
from datetime import date

TODAY = date.today().strftime("%d-%m-%Y")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(HERE, "src", "arkmail", "meta.ts")
RX = re.compile(r'const PLUGIN_BUILD_DATE = "\d{2}-\d{2}-\d{4}"')


def main():
    with open(TARGET, encoding="utf-8", newline="") as f:
        s = f.read()
    hits = RX.findall(s)
    if len(hits) != 1:
        raise SystemExit(
            "BLAD: wzorzec stempla w meta.ts: %d trafien (oczekiwano 1)" % len(hits))
    new = 'const PLUGIN_BUILD_DATE = "%s"' % TODAY
    if hits[0] == new:
        print("bez zmian: meta.ts (juz %s)" % TODAY)
        return
    s = s.replace(hits[0], new, 1)
    with open(TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(s)
    print("stamp: meta.ts: %s -> %s" % (hits[0], TODAY))


if __name__ == "__main__":
    main()
