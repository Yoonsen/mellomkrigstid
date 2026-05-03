import { useEffect, useMemo, useState } from "react";
import { type DatasetKey, loadDataset, type TermRow } from "./lib/data";

type SortKey =
  | "term"
  | "delta_tf"
  | "delta_df"
  | "delta_product"
  | "p_df_sub"
  | "tf_sub"
  | "df_sub";
type ViewMode = "ranking" | "keywords";
type DatasetState = Record<DatasetKey, TermRow[]>;
type NumericFilterState = {
  minRelDf: number;
  minDeltaTf: number;
  minDeltaDf: number;
};
type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

const DEFAULT_LIMIT = 200;
const DEFAULT_FILTERS: NumericFilterState = {
  minRelDf: 0.3,
  minDeltaTf: 0,
  minDeltaDf: 0,
};
const DEFAULT_SORT: SortState = {
  key: "delta_tf",
  direction: "desc",
};

function fmtNumber(value: number, digits = 2) {
  return value.toLocaleString("nb-NO", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtInt(value: number) {
  return value.toLocaleString("nb-NO");
}

function inferSubcorpusSize(rows: TermRow[]) {
  const candidates = rows
    .filter((row) => row.df_sub > 0 && row.p_df_sub > 0)
    .map((row) => Math.round(row.df_sub / row.p_df_sub))
    .filter((value) => Number.isFinite(value) && value > 0);

  return candidates[0] ?? 0;
}

function parseSearchTerms(query: string) {
  return Array.from(
    new Set(
      query
        .split(/[\n,;]+/)
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchPatterns(terms: string[]) {
  return terms.map((term) => {
    const regexSource = term
      .split("*")
      .map((part) => escapeRegex(part))
      .join(".*");

    return {
      raw: term,
      regex: new RegExp(`^${regexSource}$`, "i"),
    };
  });
}

function getSortValue(row: TermRow, key: Exclude<SortKey, "term">) {
  if (key === "delta_product") {
    return row.delta_tf * row.delta_df;
  }

  return row[key];
}

export default function App() {
  const [rowsByDataset, setRowsByDataset] = useState<DatasetState>({ pol1: [], pol5: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("ranking");
  const [draftFilters, setDraftFilters] = useState<NumericFilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<NumericFilterState>(DEFAULT_FILTERS);
  const [termQuery, setTermQuery] = useState("");
  const [appliedTermQuery, setAppliedTermQuery] = useState("");
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [rowLimit, setRowLimit] = useState(DEFAULT_LIMIT);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([loadDataset("pol1"), loadDataset("pol5")])
      .then(([pol1, pol5]) => {
        if (cancelled) return;
        setRowsByDataset({ pol1, pol5 });
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const searchTerms = useMemo(() => parseSearchTerms(appliedTermQuery), [appliedTermQuery]);
  const searchPatterns = useMemo(() => buildSearchPatterns(searchTerms), [searchTerms]);

  const filteredByDataset = useMemo(() => {
    const isKeywordMode = viewMode === "keywords";

    const filterAndSort = (rows: TermRow[]) => {
      const next = rows.filter((row) => {
        if (isKeywordMode) {
          if (searchPatterns.length === 0) return false;
          return searchPatterns.some(({ regex }) => regex.test(row.term));
        }

        if (row.p_df_sub < appliedFilters.minRelDf) return false;
        if (row.delta_tf < appliedFilters.minDeltaTf) return false;
        if (row.delta_df < appliedFilters.minDeltaDf) return false;
        return true;
      });

      next.sort((a, b) => {
        if (sortState.key === "term") {
          const lexical = a.term.localeCompare(b.term, "nb");
          if (lexical !== 0) {
            return sortState.direction === "asc" ? lexical : -lexical;
          }
        } else {
          const primary = getSortValue(a, sortState.key) - getSortValue(b, sortState.key);
          if (primary !== 0) {
            return sortState.direction === "asc" ? primary : -primary;
          }
        }

        return b.delta_tf - a.delta_tf || b.df_sub - a.df_sub || b.tf_sub - a.tf_sub;
      });

      return next;
    };

    return {
      pol1: filterAndSort(rowsByDataset.pol1),
      pol5: filterAndSort(rowsByDataset.pol5),
    };
  }, [rowsByDataset, appliedFilters, searchPatterns, sortState, viewMode]);

  const visibleByDataset = useMemo(
    () => ({
      pol1: filteredByDataset.pol1.slice(0, rowLimit),
      pol5: filteredByDataset.pol5.slice(0, rowLimit),
    }),
    [filteredByDataset, rowLimit],
  );

  const sharedTerms = useMemo(() => {
    const pol1Terms = new Set(filteredByDataset.pol1.map((row) => row.term));
    return new Set(filteredByDataset.pol5.map((row) => row.term).filter((term) => pol1Terms.has(term)));
  }, [filteredByDataset]);

  const docsByDataset = useMemo(
    () => ({
      pol1: inferSubcorpusSize(rowsByDataset.pol1),
      pol5: inferSubcorpusSize(rowsByDataset.pol5),
    }),
    [rowsByDataset],
  );

  const totalRowsLoaded = rowsByDataset.pol1.length + rowsByDataset.pol5.length;
  const hasPendingChanges =
    draftFilters.minRelDf !== appliedFilters.minRelDf ||
    draftFilters.minDeltaTf !== appliedFilters.minDeltaTf ||
    draftFilters.minDeltaDf !== appliedFilters.minDeltaDf;
  const hasPendingKeywordChanges = termQuery !== appliedTermQuery;

  function applyFilters() {
    setAppliedFilters(draftFilters);
  }

  function applyRelDfOnly() {
    setAppliedFilters((current) => ({
      ...current,
      minRelDf: draftFilters.minRelDf,
    }));
  }

  function resetRankingFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  function setPreset(next: Partial<NumericFilterState>) {
    const merged = { ...DEFAULT_FILTERS, ...next };
    setDraftFilters(merged);
    setAppliedFilters(merged);
  }

  function toggleSort(key: SortKey) {
    setSortState((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "desc" ? "asc" : "desc",
        };
      }

      return {
        key,
        direction: key === "term" ? "asc" : "desc",
      };
    });
  }

  function renderSortLabel(label: string, key: SortKey) {
    if (sortState.key !== key) return label;
    return `${label} ${sortState.direction === "desc" ? "↓" : "↑"}`;
  }

  function clearKeywordSearch() {
    setTermQuery("");
    setAppliedTermQuery("");
  }

  function applyKeywordSearch() {
    setAppliedTermQuery(termQuery);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Pol1/Pol5 Explorer</p>
          <h1>Δtf og rel_df</h1>
          <p className="hero-copy">
            Compare `pol1` and `pol5` side by side. Use one mode to let terms
            bubble up by relative spread and distinctiveness, or switch to a
            keyword mode for exact ordformer.
          </p>
        </div>
        <div className="hero-stats">
          <article className="stat-card">
            <span className="stat-label">Datasets</span>
            <strong className="stat-value">POL1 + POL5</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Rows loaded</span>
            <strong className="stat-value">{fmtInt(totalRowsLoaded)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Shared visible terms</span>
            <strong className="stat-value">{fmtInt(sharedTerms.size)}</strong>
          </article>
        </div>
      </section>

      <section className="mode-switch">
        <button
          type="button"
          className={viewMode === "ranking" ? "mode-button active" : "mode-button"}
          onClick={() => setViewMode("ranking")}
        >
          La ord boble opp
        </button>
        <button
          type="button"
          className={viewMode === "keywords" ? "mode-button active" : "mode-button"}
          onClick={() => setViewMode("keywords")}
        >
          Se på nøkkelord
        </button>
      </section>

      {viewMode === "keywords" ? (
        <section className="search-panel">
          <label className="search-label">
            Nøkkelordsøk
            <textarea
              rows={4}
              placeholder="Skriv ett eller flere ord. Skill med komma eller linjeskift. Bruk * for trunkering."
              value={termQuery}
              onChange={(event) => setTermQuery(event.target.value)}
            />
          </label>
          <div className="search-actions">
            <label>
              Show rows
              <input
                type="number"
                min="20"
                max="1000"
                step="20"
                value={rowLimit}
                onChange={(event) => setRowLimit(Number(event.target.value))}
              />
            </label>
            <button type="button" className="primary-button" onClick={applyKeywordSearch}>
              Søk
            </button>
            <button type="button" onClick={clearKeywordSearch}>
              Tøm søk
            </button>
            <span className="filter-status">
              {hasPendingKeywordChanges ? "Ubrukte søkeendringer" : "Søk oppdatert"}
            </span>
          </div>
          <p className="search-help">
            {searchTerms.length > 0
              ? `Søk aktivt: ${searchTerms.join(", ")}. Treff er uavhengige av rel_df og delta-filtrene. Bruk * som jokertegn, for eksempel kommunis* eller *kommunisme.`
              : "Legg inn ett eller flere ord og trykk Søk. Bruk * som jokertegn for trunkering."}
          </p>
        </section>
      ) : (
        <>
          <section className="controls">
            <label>
              Min rel_df
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={draftFilters.minRelDf}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    minRelDf: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              Min Δtf
              <input
                type="number"
                step="0.1"
                value={draftFilters.minDeltaTf}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    minDeltaTf: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              Min Δdf
              <input
                type="number"
                step="0.1"
                value={draftFilters.minDeltaDf}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    minDeltaDf: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              Show rows
              <input
                type="number"
                min="20"
                max="1000"
                step="20"
                value={rowLimit}
                onChange={(event) => setRowLimit(Number(event.target.value))}
              />
            </label>

            <div className="control-actions">
              <button type="button" className="primary-button" onClick={applyFilters}>
                Bruk alle filtre
              </button>
              <button type="button" onClick={applyRelDfOnly}>
                Bruk rel_df
              </button>
              <button type="button" onClick={resetRankingFilters}>
                Nullstill filtre
              </button>
              <span className="filter-status">
                {hasPendingChanges ? "Ubrukte filterendringer" : "Filtre oppdatert"}
              </span>
            </div>
          </section>

          <section className="presets">
            <button type="button" onClick={() => setPreset({ minRelDf: 0.3 })}>
              rel_df &gt; 0.3
            </button>
            <button type="button" onClick={() => setPreset({ minRelDf: 0.3, minDeltaTf: 1 })}>
              rel_df &gt; 0.3 and Δtf &gt; 1
            </button>
            <button type="button" onClick={() => setPreset({ minRelDf: 0.3, minDeltaDf: 1 })}>
              rel_df &gt; 0.3 and Δdf &gt; 1
            </button>
            <button type="button" onClick={resetRankingFilters}>
              Reset
            </button>
          </section>
        </>
      )}

      {loading && <section className="panel">Loading datasets...</section>}
      {error && <section className="panel error">{error}</section>}

      {!loading && !error && (
        <section className="comparison-grid">
          {(["pol1", "pol5"] as DatasetKey[]).map((dataset) => (
            <section className="table-panel" key={dataset}>
              <div className="table-meta">
                <p>
                  <strong>{dataset.toUpperCase()}</strong>: showing{" "}
                  {fmtInt(visibleByDataset[dataset].length)} of{" "}
                  {fmtInt(filteredByDataset[dataset].length)} visible rows.
                </p>
                <p>{fmtInt(docsByDataset[dataset])} bøker i dette delkorpuset.</p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("term")}>
                          {renderSortLabel("term", "term")}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("tf_sub")}>
                          {renderSortLabel("tf", "tf_sub")}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("df_sub")}>
                          {renderSortLabel("bøker", "df_sub")}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("p_df_sub")}>
                          {renderSortLabel("rel_df", "p_df_sub")}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("delta_tf")}>
                          {renderSortLabel("Δtf", "delta_tf")}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("delta_df")}>
                          {renderSortLabel("Δdf", "delta_df")}
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-button" onClick={() => toggleSort("delta_product")}>
                          {renderSortLabel("Δtf × Δdf", "delta_product")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleByDataset[dataset].map((row) => {
                      const isShared = sharedTerms.has(row.term);
                      return (
                        <tr key={`${dataset}-${row.term}`} className={isShared ? "shared-row" : undefined}>
                          <td className="term-cell">
                            {row.term}
                            {isShared ? <span className="shared-badge">shared</span> : null}
                          </td>
                          <td>{fmtInt(row.tf_sub)}</td>
                          <td>
                            {fmtInt(row.df_sub)} av {fmtInt(docsByDataset[dataset])}
                          </td>
                          <td>{fmtNumber(row.p_df_sub, 3)}</td>
                          <td>{fmtNumber(row.delta_tf, 2)}</td>
                          <td>{fmtNumber(row.delta_df, 2)}</td>
                          <td>{fmtNumber(row.delta_tf * row.delta_df, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
      )}
    </main>
  );
}
