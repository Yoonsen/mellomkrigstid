import Papa from "papaparse";

export type DatasetKey = "pol1" | "pol5";

export type TermRow = {
  term: string;
  tf_ref: number;
  df_ref: number;
  tf_sub: number;
  df_sub: number;
  p_tf_ref: number;
  p_tf_sub: number;
  p_df_ref: number;
  p_df_sub: number;
  delta_tf: number;
  delta_df: number;
  log_delta_tf: number;
  log_delta_df: number;
  in_reference: boolean;
  in_subcorpus: boolean;
};

const datasetCache = new Map<DatasetKey, Promise<TermRow[]>>();

function parseBoolean(value: unknown): boolean {
  return value === true || value === "True" || value === "true";
}

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
    p_tf_ref: parseNumber(row.p_tf_ref),
    p_tf_sub: parseNumber(row.p_tf_sub),
    p_df_ref: parseNumber(row.p_df_ref),
    p_df_sub: parseNumber(row.p_df_sub),
    delta_tf: parseNumber(row.delta_tf),
    delta_df: parseNumber(row.delta_df),
    log_delta_tf: parseNumber(row.log_delta_tf),
    log_delta_df: parseNumber(row.log_delta_df),
    in_reference: parseBoolean(row.in_reference),
    in_subcorpus: parseBoolean(row.in_subcorpus),
  };
}

export async function loadDataset(dataset: DatasetKey): Promise<TermRow[]> {
  const cached = datasetCache.get(dataset);
  if (cached) return cached;

  const promise = fetch(`/data/${dataset}_vs_reference.csv`)
    .then(async (response) => {
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
    });

  datasetCache.set(dataset, promise);
  return promise;
}
