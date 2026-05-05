import Papa from "papaparse";

export type DatasetKey = "pol1" | "pol5";

export type TermRow = {
  term: string;
  tf_ref: number;
  df_ref: number;
  tf_sub: number;
  df_sub: number;
  delta_tf: number;
  delta_df: number;
};

export type DatasetMetadata = {
  sub_docs: number;
  ref_docs: number;
  sub_tokens: number;
  ref_tokens: number;
  rows: number;
};

export type DatasetPayload = {
  rows: TermRow[];
  metadata: DatasetMetadata;
};

const datasetCache = new Map<DatasetKey, Promise<DatasetPayload>>();
const corpusBooksCache = new Map<DatasetKey, Promise<CorpusBook[]>>();

export type CorpusBook = {
  dhlabid: number;
  urn: string;
  title: string;
  authors: string;
  year: number | null;
};

export type CorpusHit = {
  dhlabid: number;
  word: string;
  tf: number;
  docTotal: number;
};

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return 0;
}

function normalizeRow(row: Record<string, unknown>): TermRow {
  return {
    term: String(row.term ?? "").trim(),
    tf_ref: parseNumber(row.tf_ref),
    df_ref: parseNumber(row.df_ref),
    tf_sub: parseNumber(row.tf_sub),
    df_sub: parseNumber(row.df_sub),
    delta_tf: parseNumber(row.delta_tf),
    delta_df: parseNumber(row.delta_df),
  };
}

export async function loadDataset(dataset: DatasetKey): Promise<DatasetPayload> {
  const cached = datasetCache.get(dataset);
  if (cached) return cached;

  const datasetUrl = `${import.meta.env.BASE_URL}data/${dataset}_vs_reference.csv`;
  const metadataUrl = `${import.meta.env.BASE_URL}data/${dataset}_vs_reference.meta.json`;

  const promise = Promise.all([
    fetch(datasetUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load dataset ${dataset}`);
      }
      const text = await response.text();
      const parsed = await new Promise<Papa.ParseResult<Record<string, unknown>>>(
        (resolve, reject) => {
          Papa.parse<Record<string, unknown>>(text, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            complete: resolve,
            error: reject,
          });
        },
      );
      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors[0]?.message ?? "CSV parse error");
      }
      return parsed.data.map(normalizeRow).filter((row) => row.term !== "");
    }),
    fetch(metadataUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load metadata for dataset ${dataset}`);
      }
      return (await response.json()) as DatasetMetadata;
    }),
  ]).then(([rows, metadata]) => ({ rows, metadata }));

  datasetCache.set(dataset, promise);
  return promise;
}

export async function loadCorpusBooks(dataset: DatasetKey): Promise<CorpusBook[]> {
  const cached = corpusBooksCache.get(dataset);
  if (cached) return cached;

  const booksUrl = `${import.meta.env.BASE_URL}data/${dataset}_books.json`;
  const promise = fetch(booksUrl).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load corpus metadata for ${dataset}`);
    }
    return (await response.json()) as CorpusBook[];
  });

  corpusBooksCache.set(dataset, promise);
  return promise;
}

export async function fetchCorpusHits(
  urns: string[],
  words: string[],
): Promise<CorpusHit[]> {
  const response = await fetch("https://api.nb.no/dhlab/frequencies", {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cutoff: 1,
      urns,
      words,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not load title hits");
  }

  const data = (await response.json()) as Array<[number, string, number, number]>;

  return data.map(([dhlabid, word, tf, docTotal]) => ({
    dhlabid,
    word,
    tf,
    docTotal,
  }));
}
