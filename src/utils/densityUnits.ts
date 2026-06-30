export const DENSITY_UNITS = ['kg/m³', 'g/cm³', 'kg/L', 'ton/m³'] as const;
export type DensityUnit = typeof DENSITY_UNITS[number];

/** 入力値（選択単位）→ 内部値（kg/m³）*/
export function densityToInternal(value: number, unit: DensityUnit): number {
  switch (unit) {
    case 'kg/m³':  return value;
    case 'g/cm³':  return value * 1000;
    case 'kg/L':   return value * 1000;
    case 'ton/m³': return value * 1000;
  }
}

/** 内部値（kg/m³）→ 表示値（選択単位）*/
export function densityFromInternal(value: number, unit: DensityUnit): number {
  switch (unit) {
    case 'kg/m³':  return value;
    case 'g/cm³':  return value / 1000;
    case 'kg/L':   return value / 1000;
    case 'ton/m³': return value / 1000;
  }
}
