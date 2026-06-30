/**
 * 外部解析ツール連携・標準化API のモック実装。
 *
 * プロトタイプ用に、ALMA / MONACO などの外部ツールを呼んだ「ふり」をして
 * それらしい解析結果を返す。実運用では各ツールの REST/ファイル連携に差し替える。
 */

const TOOL_META = {
  alma: { name: 'ALMA', kind: '飛行経路・分散解析' },
  monaco: { name: 'MONACO', kind: 'モンテカルロ落下分散' },
  p4sd: { name: 'P4SD', kind: '破片落下域解析' },
  generic: { name: '外部解析ツール', kind: '汎用' },
};

// 入力値からそれっぽい疑似乱数を作る (再現性のため決定論的)
function pseudo(seedStr, i) {
  let h = 2166136261;
  const s = `${seedStr}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function runExternalAnalysis(tool, input) {
  const meta = TOOL_META[tool] || TOOL_META.generic;
  const seed = JSON.stringify(input);
  const samples = Array.from({ length: 12 }, (_, i) => ({
    t: i * 10,
    lat: 42.5 - pseudo(seed, i) * 0.5,
    lon: 143.4 + pseudo(seed, i + 100) * 0.5,
    alt: Math.round(pseudo(seed, i + 200) * 120000),
  }));
  return {
    tool: meta.name,
    kind: meta.kind,
    status: 'completed',
    receivedAt: new Date().toISOString(),
    summary: {
      ec: +(pseudo(seed, 1) * 1e-5).toExponential(2),     // Expected Casualty
      maxDownrange_km: Math.round(800 + pseudo(seed, 2) * 400),
      impactProbability: +(pseudo(seed, 3) * 1e-4).toExponential(2),
    },
    trajectory: samples,
  };
}

export function standardize(payload) {
  // 受け取った任意の解析結果を、申請向け標準スキーマ v1 に正規化する。
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  return {
    schema: 'cao-application/standard-v1',
    standardizedAt: new Date().toISOString(),
    missionName: payload.missionName || '(未設定)',
    vehicleUnit: payload.vehicleUnit || null,
    results: cases.map((c) => ({
      analysisType: c.type,
      status: c.status,
      keyMetrics: c.summary || {},
    })),
    compliance: {
      ec_threshold: 1e-4,
      ec_value: payload.ec ?? null,
      pass: payload.ec != null ? payload.ec < 1e-4 : null,
    },
  };
}
