// ============================================================================
// STEP (ISO 10303) ファイルの簡易パーサ
//
// 純粋にテキスト/正規表現ベースで以下を抽出する:
//  - PRODUCT 名 (フラットリスト)
//  - アセンブリ階層 (NEXT_ASSEMBLY_USAGE_OCCURRENCE 経由)
//  - 検証プロパティ: 体積 / 表面積 / 質量 / 重心 / 慣性テンソル (含まれている場合)
//
// B-rep 形状そのものは解析しない。
// ============================================================================

export interface StepNode {
  name: string;
  children: StepNode[];
  // 検証プロパティ (存在する場合のみ。SI単位 = m, kg)
  volumeM3?: number;
  surfaceAreaM2?: number;
  massKg?: number;
  cgX?: number;
  cgY?: number;
  cgZ?: number;
  ixx?: number;
  iyy?: number;
  izz?: number;
  ixy?: number;
  ixz?: number;
  iyz?: number;
  // 搭載位置 (親アセンブリ内での相対位置 → ルートから累積した絶対位置, m)
  originX?: number;
  originY?: number;
  originZ?: number;
  // GVP のバウンディングボックス (絶対座標, m)
  bboxMinX?: number;
  bboxMinY?: number;
  bboxMinZ?: number;
  bboxMaxX?: number;
  bboxMaxY?: number;
  bboxMaxZ?: number;
}

export interface StepParseResult {
  productNames: string[];
  roots: StepNode[];
  hasVolume: boolean;
  hasArea: boolean;
  hasMass: boolean;
  hasCG: boolean;
  hasInertia: boolean;
  hasMountPos: boolean;
  hasBBox: boolean;
  fileSchema?: string;
  cadSoftware?: string;
  /** 単位推定 (長さ): 'mm' | 'm' | 'unknown' */
  lengthUnit: 'mm' | 'm' | 'unknown';
}

// ─── ヘルパ ─────────────────────────────────────────────────────────────────

const HEADER_RE = /HEADER;([\s\S]*?)ENDSEC;/;
const FILE_NAME_RE = /FILE_NAME\s*\(([^)]*)\)/;
const FILE_SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/;

/** "#NN=ENTITY(...);" の形式に分割。改行や余分な空白を吸収する。 */
function splitEntities(text: string): Array<{ id: number; type: string; body: string }> {
  // DATA;...ENDSEC; の中だけ
  const dataMatch = text.match(/DATA;([\s\S]*?)ENDSEC;/);
  const body = dataMatch ? dataMatch[1] : text;
  // ;で分割。エンティティ内の文字列に;が含まれることはまずない (STEPでは ' でクォート)
  const lines = body.split(';');
  const out: Array<{ id: number; type: string; body: string }> = [];
  const re = /^\s*#(\d+)\s*=\s*([A-Z_][A-Z0-9_]*)\s*\(([\s\S]*)\)\s*$/;
  for (const raw of lines) {
    const m = raw.match(re);
    if (!m) continue;
    out.push({ id: parseInt(m[1], 10), type: m[2], body: m[3] });
  }
  return out;
}

/** STEP引数文字列を「'文字列' / #数字 / リテラル」のトークン列に分割 */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      buf += ch;
      if (ch === "'" && s[i + 1] !== "'") inStr = false;
      continue;
    }
    if (ch === "'") { inStr = true; buf += ch; continue; }
    if (ch === '(') { depth++; buf += ch; continue; }
    if (ch === ')') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const stripQuotes = (s: string): string => s.startsWith("'") && s.endsWith("'") ? s.slice(1, -1) : s;
const refId = (s: string): number | null => {
  const m = s.match(/^#(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
};
const allRefIds = (s: string): number[] => {
  const ids: number[] = [];
  const re = /#(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) ids.push(parseInt(m[1], 10));
  return ids;
};

// ─── メイン ─────────────────────────────────────────────────────────────────

export function parseStep(text: string): StepParseResult {
  // ── ヘッダ
  const header = text.match(HEADER_RE)?.[1] ?? '';
  const fileNameMatch = header.match(FILE_NAME_RE);
  let cadSoftware: string | undefined;
  if (fileNameMatch) {
    // FILE_NAME(name, time, author, organization, preprocessor, originating_system, authorization)
    // 6番目 = originating_system
    const args = splitArgs(fileNameMatch[1]);
    if (args.length >= 6) cadSoftware = stripQuotes(args[5]);
  }
  const fileSchema = header.match(FILE_SCHEMA_RE)?.[1];

  // ── 単位推定 (CATIAは MILLI/METRE = mm)
  let lengthUnit: 'mm' | 'm' | 'unknown' = 'unknown';
  if (/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text)) lengthUnit = 'mm';
  else if (/SI_UNIT\s*\(\s*\$?\s*,\s*\.METRE\.\s*\)/.test(text)) lengthUnit = 'm';

  const lengthScale = lengthUnit === 'mm' ? 1e-3 : 1; // → m
  const volumeScale = Math.pow(lengthScale, 3);       // → m³
  const areaScale = Math.pow(lengthScale, 2);         // → m²

  // ── エンティティ収集
  const entities = splitEntities(text);

  type Ent = { id: number; type: string; args: string[] };
  const byId = new Map<number, Ent>();
  for (const e of entities) {
    byId.set(e.id, { id: e.id, type: e.type, args: splitArgs(e.body) });
  }

  // ── PRODUCT id → name
  const productName = new Map<number, string>();
  // PRODUCT_DEFINITION_FORMATION* id → product_id
  const pdfToProduct = new Map<number, number>();
  // PRODUCT_DEFINITION id → pdf_id
  const pdToPdf = new Map<number, number>();
  // PRODUCT_DEFINITION_SHAPE id → pd_id
  const pdsToPd = new Map<number, number>();
  // SHAPE_ASPECT id → pds_id (3rd arg)
  const shapeAspectToPds = new Map<number, number>();
  // PROPERTY_DEFINITION id → ref_id (sa or pds)
  const propDefToRef = new Map<number, number>();
  // REPRESENTATION id → item ids
  const reprToItems = new Map<number, number[]>();
  // PROPERTY_DEFINITION_REPRESENTATION → (pd_id, repr_id)
  const pdrPairs: Array<{ pdId: number; reprId: number }> = [];
  // SHAPE_REPRESENTATION 系も同じ扱い
  // MEASURE_REPRESENTATION_ITEM id → { kind, value }
  type Measure = { kind: string; value: number };
  const measures = new Map<number, Measure>();
  // CARTESIAN_POINT id → { name, coords }
  const cartPoints = new Map<number, { name: string; x: number; y: number; z: number }>();
  // NEXT_ASSEMBLY_USAGE_OCCURRENCE: { id, parent_pd_id, child_pd_id }
  const naoPairs: Array<{ id: number; parentPd: number; childPd: number }> = [];
  // CONTEXT_DEPENDENT_SHAPE_REPRESENTATION: representation_id (composite) → product_definition_shape_id
  // PRODUCT_DEFINITION_SHAPE.definition can be NAUO or PD
  // We track: cdsr_relRep, cdsr_definition (PDS)
  const cdsrEntries: Array<{ relRepId: number; defId: number }> = [];
  // PDS as NAUO wrapper: pds_id → nauo_id (when pds.definition is a NAUO)
  const pdsToNauo = new Map<number, number>();
  // composite "(REPRESENTATION_RELATIONSHIP(...)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#TX)...)" の id → idt_id
  const compositeToIdt = new Map<number, number>();
  // ITEM_DEFINED_TRANSFORMATION id → ax2_id (transform_item_2)
  const idtToAx2 = new Map<number, number>();
  // AXIS2_PLACEMENT_3D id → cartesian_point_id (location)
  const ax2ToPoint = new Map<number, number>();

  for (const e of byId.values()) {
    const t = e.type;
    const a = e.args;
    if (t === 'PRODUCT') {
      productName.set(e.id, stripQuotes(a[0] ?? ''));
    } else if (t === 'PRODUCT_DEFINITION_FORMATION' || t === 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE') {
      // (id, desc, product) — productは3番目
      const pid = refId(a[2] ?? '');
      if (pid !== null) pdfToProduct.set(e.id, pid);
    } else if (t === 'PRODUCT_DEFINITION') {
      // (id, desc, formation, frame_of_reference) — formationは3番目
      const pdfId = refId(a[2] ?? '');
      if (pdfId !== null) pdToPdf.set(e.id, pdfId);
    } else if (t === 'PRODUCT_DEFINITION_SHAPE') {
      // (name, desc, definition) — definition (PD)は3番目
      const pdId = refId(a[2] ?? '');
      if (pdId !== null) pdsToPd.set(e.id, pdId);
    } else if (t === 'SHAPE_ASPECT') {
      // (name, desc, of_shape, product_definitional) — of_shapeは3番目
      const pdsId = refId(a[2] ?? '');
      if (pdsId !== null) shapeAspectToPds.set(e.id, pdsId);
    } else if (t === 'PROPERTY_DEFINITION') {
      // (name, desc, definition) — definitionは3番目 (SAまたはPDS)
      const ref = refId(a[2] ?? '');
      if (ref !== null) propDefToRef.set(e.id, ref);
    } else if (t === 'PROPERTY_DEFINITION_REPRESENTATION' || t === 'SHAPE_DEFINITION_REPRESENTATION') {
      // (definition, used_representation)
      const pdId = refId(a[0] ?? '');
      const reprId = refId(a[1] ?? '');
      if (pdId !== null && reprId !== null) pdrPairs.push({ pdId, reprId });
    } else if (t === 'REPRESENTATION' || t === 'SHAPE_REPRESENTATION') {
      // (name, items, context_of_items) — items は2番目 (リスト)
      const itemsArg = a[1] ?? '';
      reprToItems.set(e.id, allRefIds(itemsArg));
    } else if (t === 'MEASURE_REPRESENTATION_ITEM') {
      // (name, value_component, unit_component)
      // value_component は VOLUME_MEASURE(123.45) など
      const name = stripQuotes(a[0] ?? '').toLowerCase();
      const valStr = a[1] ?? '';
      const num = valStr.match(/\(\s*([+-]?[0-9.eE+-]+)\s*\)/);
      if (num) measures.set(e.id, { kind: name, value: parseFloat(num[1]) });
    } else if (t === 'CARTESIAN_POINT') {
      const name = stripQuotes(a[0] ?? '').toLowerCase();
      const coordsStr = a[1] ?? '';
      const nums = coordsStr.match(/-?[0-9.eE+-]+/g);
      if (nums && nums.length >= 3) {
        cartPoints.set(e.id, {
          name,
          x: parseFloat(nums[0]),
          y: parseFloat(nums[1]),
          z: parseFloat(nums[2]),
        });
      }
    } else if (t === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') {
      // (id, name, desc, relating_PD, related_PD, ref_designator)
      const parent = refId(a[3] ?? '');
      const child = refId(a[4] ?? '');
      if (parent !== null && child !== null) naoPairs.push({ id: e.id, parentPd: parent, childPd: child });
    } else if (t === 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION') {
      // (representation_relation, represented_product_relation)
      const rrId = refId(a[0] ?? '');
      const defId = refId(a[1] ?? '');
      if (rrId !== null && defId !== null) cdsrEntries.push({ relRepId: rrId, defId });
    } else if (t === 'ITEM_DEFINED_TRANSFORMATION') {
      // (name, desc, transform_item_1, transform_item_2)
      // 通常 transform_item_2 が「子の親内座標系」を示す
      const ax2Id = refId(a[3] ?? '');
      if (ax2Id !== null) idtToAx2.set(e.id, ax2Id);
    } else if (t === 'AXIS2_PLACEMENT_3D') {
      // (name, location, axis, ref_direction)
      const pId = refId(a[1] ?? '');
      if (pId !== null) ax2ToPoint.set(e.id, pId);
    }
  }

  // ── PRODUCT_DEFINITION_SHAPE が NAUO を definition として持つケース
  // PDS の3番目引数 (definition) は PD または NAUO
  // すでに pdsToPd に PD として登録されたものは除外、NAUO を指している場合だけ pdsToNauo にも登録
  const naoIdSet = new Set(naoPairs.map((p) => p.id));
  for (const e of byId.values()) {
    if (e.type !== 'PRODUCT_DEFINITION_SHAPE') continue;
    const def = refId(e.args[2] ?? '');
    if (def !== null && naoIdSet.has(def)) pdsToNauo.set(e.id, def);
  }

  // ── 複合エンティティ(REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION) の解決
  // splitEntities では type が空の "(REPRESENTATION_RELATIONSHIP(...)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#TX)..)" 形式は
  // 標準の type 正規表現にマッチしないためここで再パース
  const compositeRe = /^#(\d+)\s*=\s*\(/;
  const txRe = /REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\s*\(\s*#(\d+)\s*\)/;
  for (const line of (text.match(/DATA;([\s\S]*?)ENDSEC;/)?.[1] ?? '').split(';')) {
    const trimmed = line.trim();
    const m = trimmed.match(compositeRe);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    const tx = trimmed.match(txRe);
    if (tx) compositeToIdt.set(id, parseInt(tx[1], 10));
  }

  // ── PD id → product name 解決ヘルパ
  const pdToProductName = (pdId: number): string | null => {
    const pdfId = pdToPdf.get(pdId);
    if (pdfId === undefined) return null;
    const pid = pdfToProduct.get(pdfId);
    if (pid === undefined) return null;
    return productName.get(pid) ?? null;
  };

  // ── PROPERTY_DEFINITION → product name
  const propDefToProductName = (pdRefId: number): string | null => {
    const ref = propDefToRef.get(pdRefId);
    if (ref === undefined) return null;
    // ref は SHAPE_ASPECT または PRODUCT_DEFINITION_SHAPE
    let pdsId = pdsToPd.has(ref) ? ref : shapeAspectToPds.get(ref);
    if (pdsId === undefined) return null;
    const pdId = pdsToPd.get(pdsId);
    if (pdId === undefined) return null;
    return pdToProductName(pdId);
  };

  // ── 検証プロパティを部品名にマージ
  const propsByName = new Map<string, Partial<StepNode>>();
  const ensure = (name: string): Partial<StepNode> => {
    let p = propsByName.get(name);
    if (!p) { p = {}; propsByName.set(name, p); }
    return p;
  };

  for (const { pdId, reprId } of pdrPairs) {
    const productNameStr = propDefToProductName(pdId);
    if (!productNameStr) continue;
    const items = reprToItems.get(reprId);
    if (!items) continue;
    const node = ensure(productNameStr);
    const bboxCorners: Array<{ x: number; y: number; z: number }> = [];
    for (const itemId of items) {
      const m = measures.get(itemId);
      if (m) {
        if (m.kind.includes('volume')) node.volumeM3 = m.value * volumeScale;
        else if (m.kind.includes('area')) node.surfaceAreaM2 = m.value * areaScale;
        else if (m.kind.includes('mass')) node.massKg = m.value;
      }
      const cp = cartPoints.get(itemId);
      if (cp) {
        // 重心: 'centroid' / 'centre of mass' / 'centre point' / 'center point'
        if (cp.name.includes('centroid') || cp.name.includes('centre of mass') || cp.name.includes('center of mass') ||
            cp.name === 'centre point' || cp.name === 'center point') {
          node.cgX = cp.x * lengthScale;
          node.cgY = cp.y * lengthScale;
          node.cgZ = cp.z * lengthScale;
        }
        // バウンディングボックス: 'bounding box corner point' (2点で min/max を構成)
        else if (cp.name.includes('bounding box') || cp.name.includes('bbox')) {
          bboxCorners.push({ x: cp.x * lengthScale, y: cp.y * lengthScale, z: cp.z * lengthScale });
        }
      }
    }
    if (bboxCorners.length >= 2) {
      node.bboxMinX = Math.min(...bboxCorners.map((p) => p.x));
      node.bboxMaxX = Math.max(...bboxCorners.map((p) => p.x));
      node.bboxMinY = Math.min(...bboxCorners.map((p) => p.y));
      node.bboxMaxY = Math.max(...bboxCorners.map((p) => p.y));
      node.bboxMinZ = Math.min(...bboxCorners.map((p) => p.z));
      node.bboxMaxZ = Math.max(...bboxCorners.map((p) => p.z));
    }
  }

  // ── 全PRODUCT名
  const allProductNames = Array.from(productName.values()).filter((n) => n.length > 0);
  const uniqueProductNames = Array.from(new Set(allProductNames));

  // ── NAUO ID → 子の親内相対位置 (CARTESIAN_POINT.coords を mm/m → m に換算)
  // チェーン: NAUO (id) ← PDS (definition=NAUO) ← CDSR (def=PDS, relRep=composite) → composite → IDT → AX2 → CARTESIAN_POINT
  const nauoToOrigin = new Map<number, { x: number; y: number; z: number }>();
  // pdsToNauo の逆引き
  const nauoToPds = new Map<number, number>();
  pdsToNauo.forEach((nauoId, pdsId) => { nauoToPds.set(nauoId, pdsId); });

  for (const { relRepId, defId } of cdsrEntries) {
    const nauoId = pdsToNauo.get(defId);
    if (nauoId === undefined) continue;
    const idtId = compositeToIdt.get(relRepId);
    if (idtId === undefined) continue;
    const ax2Id = idtToAx2.get(idtId);
    if (ax2Id === undefined) continue;
    const pId = ax2ToPoint.get(ax2Id);
    if (pId === undefined) continue;
    const pt = cartPoints.get(pId);
    if (!pt) continue;
    nauoToOrigin.set(nauoId, { x: pt.x * lengthScale, y: pt.y * lengthScale, z: pt.z * lengthScale });
  }

  // ── アセンブリ階層を name レベルで構築
  const childToParent = new Map<string, string>(); // childName → parentName
  const parentToChildren = new Map<string, string[]>();
  const childNames = new Set<string>();
  // childName → 親内相対位置
  const relOriginByChild = new Map<string, { x: number; y: number; z: number }>();

  for (const { id, parentPd, childPd } of naoPairs) {
    const pn = pdToProductName(parentPd);
    const cn = pdToProductName(childPd);
    if (!pn || !cn || pn === cn) continue;
    childToParent.set(cn, pn);
    childNames.add(cn);
    if (!parentToChildren.has(pn)) parentToChildren.set(pn, []);
    const arr = parentToChildren.get(pn)!;
    if (!arr.includes(cn)) arr.push(cn);
    const o = nauoToOrigin.get(id);
    if (o && !relOriginByChild.has(cn)) relOriginByChild.set(cn, o);
  }

  // ルート = どの child にもなっていない name (productNames から)
  const roots: StepNode[] = [];
  const buildNode = (name: string, parentOrigin: { x: number; y: number; z: number } | null, visited: Set<string>): StepNode => {
    if (visited.has(name)) {
      return { name, children: [], ...propsByName.get(name) };
    }
    visited.add(name);
    // 親内相対位置 + 親の絶対位置 = この部品の絶対位置
    const rel = relOriginByChild.get(name);
    let abs: { x: number; y: number; z: number } | null = null;
    if (parentOrigin && rel) {
      abs = { x: parentOrigin.x + rel.x, y: parentOrigin.y + rel.y, z: parentOrigin.z + rel.z };
    } else if (parentOrigin && !rel) {
      abs = parentOrigin; // 相対位置不明 → 親と同じ位置
    } else if (!parentOrigin && rel) {
      abs = rel;
    } else if (!parentOrigin && !rel) {
      abs = { x: 0, y: 0, z: 0 }; // ルート
    }
    const childrenNames = parentToChildren.get(name) ?? [];
    const node: StepNode = {
      name,
      children: childrenNames.map((c) => buildNode(c, abs, visited)),
      ...propsByName.get(name),
    };
    if (abs) {
      node.originX = abs.x;
      node.originY = abs.y;
      node.originZ = abs.z;
    }
    visited.delete(name);
    return node;
  };

  for (const n of uniqueProductNames) {
    if (!childNames.has(n)) {
      roots.push(buildNode(n, null, new Set()));
    }
  }

  // 万一ルート判定漏れがあれば、すべての PRODUCT がツリーに入っているか確認
  // (孤立 PRODUCT もルートとして追加)
  const includedNames = new Set<string>();
  const collect = (n: StepNode) => { includedNames.add(n.name); n.children.forEach(collect); };
  roots.forEach(collect);
  for (const n of uniqueProductNames) {
    if (!includedNames.has(n)) {
      roots.push({ name: n, children: [], ...propsByName.get(n) });
    }
  }

  // hasXxx フラグ
  let hasVolume = false, hasArea = false, hasMass = false, hasCG = false, hasInertia = false, hasBBox = false;
  for (const p of propsByName.values()) {
    if (p.volumeM3 !== undefined) hasVolume = true;
    if (p.surfaceAreaM2 !== undefined) hasArea = true;
    if (p.massKg !== undefined) hasMass = true;
    if (p.cgX !== undefined) hasCG = true;
    if (p.ixx !== undefined) hasInertia = true;
    if (p.bboxMinX !== undefined) hasBBox = true;
  }
  const hasMountPos = nauoToOrigin.size > 0;

  return {
    productNames: uniqueProductNames,
    roots,
    hasVolume,
    hasArea,
    hasMass,
    hasCG,
    hasInertia,
    hasMountPos,
    hasBBox,
    fileSchema,
    cadSoftware,
    lengthUnit,
  };
}
