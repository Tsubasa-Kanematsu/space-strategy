import React, { useRef, useState } from 'react';

/**
 * 解析条件 / サイジング条件など 「Recordベースの設定値オブジェクト」 を
 * JSON ファイルで 取込 / 書出 するための汎用ボタン群。
 *
 * 設計方針:
 *   - condition は Record<string, unknown> 想定。階層構造でも OK
 *   - 取込時の安全策:
 *     - JSON.parse 失敗 → エラー表示
 *     - 型が object でない → エラー
 *     - 既存設定上書きとなるため confirm ダイアログを出す
 *   - 書出時は <caseName>.json で download
 */

export interface ConditionJsonIOProps {
  /** 表示用 (ファイル名やメッセージで使う) */
  caseName: string;
  /** 現在の条件 (書出用) */
  condition: Record<string, unknown>;
  /** 取込成功時に呼ばれる (新しい condition を渡す) */
  onImport: (newCondition: Record<string, unknown>) => void;
  /** ボタンのラベル接頭辞 (例: '条件') */
  labelPrefix?: string;
}

export const ConditionJsonIO: React.FC<ConditionJsonIOProps> = ({
  caseName,
  condition,
  onImport,
  labelPrefix = '条件',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const sanitizedFileName = (name: string) => name.replace(/[^\w.\-]+/g, '_');

  const handleExport = () => {
    try {
      const json = JSON.stringify(condition, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFileName(caseName)}.condition.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`書出失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(`JSON パース失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON のトップレベルが オブジェクト ({ ... }) ではありません');
      }
      const currentKeys = Object.keys(condition);
      if (currentKeys.length > 0) {
        const ok = window.confirm(
          `現在の${labelPrefix}を読み込んだ JSON で上書きします。よろしいですか?`,
        );
        if (!ok) return;
      }
      onImport(parsed as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="d-flex align-items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={() => fileInputRef.current?.click()}
        title={`${labelPrefix}を JSON ファイルから取込 (既存値は上書きされます)`}
      >
        <i className="bi bi-upload me-1" />JSON 取込
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={handleExport}
        title={`現在の${labelPrefix}を JSON で書出`}
      >
        <i className="bi bi-download me-1" />JSON 書出
      </button>
      {error && (
        <span
          className="badge bg-danger-subtle text-danger ms-1"
          style={{ fontSize: '0.72rem', cursor: 'pointer' }}
          title={error}
          onClick={() => setError(null)}
        >
          <i className="bi bi-exclamation-triangle me-1" />取込エラー (クリックで消去)
        </span>
      )}
    </div>
  );
};
