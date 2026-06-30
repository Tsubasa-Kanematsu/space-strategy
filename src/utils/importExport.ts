import type { Project, MassCase, MassComponent, Parameter, SizingCase, SizingResult } from '../types';

export interface ExportData {
  version: '1.0';
  exportedAt: string;
  projects: Project[];
  massCases: MassCase[];
  components: MassComponent[];
  parameters: Parameter[];
  sizingCases: SizingCase[];
  sizingResults: SizingResult[];
}

export function exportToJSON(data: Omit<ExportData, 'version' | 'exportedAt'>): string {
  const exportData: ExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    ...data,
  };
  return JSON.stringify(exportData, null, 2);
}

export function importFromJSON(jsonStr: string): ExportData {
  const data = JSON.parse(jsonStr) as ExportData;
  if (data.version !== '1.0') throw new Error('Unsupported export version');
  return data;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  // Prepend UTF-8 BOM for Excel compatibility with Japanese characters
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CSV_HEADERS = [
  // component_id = logicalId (再 import 時に同一エンティティと識別する主キー)。
  // 同名 paramName が大量にあっても、ID 一致なら確実に元のコンポーネントを更新できる。
  'component_id',
  'level', 'parent_var_name', 'param_name', 'var_name', 'stage', 'tags',
  'is_propellant',
  'input_type', 'value_formula', 'allocated_mass_kg', 'actual_mass_kg', 'actual_mass_mode', 'actual_mass_evidence',
  'cg_reference', 'local_origin_x_m', 'local_origin_y_m', 'local_origin_z_m',
  'cg_x_m', 'cg_y_m', 'cg_z_m', 'cg_evidence',
  'ixx_kgm2', 'iyy_kgm2', 'izz_kgm2', 'ixy_kgm2', 'ixz_kgm2', 'iyz_kgm2', 'inertia_evidence',
  'cg_inertia_mode',
  'material_name', 'material_density_kgm3', 'material_density_unit', 'material_youngs_gpa', 'material_note',
  'mount_pos_x_m', 'mount_end_x_m',
  'mount_pos_y_m', 'mount_end_y_m',
  'mount_pos_z_m', 'mount_end_z_m',
  'length_m', 'mount_note',
  // リンクグループ (round-trip でクローン/マスター関係を保つ)
  'link_group_id', 'is_link_master',
  // CAD 参照
  'cad_file', 'cad_last_imported', 'cad_software', 'cad_revision', 'cad_file_path',
] as const;

const n = (v: number | null | undefined) => (v != null ? String(v) : '');
const s = (v: string | null | undefined) => v ?? '';

/** Export a single mass case's components to CSV */
export function exportComponentsToCSV(
  massCase: MassCase,
  components: MassComponent[],
  _parameters?: Parameter[]
): string {
  // Build parentId → varName lookup for human-readable parent references
  const idToVar = new Map(components.map((c) => [c.logicalId || c.id, c.varName]));
  // tagDefinition id → name lookup for human-readable tag names in CSV
  const tagDefs = massCase.tagDefinitions ?? [];
  const tagIdToName = new Map(tagDefs.map((d) => [d.id, d.name]));

  // DFS 順 (親→直下子→孫…) で出力する。varName 無しデータでも import の
  // 「level-1 の直前行を親と推定」 ロジックが正しく動くため。BFS だと壊れる。
  const sorted: MassComponent[] = [];
  const visit = (parentLid: string | null) => {
    const children = components
      .filter((c) => (c.parentId ?? null) === parentLid && !c.isDeleted)
      .sort((a, b) => a.order - b.order);
    for (const c of children) {
      sorted.push(c);
      visit(c.logicalId || c.id);
    }
  };
  visit(null);

  const b = (v: boolean | undefined) => v ? 'true' : '';
  const rows: string[][] = [CSV_HEADERS as unknown as string[]];
  sorted.forEach((c) => {
    // tags: id配列 → name配列 に変換（未解決の id はそのまま残す）
    const tagNames = (c.tags ?? [])
      .map((id) => tagIdToName.get(id) ?? id)
      .join(';') || 'structure';
    rows.push([
      s(c.logicalId || c.id),
      String(c.level),
      s(c.parentId ? idToVar.get(c.parentId) : ''),
      s(c.paramName), s(c.varName), s(c.stage), tagNames,
      b(c.isPropellant),
      s(c.inputType), s(c.valueOrFormula),
      n(c.allocatedMass), n(c.actualMass), s(c.actualMassMode), s(c.actualMassEvidence),
      s(c.cgReference ?? 'local'), n(c.localOriginX), n(c.localOriginY), n(c.localOriginZ),
      n(c.cgX), n(c.cgY), n(c.cgZ), s(c.cgEvidence),
      n(c.ixx), n(c.iyy), n(c.izz), n(c.ixy), n(c.ixz), n(c.iyz), s(c.inertiaEvidence),
      s(c.cgInertiaMode),
      s(c.materialName), n(c.materialDensity), s(c.materialDensityUnit), n(c.materialYoungModulus), s(c.materialNote),
      n(c.mountPosX), n(c.mountEndX),
      n(c.mountPosY), n(c.mountEndY),
      n(c.mountPosZ), n(c.mountEndZ),
      n(c.lengthM), s(c.mountNote),
      s(c.linkGroupId), b(c.isLinkMaster),
      s(c.cadFile), s(c.cadLastImported), s(c.cadSoftware), s(c.cadRevision), s(c.cadFilePath),
    ]);
  });

  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

export interface ComponentImportRow {
  /** export 時の logicalId。再 import で既存を確実に識別するための主キー (任意) */
  componentId: string;
  level: number;
  parentVarName: string;
  paramName: string;
  varName: string;
  stage: string;
  tags: string[];
  isPropellant: boolean;
  inputType: string;
  valueOrFormula: string;
  allocatedMass: number | null;
  actualMass: number | null;
  actualMassMode: 'aggregate' | 'fixed' | '';
  actualMassEvidence: string;
  cgReference: string;
  localOriginX: number | null; localOriginY: number | null; localOriginZ: number | null;
  cgX: number | null; cgY: number | null; cgZ: number | null;
  cgEvidence: string;
  ixx: number | null; iyy: number | null; izz: number | null;
  ixy: number | null; ixz: number | null; iyz: number | null;
  inertiaEvidence: string;
  cgInertiaMode: 'aggregate' | 'manual' | '';
  materialName: string;
  materialDensity: number | null;
  materialDensityUnit: string;
  materialYoungModulus: number | null;
  materialNote: string;
  mountPosX: number | null;
  mountEndX: number | null;
  mountPosY: number | null;
  mountEndY: number | null;
  mountPosZ: number | null;
  mountEndZ: number | null;
  lengthM: number | null;
  mountNote: string;
  linkGroupId: string;
  isLinkMaster: boolean;
  cadFile: string;
  cadLastImported: string;
  cadSoftware: string;
  cadRevision: string;
  cadFilePath: string;
}

function parseRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function parseNum(v: string): number | null {
  if (v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** Parse a CSV exported by exportComponentsToCSV back into import rows */
export function importComponentsFromCSV(csv: string): ComponentImportRow[] {
  const lines = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV にデータ行がありません（ヘッダー + 1行以上必要）');

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => headers.indexOf(name);

  const get = (cells: string[], name: string) => {
    const i = col(name);
    return i >= 0 && i < cells.length ? cells[i] : '';
  };

  const rows: ComponentImportRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseRow(lines[r]);
    rows.push({
      componentId: get(cells, 'component_id'),
      level: parseInt(get(cells, 'level')) || 0,
      parentVarName: get(cells, 'parent_var_name'),
      paramName: get(cells, 'param_name'),
      varName: get(cells, 'var_name'),
      stage: get(cells, 'stage') || 'all',
      tags: (() => {
        // 新形式: tags セミコロン区切り / 旧形式: category 単一値
        const raw = get(cells, 'tags') || get(cells, 'category');
        if (!raw) return [];
        return raw.split(';').map((t) => t.trim()).filter((t) => t.length > 0);
      })(),
      isPropellant: parseBool(get(cells, 'is_propellant')),
      inputType: get(cells, 'input_type') || 'fixed',
      valueOrFormula: get(cells, 'value_formula'),
      allocatedMass: parseNum(get(cells, 'allocated_mass_kg')),
      actualMass: parseNum(get(cells, 'actual_mass_kg')),
      actualMassMode: (() => {
        const v = get(cells, 'actual_mass_mode');
        return v === 'aggregate' || v === 'fixed' ? v : '';
      })(),
      actualMassEvidence: get(cells, 'actual_mass_evidence'),
      cgReference: get(cells, 'cg_reference') || 'local',
      localOriginX: parseNum(get(cells, 'local_origin_x_m')),
      localOriginY: parseNum(get(cells, 'local_origin_y_m')),
      localOriginZ: parseNum(get(cells, 'local_origin_z_m')),
      cgX: parseNum(get(cells, 'cg_x_m')),
      cgY: parseNum(get(cells, 'cg_y_m')),
      cgZ: parseNum(get(cells, 'cg_z_m')),
      cgEvidence: get(cells, 'cg_evidence'),
      ixx: parseNum(get(cells, 'ixx_kgm2')),
      iyy: parseNum(get(cells, 'iyy_kgm2')),
      izz: parseNum(get(cells, 'izz_kgm2')),
      ixy: parseNum(get(cells, 'ixy_kgm2')),
      ixz: parseNum(get(cells, 'ixz_kgm2')),
      iyz: parseNum(get(cells, 'iyz_kgm2')),
      inertiaEvidence: get(cells, 'inertia_evidence'),
      cgInertiaMode: (() => {
        const v = get(cells, 'cg_inertia_mode');
        return v === 'aggregate' || v === 'manual' ? v : '';
      })(),
      materialName: get(cells, 'material_name'),
      materialDensity: parseNum(get(cells, 'material_density_kgm3')),
      materialDensityUnit: get(cells, 'material_density_unit'),
      materialYoungModulus: parseNum(get(cells, 'material_youngs_gpa')),
      materialNote: get(cells, 'material_note'),
      mountPosX: parseNum(get(cells, 'mount_pos_x_m')),
      mountEndX: parseNum(get(cells, 'mount_end_x_m')),
      mountPosY: parseNum(get(cells, 'mount_pos_y_m')),
      mountEndY: parseNum(get(cells, 'mount_end_y_m')),
      mountPosZ: parseNum(get(cells, 'mount_pos_z_m')),
      mountEndZ: parseNum(get(cells, 'mount_end_z_m')),
      lengthM: parseNum(get(cells, 'length_m')),
      mountNote: get(cells, 'mount_note'),
      linkGroupId: get(cells, 'link_group_id'),
      isLinkMaster: parseBool(get(cells, 'is_link_master')),
      cadFile: get(cells, 'cad_file'),
      cadLastImported: get(cells, 'cad_last_imported'),
      cadSoftware: get(cells, 'cad_software'),
      cadRevision: get(cells, 'cad_revision'),
      cadFilePath: get(cells, 'cad_file_path'),
    });
  }
  return rows;
}

/** Export sizing results to CSV */
export function exportSizingResultsToCSV(
  _sizingCase: SizingCase,
  results: SizingResult[]
): string {
  if (results.length === 0) return '';

  const maxStages = Math.max(...results.map((r) => r.propellantMassPerStage.length), 1);
  const stageHeaders = Array.from({ length: maxStages }, (_, i) =>
    [`推進剤質量_Stage${i + 1}(kg)`, `推進剤比_Stage${i + 1}`, `構造効率_Stage${i + 1}`]
  ).flat();

  const headers = ['No', 'ΔV(m/s)', ...Array.from({ length: maxStages }, (_, i) => `Isp_Stage${i + 1}(s)`),
    '総質量(kg)', 'GPR', ...stageHeaders];

  const rows: string[][] = [headers];

  results.forEach((r) => {
    const ispCols = Array.from({ length: maxStages }, (_, i) =>
      String(r.condition.ispPerStage[i] ?? '')
    );
    const stageCols = Array.from({ length: maxStages }, (_, i) => [
      r.propellantMassPerStage[i] !== undefined ? r.propellantMassPerStage[i].toFixed(1) : '',
      r.propellantRatioPerStage[i] !== undefined ? r.propellantRatioPerStage[i].toFixed(4) : '',
      r.structuralEfficiencyPerStage[i] !== undefined ? r.structuralEfficiencyPerStage[i].toFixed(4) : '',
    ]).flat();

    rows.push([
      String(r.no),
      String(r.condition.deltaV),
      ...ispCols,
      r.totalMass.toFixed(1),
      r.grossPayloadRatio.toFixed(4),
      ...stageCols,
    ]);
  });

  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}
