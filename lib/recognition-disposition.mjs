// Choose the next kind of work, never repair notes or reset call budgets.
export function recognitionDisposition(value = {}) {
  const code = value.code;
  const issues = value.issues || value.checks?.errors || [];
  if (/AUTH|QUOTA|RATE_LIMIT|BUDGET|PROVIDER_POLICY/.test(code || ""))
    return {
      category: "service-stop",
      action: "stop-and-preserve",
      retryWithSource: false,
    };
  if (["MODEL_REQUEST_FAILED", "UNCERTAIN_PROVIDER_STATE"].includes(code))
    return {
      category: "transport",
      action: "verify-service-before-resume",
      retryWithSource: false,
    };
  if (
    ["INVALID_COMPACT_REGION", "INVALID_DIGITAL_REGION"].includes(code) &&
    !issues.some((i) =>
      [
        "STAFF_POSITION",
        "PITCH_DISAGREEMENT",
        "RHYTHM_GAP",
        "VOICE_GAP",
        "VOICE_OVERLAP",
        "OVERFULL_MEASURE",
        "ACCIDENTAL_STATE",
        "TIE_BOUNDARY",
        "SIMULTANEOUS_ACCIDENTAL_CONFLICT",
      ].includes(i.code),
    )
  )
    return {
      category: "data-contract",
      action: "inspect-submission-offline",
      retryWithSource: false,
    };
  if (value.sourceAssessment?.cause === "source-notation")
    return {
      category: "source-notation",
      action: "inspect-source-without-rewriting",
      retryWithSource: false,
    };
  if (
    issues.some((i) => ["OVERFULL_MEASURE", "NOTATION_BOUNDS"].includes(i.code))
  )
    return {
      category: "source-mapping",
      action: "inspect-meter-boundaries-and-rhythm",
      retryWithSource: false,
    };
  if (
    value.sourceAssessment?.cause === "image-quality" ||
    code === "INCOMPLETE_REGION"
  )
    return {
      category: "source-image",
      action: "prepare-better-source",
      retryWithSource: true,
    };
  if (issues.length || ["NEEDS_SOURCE", "NO_REGION_RESULT"].includes(code))
    return {
      category: "source-reading",
      action: "bounded-targeted-source-review",
      retryWithSource: true,
    };
  return {
    category: "unknown",
    action: "inspect-without-blind-retry",
    retryWithSource: false,
  };
}

export function recognitionStageSummary(entries, skillResults = []) {
  return {
    sources: {
      links: entries.length,
      preparedScores: entries.filter((e) => e.geometryReady).length,
      pages: entries.reduce((n, e) => n + (e.pages || 0), 0),
    },
    recognition: {
      rowsWithResult: entries.reduce((n, e) => n + e.recognizedRows, 0),
      totalRows: entries.reduce((n, e) => n + (e.totalRows || 0), 0),
      structurallyPassedRows: entries.reduce(
        (n, e) => n + (e.structurallyPassedRows || 0),
        0,
      ),
    },
    library: {
      imported: entries.filter((e) => e.imported).length,
      readbackEvidence: "verified-during-import; not a fresh library read",
    },
    artifacts: {
      drafts: skillResults.filter((s) => s.status === "draft").length,
      blocked: skillResults.filter((s) => s.status !== "draft").length,
    },
    symbolCoverage: { status: "not-scored" },
    sourceAccuracy: { status: "not-scored", humanConfirmed: false },
    browserPlayback: { status: "not-verified-by-this-report" },
  };
}
