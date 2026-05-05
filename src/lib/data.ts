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
