import type {
  ParamBinding,
  ComponentBinding,
  RocketGeometry,
  PropulsionStage,
  MassComponent,
} from '../types';


export function resolveParamBindings(
  bindings: ParamBinding[],
  geometry: RocketGeometry | undefined,
  propulsion: PropulsionStage[],
  parameters: MassComponent[],   // Parameter[] を MassComponent[] と同じ形で受け取る
  massComponents: MassComponent[],
): { cadAlias: string; value: number }[] {
  return bindings.flatMap((b) => {
    let raw: number | null = null;

    switch (b.sourceType) {
      case 'constant':
        raw = b.constantValue ?? null;
        break;

      case 'noseCone':
        if (geometry && b.sourceField) {
          raw = (geometry.noseCone as unknown as Record<string, unknown>)[b.sourceField] as number ?? null;
        }
        break;

      case 'bodySection': {
        const sec = geometry?.bodySections.find((s) => s.stageNo === b.stageNo);
        if (sec && b.sourceField) {
          raw = (sec as unknown as Record<string, unknown>)[b.sourceField] as number ?? null;
        }
        break;
      }

      case 'propulsion': {
        const stage = propulsion.find((s) => s.stageNo === b.stageNo);
        if (stage && b.sourceField) {
          raw = (stage as unknown as Record<string, unknown>)[b.sourceField] as number ?? null;
        }
        break;
      }

      case 'parameter': {
        // parameters は実態として Parameter[] だが共用型で扱う
        const param = (parameters as unknown as Array<{ varName: string; value: number | null }>)
          .find((p) => p.varName === b.sourceField);
        raw = param?.value ?? null;
        break;
      }

      case 'massComponent': {
        const comp = massComponents.find((c) => c.varName === b.componentVarName);
        if (comp && b.sourceField) {
          raw = (comp as unknown as Record<string, unknown>)[b.sourceField] as number ?? null;
        }
        break;
      }
    }

    if (raw == null) return [];
    const value = raw * (b.multiplier ?? 1) + (b.addend ?? 0);
    return [{ cadAlias: b.cadAlias, value }];
  });
}

export function resolveComponentBindings(
  bindings: ComponentBinding[],
  components: MassComponent[],
): { cadObjectName: string; density: number }[] {
  return bindings.flatMap((b) => {
    let density = b.densityOverride ?? null;
    if (density == null && b.componentId) {
      const comp = components.find((c) => c.id === b.componentId);
      density = comp?.materialDensity ?? null;
    }
    if (density == null || density <= 0) return [];
    return [{ cadObjectName: b.cadObjectName, density }];
  });
}

