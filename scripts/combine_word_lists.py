#!/usr/bin/env python3
"""Combine word-list CSV files and count the lists containing each word.

Each non-empty first column value is treated as a word. A word is counted at
most once per input file, even if a source file repeats it.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path


HEADER_VALUES = {"word", "words", "term", "terms", "vocabulary"}


def normalize_word(value: str) -> str:
    """Normalize whitespace, Unicode, and case for reliable deduplication."""
    value = unicodedata.normalize("NFKC", value).replace("\ufeff", "")
    value = re.sub(r"\s+", " ", value).strip()
    return value.casefold()


def words_in_file(path: Path) -> set[str]:
    """Return the unique normalized words found in one CSV file."""
    words: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.reader(input_file)
        for row_number, row in enumerate(reader, start=1):
            if not row:
                continue

            word = normalize_word(row[0])
            if not word:
                continue
            if row_number == 1 and word in HEADER_VALUES:
                continue

            words.add(word)
    return words


def combine_word_lists(input_dir: Path) -> Counter[str]:
    """Count how many CSV files contain each unique word."""
    counts: Counter[str] = Counter()
    input_files = sorted(input_dir.glob("*.csv"))
    if not input_files:
        raise FileNotFoundError(f"No CSV files found in {input_dir}")

    for input_file in input_files:
        counts.update(words_in_file(input_file))

    return counts


def write_counts(counts: Counter[str], output_file: Path) -> None:
    """Write alphabetized words and their source-list counts to CSV."""
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["word", "list_count"])
        for word in sorted(counts):
            writer.writerow([word, counts[word]])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Combine CSV word lists and count the number of lists containing each word."
    )
    parser.add_argument(
        "input_dir",
        type=Path,
        help="Directory containing the source CSV word lists",
    )
    parser.add_argument(
        "output_file",
        type=Path,
        help="Destination CSV file",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        counts = combine_word_lists(args.input_dir)
        write_counts(counts, args.output_file)
    except (OSError, csv.Error, UnicodeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(f"Read {len(list(args.input_dir.glob('*.csv')))} CSV files.")
    print(f"Wrote {len(counts)} unique words to {args.output_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
