from __future__ import annotations

import argparse
import csv
import json
import json
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

import dhlab as dh
import numpy as np
import pandas as pd
from dhlab.api.dhlab_api import get_metadata

NB_ITEMS_URL = "https://api.nb.no/catalog/v1/items"
NB_MAX_PAGE = 50
DEFAULT_OUTPUT = Path("data/urns/reference_1910_1950.csv")
DEFAULT_COUNTS_OUTPUT = Path("results/reference_1910_1950_counts.csv")
DEFAULT_MAPPING_OUTPUT = Path("results/reference_1910_1950_mapping.csv")
DEFAULT_STATS_OUTPUT = Path("results/reference_1910_1950_tf_df.csv")
DEFAULT_COMPARE_OUTPUT = Path("results/pol1_vs_reference.csv")


def fetch_nb_page(params: list[tuple[str, str | int]]) -> dict[str, Any]:
    query = urlencode(params, doseq=True)
    with urlopen(f"{NB_ITEMS_URL}?{query}") as response:
        return json.load(response)


def extract_record(item: dict[str, Any]) -> dict[str, Any] | None:
    metadata = item.get("metadata", {})
    identifiers = metadata.get("identifiers", {})
    urn = identifiers.get("urn")
    if not urn:
        return None

    origin_info = metadata.get("originInfo", {})
    languages = metadata.get("languages", [])

    return {
        "urn": urn,
        "sesam_id": identifiers.get("sesamId", ""),
        "title": metadata.get("title", ""),
        "issued": origin_info.get("issued", ""),
        "publisher": origin_info.get("publisher", ""),
        "languages": ";".join(lang.get("code", "") for lang in languages if lang.get("code")),
        "literaryform": metadata.get("literaryform", ""),
        "page_count": metadata.get("pageCount", ""),
        "creators": ";".join(metadata.get("creators", [])),
        "access_allowed_from": item.get("accessInfo", {}).get("accessAllowedFrom", ""),
        "is_digital": item.get("accessInfo", {}).get("isDigital", False),
        "is_public_domain": item.get("accessInfo", {}).get("isPublicDomain", False),
    }


def fetch_reference_urns(
    from_year: int,
    to_year: int,
    languages: list[str] | None,
    page_size: int,
    digital_accessible_only: bool,
) -> list[dict[str, Any]]:
    page = 0
    records: list[dict[str, Any]] = []
    seen_urns: set[str] = set()

    while True:
        if page > NB_MAX_PAGE:
            print(
                f"Stopped at NB API page limit ({NB_MAX_PAGE + 1} pages including page 0)."
            )
            break

        params: list[tuple[str, str | int]] = [
            ("q", "*"),
            ("filter", "mediatype:bøker"),
            ("filter", "literaryform:Skjønnlitteratur"),
            ("filter", f"year:[{from_year} TO {to_year}]"),
            ("page", page),
            ("size", page_size),
        ]
        if digital_accessible_only:
            params.append(("digitalAccessibleOnly", "true"))
        for language in languages or []:
            params.append(("filter", f"languages:{language}"))

        try:
            payload = fetch_nb_page(params)
        except HTTPError as exc:
            print(f"Stopped NB fetch at page {page}: {exc}")
            break

        items = payload.get("_embedded", {}).get("items", [])
        if not items:
            break

        for item in items:
            record = extract_record(item)
            if record is None or record["urn"] in seen_urns:
                continue
            seen_urns.add(record["urn"])
            records.append(record)

        current_page = payload.get("page", {}).get("number", page)
        total_pages = payload.get("page", {}).get("totalPages", current_page + 1)
        print(
            f"Fetched page {current_page + 1}/{total_pages} "
            f"and collected {len(records)} URNs"
        )

        if current_page + 1 >= total_pages:
            break
        page += 1

    return records


def save_records(records: list[dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "urn",
        "dhlabid",
        "sesam_id",
        "title",
        "issued",
        "publisher",
        "languages",
        "literaryform",
        "page_count",
        "creators",
        "access_allowed_from",
        "is_digital",
        "is_public_domain",
        "dhlab_title",
        "dhlab_authors",
        "dhlab_year",
        "dhlab_langs",
        "dhlab_publisher",
        "dhlab_doctype",
    ]
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def load_urns(input_path: Path) -> list[str]:
    with input_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [row["urn"] for row in reader if row.get("urn")]


def load_records(input_path: Path) -> list[dict[str, str]]:
    with input_path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def enrich_with_dhlab_metadata(
    records: list[dict[str, Any]],
    chunk_size: int = 500,
) -> list[dict[str, Any]]:
    if not records:
        return records

    metadata_frames: list[pd.DataFrame] = []
    urns = [record["urn"] for record in records]

    for start in range(0, len(urns), chunk_size):
        batch = urns[start : start + chunk_size]
        metadata = get_metadata(urns=batch)
        if not metadata.empty:
            metadata_frames.append(metadata)
        print(
            f"Mapped Dhlab metadata for {min(start + chunk_size, len(urns))}/{len(urns)} URNs"
        )

    if metadata_frames:
        metadata_df = pd.concat(metadata_frames, ignore_index=True)
        metadata_df = metadata_df.drop_duplicates(subset=["urn"])
    else:
        metadata_df = pd.DataFrame(columns=["urn", "dhlabid"])

    metadata_by_urn = metadata_df.set_index("urn").to_dict(orient="index")

    for record in records:
        match = metadata_by_urn.get(record["urn"], {})
        record["dhlabid"] = match.get("dhlabid", "")
        record["dhlab_title"] = match.get("title", "")
        record["dhlab_authors"] = match.get("authors", "")
        record["dhlab_year"] = match.get("year", "")
        record["dhlab_langs"] = match.get("langs", "")
        record["dhlab_publisher"] = match.get("publisher", "")
        record["dhlab_doctype"] = match.get("doctype", "")

    return records


def run_counts(
    records: list[dict[str, str]],
    output_path: Path,
    words: list[str] | None = None,
    cutoff: int = 0,
    sparse: bool = True,
) -> dh.Counts:
    corpus_rows = [
        {"urn": row["urn"], "dhlabid": row.get("dhlabid", "")}
        for row in records
        if row.get("urn") and row.get("dhlabid")
    ]
    corpus = dh.Corpus.from_df(pd.DataFrame(corpus_rows))
    counts = dh.Counts(corpus=corpus, words=words, cutoff=cutoff, sparse=sparse)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    counts.frame.to_csv(output_path)
    return counts


def compute_tf_df(counts: dh.Counts) -> pd.DataFrame:
    frame = counts.frame
    coo = frame.sparse.to_coo()
    tf = np.asarray(coo.sum(axis=1)).ravel()
    df = np.diff(coo.tocsr().indptr)
    stats = pd.DataFrame({"term": frame.index, "tf": tf, "df": df}).set_index("term")
    return stats.sort_values(["tf", "df"], ascending=False)


def compute_tf_df_in_batches(
    records: list[dict[str, str]],
    cutoff: int = 0,
    batch_size: int = 500,
) -> pd.DataFrame:
    usable_records = [
        row for row in records if row.get("urn") and row.get("dhlabid")
    ]
    tf_total = pd.Series(dtype="float64")
    df_total = pd.Series(dtype="float64")

    for start in range(0, len(usable_records), batch_size):
        batch = usable_records[start : start + batch_size]
        counts = dh.Counts(
            corpus=dh.Corpus.from_df(
                pd.DataFrame(
                    [{"urn": row["urn"], "dhlabid": row["dhlabid"]} for row in batch]
                )
            ),
            cutoff=cutoff,
            sparse=True,
        )
        batch_stats = compute_tf_df(counts)
        tf_total = tf_total.add(batch_stats["tf"], fill_value=0)
        df_total = df_total.add(batch_stats["df"], fill_value=0)
        print(
            f"Processed batch {start // batch_size + 1} "
            f"({min(start + batch_size, len(usable_records))}/{len(usable_records)} documents)"
        )

    stats = pd.DataFrame({"tf": tf_total, "df": df_total}).fillna(0)
    stats["tf"] = stats["tf"].astype("int64")
    stats["df"] = stats["df"].astype("int64")
    stats.index.name = "term"
    return stats.sort_values(["tf", "df"], ascending=False)


def compare_to_reference(
    sub_path: Path,
    ref_path: Path,
    output_path: Path,
    sub_docs: int,
    ref_docs: int,
) -> pd.DataFrame:
    sub_df = pd.read_csv(sub_path).set_index("term")
    ref_df = pd.read_csv(ref_path).set_index("term")

    sub_total_tf = int(sub_df["tf"].sum())
    ref_total_tf = int(ref_df["tf"].sum())
    sub_floor_tf = 0.5
    ref_floor_tf = 0.5
    sub_floor_df = 0.5
    ref_floor_df = 0.5

    merged = ref_df.join(sub_df, how="outer", lsuffix="_ref", rsuffix="_sub").fillna(0)
    merged["tf_ref"] = merged["tf_ref"].astype("int64")
    merged["df_ref"] = merged["df_ref"].astype("int64")
    merged["tf_sub"] = merged["tf_sub"].astype("int64")
    merged["df_sub"] = merged["df_sub"].astype("int64")

    merged["p_tf_ref"] = merged["tf_ref"].clip(lower=0) / ref_total_tf
    merged["p_tf_sub"] = merged["tf_sub"].clip(lower=0) / sub_total_tf
    merged["p_df_ref"] = merged["df_ref"].clip(lower=0) / ref_docs
    merged["p_df_sub"] = merged["df_sub"].clip(lower=0) / sub_docs

    merged["delta_tf"] = (
        (merged["tf_sub"].where(merged["tf_sub"] > 0, sub_floor_tf) / sub_total_tf)
        / (merged["tf_ref"].where(merged["tf_ref"] > 0, ref_floor_tf) / ref_total_tf)
    )
    merged["delta_df"] = (
        (merged["df_sub"].where(merged["df_sub"] > 0, sub_floor_df) / sub_docs)
        / (merged["df_ref"].where(merged["df_ref"] > 0, ref_floor_df) / ref_docs)
    )
    merged["log_delta_tf"] = np.log(merged["delta_tf"])
    merged["log_delta_df"] = np.log(merged["delta_df"])
    merged["in_reference"] = merged["tf_ref"] > 0
    merged["in_subcorpus"] = merged["tf_sub"] > 0

    merged = merged.sort_values(["delta_tf", "df_sub", "tf_sub"], ascending=[False, False, False])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    merged.reset_index().to_csv(output_path, index=False)
    return merged


def infer_total_from_ratio(
    frame: pd.DataFrame, numerator_col: str, ratio_col: str
) -> int:
    positive = frame[(frame[numerator_col] > 0) & (frame[ratio_col] > 0)]
    if positive.empty:
        return 0
    sample = positive.iloc[0]
    return int(round(sample[numerator_col] / sample[ratio_col]))


def export_app_dataset(
    compare_path: Path,
    output_path: Path,
    metadata_output_path: Path,
    decimals: int = 6,
) -> tuple[pd.DataFrame, dict[str, int]]:
    comparison = pd.read_csv(compare_path)

    slim = comparison.loc[
        comparison["in_subcorpus"] == True,
        ["term", "tf_ref", "df_ref", "tf_sub", "df_sub", "delta_tf", "delta_df"],
    ].copy()
    slim["term"] = slim["term"].fillna("").astype(str).str.strip()
    slim = slim[slim["term"] != ""]
    slim["tf_ref"] = slim["tf_ref"].astype("int64")
    slim["df_ref"] = slim["df_ref"].astype("int64")
    slim["tf_sub"] = slim["tf_sub"].astype("int64")
    slim["df_sub"] = slim["df_sub"].astype("int64")
    slim["delta_tf"] = slim["delta_tf"].round(decimals)
    slim["delta_df"] = slim["delta_df"].round(decimals)

    metadata = {
        "sub_docs": infer_total_from_ratio(comparison, "df_sub", "p_df_sub"),
        "ref_docs": infer_total_from_ratio(comparison, "df_ref", "p_df_ref"),
        "sub_tokens": infer_total_from_ratio(comparison, "tf_sub", "p_tf_sub"),
        "ref_tokens": infer_total_from_ratio(comparison, "tf_ref", "p_tf_ref"),
        "rows": int(len(slim)),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_output_path.parent.mkdir(parents=True, exist_ok=True)
    slim.to_csv(output_path, index=False)
    metadata_output_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return slim, metadata


def export_app_books(input_path: Path, output_path: Path) -> list[dict[str, Any]]:
    records = load_records(input_path)
    books: list[dict[str, Any]] = []

    for row in records:
        if not row.get("urn") or not row.get("dhlabid"):
            continue
        try:
            dhlabid = int(row["dhlabid"])
        except (TypeError, ValueError):
            continue

        year_value = row.get("year", "")
        try:
            year = int(year_value) if year_value else None
        except ValueError:
            year = None

        books.append(
            {
                "dhlabid": dhlabid,
                "urn": row.get("urn", ""),
                "title": row.get("title", ""),
                "authors": row.get("authors", ""),
                "year": year,
            }
        )

    deduped: dict[int, dict[str, Any]] = {}
    for book in books:
        deduped[book["dhlabid"]] = book

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(list(deduped.values()), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return list(deduped.values())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch reference URNs from NB and run dhlab counts."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    fetch_parser = subparsers.add_parser("fetch", help="Fetch URNs from NB API")
    fetch_parser.add_argument("--from-year", type=int, default=1910)
    fetch_parser.add_argument("--to-year", type=int, default=1950)
    fetch_parser.add_argument("--language", action="append", dest="languages")
    fetch_parser.add_argument("--page-size", type=int, default=100)
    fetch_parser.add_argument("--digital-accessible-only", action="store_true")
    fetch_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)

    count_parser = subparsers.add_parser("count", help="Run dhlab counts on saved URNs")
    count_parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT)
    count_parser.add_argument("--output", type=Path, default=DEFAULT_COUNTS_OUTPUT)
    count_parser.add_argument("--mapping-output", type=Path, default=DEFAULT_MAPPING_OUTPUT)
    count_parser.add_argument("--word", action="append", dest="words")
    count_parser.add_argument("--cutoff", type=int, default=0)
    count_parser.add_argument("--dense", action="store_true")

    stats_parser = subparsers.add_parser(
        "stats", help="Compute term frequency and document frequency"
    )
    stats_parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT)
    stats_parser.add_argument("--output", type=Path, default=DEFAULT_STATS_OUTPUT)
    stats_parser.add_argument("--cutoff", type=int, default=0)
    stats_parser.add_argument("--batch-size", type=int, default=500)

    compare_parser = subparsers.add_parser(
        "compare", help="Compare a subcorpus tf/df list against the reference list"
    )
    compare_parser.add_argument("--sub", type=Path, required=True)
    compare_parser.add_argument("--reference", type=Path, default=DEFAULT_STATS_OUTPUT)
    compare_parser.add_argument("--output", type=Path, default=DEFAULT_COMPARE_OUTPUT)
    compare_parser.add_argument("--sub-docs", type=int, required=True)
    compare_parser.add_argument("--reference-docs", type=int, default=3125)

    app_data_parser = subparsers.add_parser(
        "app-data", help="Export slim app dataset and sidecar metadata"
    )
    app_data_parser.add_argument("--compare", type=Path, required=True)
    app_data_parser.add_argument("--output", type=Path, required=True)
    app_data_parser.add_argument("--metadata-output", type=Path, required=True)
    app_data_parser.add_argument("--decimals", type=int, default=6)

    app_books_parser = subparsers.add_parser(
        "app-books", help="Export slim corpus book metadata for app lookups"
    )
    app_books_parser.add_argument("--input", type=Path, required=True)
    app_books_parser.add_argument("--output", type=Path, required=True)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "fetch":
        records = fetch_reference_urns(
            from_year=args.from_year,
            to_year=args.to_year,
            languages=args.languages,
            page_size=args.page_size,
            digital_accessible_only=args.digital_accessible_only,
        )
        records = enrich_with_dhlab_metadata(records)
        save_records(records, args.output)
        mapped = sum(1 for record in records if record.get("dhlabid"))
        print(f"Saved {len(records)} URNs to {args.output}")
        print(f"Mapped {mapped} URNs to Dhlab metadata")
        return

    if args.command == "count":
        records = load_records(args.input)
        counts = run_counts(
            records=records,
            output_path=args.output,
            words=args.words,
            cutoff=args.cutoff,
            sparse=not args.dense,
        )
        counted_ids = {str(column) for column in counts.frame.columns}
        mapping_rows = [
            {
                "dhlabid": row["dhlabid"],
                "urn": row["urn"],
                "title": row.get("dhlab_title") or row.get("title", ""),
                "authors": row.get("dhlab_authors", ""),
                "year": row.get("dhlab_year", ""),
                "langs": row.get("dhlab_langs", ""),
                "counted": str(row["dhlabid"]) in counted_ids,
            }
            for row in records
            if row.get("dhlabid")
        ]
        pd.DataFrame(mapping_rows).drop_duplicates().to_csv(args.mapping_output, index=False)
        mapped_count = sum(1 for row in records if row.get("dhlabid"))
        counted_count = sum(1 for row in mapping_rows if row["counted"])
        print(f"Loaded {len(records)} records from {args.input}")
        print(f"Using {mapped_count} records with Dhlab metadata")
        print(f"Received counts for {counted_count} Dhlab texts")
        print(f"Saved counts with shape {counts.frame.shape} to {args.output}")
        print(f"Saved Dhlab mapping to {args.mapping_output}")
        return

    if args.command == "stats":
        records = load_records(args.input)
        stats = compute_tf_df_in_batches(
            records=records,
            cutoff=args.cutoff,
            batch_size=args.batch_size,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        stats.to_csv(args.output)
        print(f"Loaded {len(records)} records from {args.input}")
        print(f"Computed tf/df for {len(stats)} terms")
        print(f"Saved tf/df statistics to {args.output}")
        return

    if args.command == "compare":
        comparison = compare_to_reference(
            sub_path=args.sub,
            ref_path=args.reference,
            output_path=args.output,
            sub_docs=args.sub_docs,
            ref_docs=args.reference_docs,
        )
        print(f"Compared {args.sub} against {args.reference}")
        print(f"Saved comparison with {len(comparison)} terms to {args.output}")
        return

    if args.command == "app-data":
        slim, metadata = export_app_dataset(
            compare_path=args.compare,
            output_path=args.output,
            metadata_output_path=args.metadata_output,
            decimals=args.decimals,
        )
        print(f"Exported {len(slim)} app rows from {args.compare}")
        print(f"Saved slim app dataset to {args.output}")
        print(f"Saved metadata to {args.metadata_output}: {metadata}")
        return

    if args.command == "app-books":
        books = export_app_books(input_path=args.input, output_path=args.output)
        print(f"Exported {len(books)} corpus books from {args.input}")
        print(f"Saved app book metadata to {args.output}")
        return

    parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
