import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisFlow } from '../../../types';

/**
 * 解析フロー 実行状態バー。
 *
 * 表示内容:
 *   - 実行中ステップ (status='in_progress' なステップ名、複数なら並列)
 *   - 経過時間 (実行開始からの秒数)
 *   - 予想残り時間 (pending + in_progress ステップ数 × 7s)
 *      ※ 判定ステップでループが定義されている場合は完了予測不可なので「不明」
 *
 * 状態追跡: ストアに副作用フィールドを追加せず、 step.status の集約結果を
 * useRef でタイムスタンプ管理する (ストア改変による AI 操作機能との衝突を避ける)。
 *
 *   none → in_progress      : startedAt = now()
 *   全 pending (リセット)   : startedAt / endedAt を null に
 *   in_progress 消失 & 全 done: endedAt = now() (完了確定)
 */

const STEP_DURATION_SEC = 7; // analysisFlowStore のダミー実行時間と揃える

interface ExecutionStatusBarProps {
  flow: AnalysisFlow;
}

export const ExecutionStatusBar: React.FC<ExecutionStatusBarProps> = ({ flow }) => {
  const totalSteps = flow.steps.length;

  // 判定ステップで loopBackToStepId が定義されているとループあり = 完了予測不能
  const hasLoop = useMemo(
    () => flow.steps.some((s) => s.kind === 'decision' && !!s.loopBackToStepId),
    [flow.steps],
  );

  const anyInProgress = useMemo(
    () => flow.steps.some((s) => s.status === 'in_progress'),
    [flow.steps],
  );
  const allPending = useMemo(
    () => totalSteps > 0 && flow.steps.every((s) => s.status === 'pending'),
    [flow.steps, totalSteps],
  );
  const allDone = useMemo(
    () => totalSteps > 0 && flow.steps.every((s) => s.status === 'done'),
    [flow.steps, totalSteps],
  );

  const startedAtRef = useRef<number | null>(null);
  const endedAtRef = useRef<number | null>(null);
  // 1秒刻みで再描画するためのカウンタ
  const [, setTick] = useState(0);

  // ─── タイムスタンプ管理 ────────────────────────────────────
  // flow が切り替わったときは初期化 (フロー間で状態が混ざらない様に)
  useEffect(() => {
    startedAtRef.current = null;
    endedAtRef.current = null;
    setTick((t) => t + 1);
  }, [flow.id]);

  useEffect(() => {
    if (anyInProgress) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
        endedAtRef.current = null;
        setTick((t) => t + 1);
      }
      return;
    }
    if (allPending) {
      // リセットされた
      if (startedAtRef.current !== null || endedAtRef.current !== null) {
        startedAtRef.current = null;
        endedAtRef.current = null;
        setTick((t) => t + 1);
      }
      return;
    }
    if (allDone && startedAtRef.current !== null && endedAtRef.current === null) {
      endedAtRef.current = Date.now();
      setTick((t) => t + 1);
    }
  }, [anyInProgress, allPending, allDone]);

  // 実行中は 1 秒間隔で経過時間を更新
  useEffect(() => {
    if (!anyInProgress) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [anyInProgress]);

  // 一度も実行されてないフローは何も表示しない
  if (startedAtRef.current === null) return null;

  const inProgressSteps = flow.steps.filter((s) => s.status === 'in_progress');
  const pendingCount = flow.steps.filter((s) => s.status === 'pending').length;
  const inProgressCount = inProgressSteps.length;
  const doneCount = flow.steps.filter((s) => s.status === 'done').length;
  const isCompleted = endedAtRef.current !== null;

  const referenceNow = endedAtRef.current ?? Date.now();
  const elapsedSec = Math.max(0, Math.floor((referenceNow - startedAtRef.current) / 1000));

  // ETA: 残り pending + 進行中 (進行中は最大 1 ステップ分残ってる扱い = worst case)
  // ループありの場合は不定
  const etaSec = hasLoop || isCompleted
    ? null
    : (pendingCount + inProgressCount) * STEP_DURATION_SEC;

  return (
    <div
      className="d-flex align-items-center flex-wrap gap-3 px-3 py-2"
      style={{
        fontSize: '0.78rem',
        background: isCompleted ? '#f0fdf4' : '#fffbeb',
        borderTop: '1px solid #e2e8f0',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      {/* 実行中ステップ */}
      <div className="d-flex align-items-center gap-1">
        <span className="text-muted">実行中:</span>
        {inProgressCount > 0 ? (
          inProgressSteps.map((s) => (
            <span
              key={s.id}
              className="badge"
              style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', fontSize: '0.70rem' }}
            >
              <i className="bi bi-play-fill me-1" />{s.label || '(未設定)'}
            </span>
          ))
        ) : isCompleted ? (
          <span
            className="badge"
            style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.70rem' }}
          >
            <i className="bi bi-check-circle me-1" />完了 ({doneCount} ステップ)
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </div>

      {/* 経過時間 */}
      <div className="d-flex align-items-center gap-1">
        <i className="bi bi-clock text-muted" />
        <span className="text-muted">経過:</span>
        <span className="font-monospace fw-semibold">{formatDuration(elapsedSec)}</span>
      </div>

      {/* 予想残り時間 */}
      <div className="d-flex align-items-center gap-1">
        <i className="bi bi-hourglass-split text-muted" />
        <span className="text-muted">残り (予想):</span>
        {hasLoop ? (
          <span
            className="d-inline-flex align-items-center gap-1 text-muted"
            title="判定ステップにループ先が定義されているため完了予測は不能"
          >
            不明 <i className="bi bi-arrow-repeat" style={{ color: '#f59e0b' }} />
          </span>
        ) : isCompleted ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="font-monospace fw-semibold">約 {formatDuration(etaSec ?? 0)}</span>
        )}
      </div>

      {/* 完了予定時刻 (ループなし & 実行中のみ) */}
      {!hasLoop && !isCompleted && etaSec !== null && (
        <div className="d-flex align-items-center gap-1 ms-auto">
          <span className="text-muted">完了予定:</span>
          <span className="font-monospace">
            {formatEta(Date.now() + etaSec * 1000)}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── 表示用ユーティリティ ───────────────────────────────────

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}分${s.toString().padStart(2, '0')}秒`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}時間${mm}分`;
}

function formatEta(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
