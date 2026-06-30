import type { ComponentStage } from '../types';

/**
 * ComponentStage の表示ラベル
 * 複数のビューコンポーネントで共通利用するため、ここで一元管理する。
 */
export const STAGE_LABELS: Record<ComponentStage, string> = {
  all: '全機',
  payload: 'ペイロード',
  pbs: 'PBS',
  stage1: '1段',
  stage2: '2段',
  stage3: '3段',
  stage4: '4段',
};
