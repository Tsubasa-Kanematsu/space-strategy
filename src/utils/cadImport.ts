import { v4 as uuidv4 } from 'uuid';
import type { MassComponent, ErrorSourceEntry } from '../types';

/**
 * CADデータのJSONスキーマ
 *
 * サポートする形式例:
 * {
 *   "mass": 45.6,
 *   "cg": { "x": 1.245, "y": 0.0, "z": 0.0 },
 *   "inertia": { "ixx": 12.5, "iyy": 450.2, "izz": 450.2, "ixy": 0, "ixz": 0, "iyz": 0 },
 *   "material": { "name": "Al6061-T6", "density": 2700, "youngModulus": 68.9, "note": "" },
 *   "debris": { "shapeType": "cylinder", "charLength": 0.8, "diameter": 0.3, "area": 0.071, "note": "" },
 *   "errorSources": [
 *     { "errorType": "加速度計バイアス", "axis": "X", "value3sigma": 0.05, "unit": "m/s²", "note": "" }
 *   ]
 * }
 */
export interface CadData {
  mass?: number;
  cg?: { x: number; y: number; z: number };
  inertia?: {
    ixx: number; iyy: number; izz: number;
    ixy?: number; ixz?: number; iyz?: number;
  };
  material?: {
    name: string;
    density?: number;
    youngModulus?: number;
    note?: string;
  };
  mounting?: {
    posX?: number;    // m, mounting position along rocket axis
    length?: number;  // m, component length
    note?: string;
  };
  debris?: {
    shapeType: string;
    charLength?: number;
    diameter?: number;
    area?: number;
    note?: string;
  };
  errorSources?: Array<{
    errorType: string;
    axis: string;
    value3sigma: number | null;
    unit: string;
    note?: string;
  }>;
}

export function parseCadJson(json: string): CadData {
  const parsed = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JSONオブジェクトではありません');
  }
  return parsed as CadData;
}

// ── アセンブリ対応 ─────────────────────────────────────────────────────────────

export interface CadAssemblyItem {
  name: string;
  data: CadData;
}

export type CadParseResult =
  | { type: 'single'; data: CadData }
  | { type: 'assembly'; items: CadAssemblyItem[] };

/**
 * CAD JSON ファイル（アセンブリ階層 or フラット質量プロパティ）を解析し、単品／アセンブリを自動判定して返す。
 *
 * アセンブリ形式（配列）:
 *   [ { "name": "Body Tube", "mass": 5.0, ... }, ... ]
 *
 * アセンブリ形式（オブジェクト）:
 *   { "components": [ { "name": "Body Tube", ... }, ... ] }
 *
 * 単品形式:
 *   { "mass": 45.6, "cg": { ... }, ... }
 */
export function parseCadFile(json: string): CadParseResult {
  const parsed: unknown = JSON.parse(json);

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error('コンポーネントが含まれていません');
    return {
      type: 'assembly',
      items: (parsed as Record<string, unknown>[]).map((item, i) => ({
        name: typeof item.name === 'string' ? item.name : `コンポーネント ${i + 1}`,
        data: item as CadData,
      })),
    };
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.components) && obj.components.length > 0) {
      return {
        type: 'assembly',
        items: (obj.components as Record<string, unknown>[]).map((item, i) => ({
          name: typeof item.name === 'string' ? item.name : `コンポーネント ${i + 1}`,
          data: item as CadData,
        })),
      };
    }
    return { type: 'single', data: obj as CadData };
  }

  throw new Error('JSONオブジェクトではありません');
}

/** CadData から MassComponent の部分更新オブジェクトを生成 */
export function cadDataToComponentUpdate(
  cadData: CadData,
  fileName: string
): Partial<MassComponent> {
  const update: Partial<MassComponent> = {
    cadFile: fileName,
    cadLastImported: new Date().toISOString(),
  };

  if (cadData.mass !== undefined && cadData.mass !== null) {
    update.actualMass = cadData.mass;
    update.actualMassEvidence = `CADインポート: ${fileName}`;
  }

  if (cadData.cg) {
    update.cgX = cadData.cg.x ?? null;
    update.cgY = cadData.cg.y ?? null;
    update.cgZ = cadData.cg.z ?? null;
    update.cgEvidence = `CADインポート: ${fileName}`;
  }

  if (cadData.inertia) {
    update.ixx = cadData.inertia.ixx ?? null;
    update.iyy = cadData.inertia.iyy ?? null;
    update.izz = cadData.inertia.izz ?? null;
    update.ixy = cadData.inertia.ixy ?? null;
    update.ixz = cadData.inertia.ixz ?? null;
    update.iyz = cadData.inertia.iyz ?? null;
    update.inertiaEvidence = `CADインポート: ${fileName}`;
  }

  if (cadData.material) {
    update.materialName = cadData.material.name;
    update.materialDensity = cadData.material.density ?? null;
    update.materialYoungModulus = cadData.material.youngModulus ?? null;
    update.materialNote = cadData.material.note ?? '';
  }

  if (cadData.mounting) {
    if (cadData.mounting.posX !== undefined) update.mountPosX = cadData.mounting.posX;
    if (cadData.mounting.length !== undefined) update.lengthM = cadData.mounting.length;
    if (cadData.mounting.note !== undefined) update.mountNote = cadData.mounting.note;
  }

  if (cadData.debris) {
    update.debrisShapeType = cadData.debris.shapeType;
    update.debrisCharLength = cadData.debris.charLength ?? null;
    update.debrisDiameter = cadData.debris.diameter ?? null;
    update.debrisArea = cadData.debris.area ?? null;
    update.debrisNote = cadData.debris.note ?? '';
  }

  if (cadData.errorSources) {
    update.errorSources = cadData.errorSources.map((es) => ({
      id: uuidv4(),
      errorType: es.errorType,
      axis: es.axis,
      value3sigma: es.value3sigma,
      unit: es.unit,
      note: es.note ?? '',
    } satisfies ErrorSourceEntry));
  }

  return update;
}

// ── CSV インポート ─────────────────────────────────────────────────────────────

/**
 * CSV ファイルを解析して CadParseResult を返す。
 *
 * ヘッダー行 (1行目) の列名でフィールドを自動判定する。
 * 必須列: name
 * オプション列: mass_kg, cg_x_m, cg_y_m, cg_z_m,
 *              ixx_kgm2, iyy_kgm2, izz_kgm2, ixy_kgm2, ixz_kgm2, iyz_kgm2,
 *              material_name, material_density_kgm3, material_youngs_gpa, material_note,
 *              mount_pos_x_m, length_m, mount_note
 */
export function parseCadCsv(csv: string): CadParseResult {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV にデータ行がありません（ヘッダー + 1行以上必要）');

  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (const ch of row) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => headers.indexOf(name);

  const getNum = (cells: string[], name: string): number | undefined => {
    const i = col(name);
    if (i < 0 || i >= cells.length) return undefined;
    const v = parseFloat(cells[i]);
    return isNaN(v) ? undefined : v;
  };
  const getStr = (cells: string[], name: string): string | undefined => {
    const i = col(name);
    if (i < 0 || i >= cells.length) return undefined;
    const v = cells[i];
    return v === '' ? undefined : v;
  };

  const items: CadAssemblyItem[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseRow(lines[r]);
    const nameIdx = col('name');
    const name = nameIdx >= 0 ? (cells[nameIdx] || `Row ${r}`) : `Row ${r}`;

    const data: CadData = {};

    const mass = getNum(cells, 'mass_kg');
    if (mass !== undefined) data.mass = mass;

    const cgX = getNum(cells, 'cg_x_m');
    const cgY = getNum(cells, 'cg_y_m');
    const cgZ = getNum(cells, 'cg_z_m');
    if (cgX !== undefined || cgY !== undefined || cgZ !== undefined) {
      data.cg = { x: cgX ?? 0, y: cgY ?? 0, z: cgZ ?? 0 };
    }

    const ixx = getNum(cells, 'ixx_kgm2');
    const iyy = getNum(cells, 'iyy_kgm2');
    const izz = getNum(cells, 'izz_kgm2');
    if (ixx !== undefined || iyy !== undefined || izz !== undefined) {
      data.inertia = {
        ixx: ixx ?? 0, iyy: iyy ?? 0, izz: izz ?? 0,
        ixy: getNum(cells, 'ixy_kgm2'),
        ixz: getNum(cells, 'ixz_kgm2'),
        iyz: getNum(cells, 'iyz_kgm2'),
      };
    }

    const matName = getStr(cells, 'material_name');
    if (matName) {
      data.material = {
        name: matName,
        density: getNum(cells, 'material_density_kgm3'),
        youngModulus: getNum(cells, 'material_youngs_gpa'),
        note: getStr(cells, 'material_note') ?? '',
      };
    }

    const mountX = getNum(cells, 'mount_pos_x_m');
    const mountLen = getNum(cells, 'length_m');
    if (mountX !== undefined || mountLen !== undefined) {
      data.mounting = {
        posX: mountX,
        length: mountLen,
        note: getStr(cells, 'mount_note') ?? '',
      };
    }

    items.push({ name, data });
  }

  if (items.length === 0) throw new Error('CSV にデータ行がありません');
  if (items.length === 1) return { type: 'single', data: items[0].data };
  return { type: 'assembly', items };
}

/** インポートされたデータのサマリを人間が読める形で返す */
export function getCadImportSummary(cadData: CadData): string[] {
  const items: string[] = [];
  if (cadData.mass !== undefined) items.push(`質量: ${cadData.mass} kg`);
  if (cadData.cg) items.push(`重心: (${cadData.cg.x}, ${cadData.cg.y}, ${cadData.cg.z}) m`);
  if (cadData.inertia) items.push(`慣性テンソル: Ixx=${cadData.inertia.ixx}, Iyy=${cadData.inertia.iyy}, Izz=${cadData.inertia.izz} kg·m²`);
  if (cadData.material) items.push(`材質: ${cadData.material.name}`);
  if (cadData.mounting) {
    const parts: string[] = [];
    if (cadData.mounting.posX !== undefined) parts.push(`X=${cadData.mounting.posX} m`);
    if (cadData.mounting.length !== undefined) parts.push(`L=${cadData.mounting.length} m`);
    if (parts.length) items.push(`搭載: ${parts.join(', ')}`);
  }
  if (cadData.debris) items.push(`破片形状: ${cadData.debris.shapeType}`);
  if (cadData.errorSources?.length) items.push(`機体系誤差源: ${cadData.errorSources.length} 件`);
  return items;
}
