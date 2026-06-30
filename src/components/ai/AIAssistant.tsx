import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { FLOW_TOOL_DECLARATIONS, executeTool } from '../../lib/aiTools';

/**
 * AI アシスタント
 *  - 閉じている時: 右下に固定 FAB ボタン
 *  - 開いた時:    .app-layout の flex 行にドッキングする 400px パネル
 *                (重ね合わせではなくメイン領域を左に押し、設定画面など下のコンテンツも操作可能)
 *  - 現在の画面 (appStore.view) を system prompt に含めて文脈付与
 *  - 設定で Gemini API キーを入れると Gemini と実通信、未設定ならダミー応答にフォールバック
 *  - ツール対応モデル (gemini-2.5-*, gemini-2.0-flash) では function calling を使い
 *    解析フロー操作ツールを呼び出せる
 */

type MessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result';

type ChatMessage = {
  id: string;
  role: MessageRole;
  text: string;
  ts: string;
  /** ツール呼び出し表示用 */
  toolName?: string;
  toolOk?: boolean;
};

const uid = () => Math.random().toString(36).slice(2);

const API_KEY_STORAGE = 'rocketdb.ai.geminiApiKey';
const MODEL_STORAGE = 'rocketdb.ai.geminiModel';
const DEFAULT_MODEL = 'gemini-2.0-flash';

/** function calling に対応しているモデル */
const TOOL_CAPABLE_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]);

const MAX_TOOL_CALLS_PER_TURN = 30;
const MAX_TOOL_LOOPS = 10;

/**
 * 選択可能な Gemini モデル一覧 (2026-06 時点で AI Studio から呼べる主要モデル)。
 */
const GEMINI_MODELS: { value: string; label: string; tier: 'free' | 'paid' | 'free+paid'; desc?: string }[] = [
  { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro',        tier: 'paid',      desc: '最高性能・長文 / Paid のみ' },
  { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',      tier: 'free+paid', desc: '高速 + 推論。Free 枠あり' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', tier: 'free+paid', desc: '軽量・低レイテンシ' },
  { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',      tier: 'free+paid', desc: '推奨デフォルト。バランス型' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', tier: 'free+paid', desc: '安価・軽量' },
  { value: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash',      tier: 'free+paid', desc: '互換性維持' },
  { value: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro',        tier: 'paid',      desc: '旧フラッグシップ / Paid のみ' },
];

/** AppView → 画面の日本語名 */
const VIEW_LABEL: Record<string, string> = {
  projects: 'プロジェクト一覧',
  traceability: 'トレーサビリティ',
  massCases: 'ロケットDB一覧',
  massModel: 'コンポーネント構成',
  parameters: 'パラメータ一覧',
  sizingCases: 'サイジング一覧',
  sizingCondition: 'サイジング条件',
  sizingResults: 'サイジング結果',
  analysisCases: '解析ケース一覧',
  analysisCondition: '解析条件',
  analysisResults: '解析結果',
  analysisFlow: '解析フロー',
  analysisFlowDetail: '解析フロー編集',
  antennaData: 'アンテナデータ',
  pluginCases: 'カスタム解析一覧',
  pluginCondition: 'カスタム解析条件',
  rocketShapeData: '空力形状',
  propulsionData: '推進系',
  debrisShapeData: '破片形状',
  errorSourceData: '誤差源',
};

const SYSTEM_PROMPT_BASE = `あなたは「rocketDB」というロケット設計プラットフォームの AI アシスタントです。
ユーザはこのアプリ上でコンポーネント質量管理・各種解析・カスタム解析プラグインを扱います。
以下を意識して日本語で簡潔に答えてください:
- 現在開いている画面を踏まえて回答する
- 不確かな実装詳細は推測せずに「未確認」と伝える
- 数値・単位を扱う場合は SI 単位で示す

[解析フロー操作エージェントとして]
あなたはツール呼び出しで解析フロー（AnalysisFlow）を直接操作できます。
ユーザーが「ステップを追加して」「フローを実行して」「テンプレートを適用して」などと指示したら、
適切なツールを呼び出してフローを操作してください。

[安全ガード]
- delete_step / reset_all_steps / apply_template（上書き）はユーザーが明示的に依頼した時だけ実行してください。
- 1ターンで最大 ${MAX_TOOL_CALLS_PER_TURN} ツール呼び出しまでです。
- 操作完了後は日本語で結果を簡潔にまとめて報告してください。`;

function getApiKey(): string {
  try { return localStorage.getItem(API_KEY_STORAGE) ?? ''; } catch { return ''; }
}
function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch { /* noop */ }
}
function getModel(): string {
  try { return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}
function setModel(model: string): void {
  try { localStorage.setItem(MODEL_STORAGE, model); } catch { /* noop */ }
}

// ─── Gemini API 型 ────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message: string };
}

// ─── Gemini 呼び出し（function calling ループ付き）───────────────────

/**
 * Gemini に対してツール定義付きリクエストを送り、
 * functionCall が返ってくる間はツールを実行して functionResponse を追記し続ける。
 * 最終的なテキスト応答を返す。
 *
 * onToolCall コールバックで「ツール実行中」の進捗をチャットUIに通知できる。
 */
async function callGeminiWithTools(
  apiKey: string,
  model: string,
  history: ChatMessage[],
  userText: string,
  viewLabel: string,
  onToolCall: (name: string, ok: boolean, summary: string) => void,
  useTools: boolean
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemInstruction = {
    parts: [{ text: `${SYSTEM_PROMPT_BASE}\n\n現在の画面: ${viewLabel}` }],
  };

  // チャット履歴を Gemini contents 形式に変換 (user / model のみ使う)
  const contents: GeminiContent[] = [
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      })),
    { role: 'user', parts: [{ text: userText }] },
  ];

  const toolsPayload = useTools
    ? [{ functionDeclarations: FLOW_TOOL_DECLARATIONS }]
    : undefined;

  let toolCallCount = 0;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const body: Record<string, unknown> = {
      contents,
      systemInstruction,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    };
    if (toolsPayload) body.tools = toolsPayload;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j?.error?.message ?? ''; } catch { /* noop */ }
      throw new Error(`Gemini API エラー (HTTP ${res.status}) ${detail}`);
    }

    const data: GeminiResponse = await res.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const finishReason = candidate?.finishReason ?? '';

    // テキスト部分を収集
    const textParts = parts.filter((p) => p.text).map((p) => p.text!).join('');

    // functionCall がなければループ終了
    const funcCalls = parts.filter((p) => p.functionCall);
    if (funcCalls.length === 0 || finishReason === 'STOP') {
      return textParts.trim() || '(応答が空でした)';
    }

    // モデルのターンを contents に追加
    contents.push({ role: 'model', parts });

    // ツール呼び出しを実行
    const responseParts: GeminiPart[] = [];
    for (const fc of funcCalls) {
      if (!fc.functionCall) continue;
      toolCallCount++;
      if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
        onToolCall(fc.functionCall.name, false, '最大呼び出し数に達したため中断');
        return `[ツール呼び出し上限 (${MAX_TOOL_CALLS_PER_TURN}) に達しました。処理を中断しました。]`;
      }

      const { name, args } = fc.functionCall;
      const result = await executeTool(name, args);

      const summary = result.ok
        ? (typeof result.result === 'object' && result.result !== null && 'message' in result.result
            ? String((result.result as Record<string, unknown>).message)
            : JSON.stringify(result.result).slice(0, 80))
        : result.error;

      onToolCall(name, result.ok, summary);

      responseParts.push({
        functionResponse: {
          name,
          response: result.ok
            ? { result: result.result }
            : { error: result.error },
        },
      });
    }

    // ツール結果を user ターンとして追加（Gemini の仕様）
    contents.push({ role: 'user', parts: responseParts });
  }

  return '[ツール実行ループの上限に達しました。]';
}

/** API キーが無いときのダミー応答 */
function dummyReply(userText: string, viewLabel: string): string {
  const txt = userText.toLowerCase();
  if (/実行|run|やって|計算/.test(userText)) return `「${viewLabel}」 で実行をシミュレートしました (ダミー応答 / 設定 Gemini API キー未設定)。`;
  if (/追加|create|新規/.test(userText)) return `エンティティ追加をシミュレートしました (ダミー応答)。`;
  if (/教えて|何|これ|説明|help/.test(txt) || /[?？]$/.test(userText.trim())) {
    return `現在開いている画面は「${viewLabel}」です。実際の AI 応答が欲しい場合は設定アイコンから Gemini API キーを設定してください。`;
  }
  return `「${userText}」 を受け取りました。Gemini API キーが未設定のためダミー応答です。`;
}

// ─── コンポーネント ───────────────────────────────────────────────────

export const AIAssistant: React.FC = () => {
  const view = useAppStore((s) => s.view);
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(getApiKey());
  const [modelDraft, setModelDraft] = useState(getModel());
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: 'assistant',
      text: 'こんにちは。rocketDB の AI アシスタントです。解析フローの作成・操作・実行などを日本語で指示できます。\n\n初回は右上の歯車から Gemini API キーを設定してください。未設定の場合はダミー応答になります。',
      ts: new Date().toISOString(),
    },
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const viewLabel = VIEW_LABEL[view] ?? view;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'ts'>) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), ts: new Date().toISOString(), ...msg },
    ]);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || thinking) return;

    addMessage({ role: 'user', text });
    setDraft('');
    setThinking(true);

    const key = getApiKey();
    const model = getModel();
    const useTools = TOOL_CAPABLE_MODELS.has(model);

    try {
      if (key) {
        // ツール呼び出しのコールバック: チャットUIにリアルタイム表示
        const onToolCall = (name: string, ok: boolean, summary: string) => {
          addMessage({
            role: 'tool_call',
            text: summary,
            toolName: name,
            toolOk: ok,
          });
        };

        const replyText = await callGeminiWithTools(
          key,
          model,
          messages,
          text,
          viewLabel,
          onToolCall,
          useTools
        );
        addMessage({ role: 'assistant', text: replyText });
      } else {
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
        addMessage({ role: 'assistant', text: dummyReply(text, viewLabel) });
      }
    } catch (err) {
      addMessage({
        role: 'assistant',
        text: `[エラー] ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    setApiKey(apiKeyDraft.trim());
    setModel(modelDraft.trim() || DEFAULT_MODEL);
    setShowSettings(false);
  };

  const currentModel = getModel();
  const toolsEnabled = TOOL_CAPABLE_MODELS.has(currentModel);

  // ドック状態を body class に同期 → 重ね合わせ Bootstrap モーダルが
  // パネルに被らないよう CSS で right:400px に詰める
  useEffect(() => {
    if (open) document.body.classList.add('ai-panel-open');
    else document.body.classList.remove('ai-panel-open');
    return () => document.body.classList.remove('ai-panel-open');
  }, [open]);

  return (
    <>
      {/* FAB (右下) */}
      {!open && (
        <button
          className="btn shadow-lg"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', right: 24, bottom: 24, width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0d6efd 0%, #6610f2 100%)',
            color: '#fff', border: 'none', zIndex: 1050,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}
          title="AI アシスタントを開く"
        >
          <i className="bi bi-robot" />
        </button>
      )}

      {/* チャットパネル (ドック方式: .app-layout の flex 兄弟として 400px 占有。
          fixed/zIndex は使わない → 下のメイン領域 (解析条件設定など) が AI と並んで操作可能) */}
      {open && (
        <div
          style={{
            width: 400,
            flexShrink: 0,
            height: '100vh',
            background: '#fff',
            borderLeft: '1px solid #e9ecef',
            boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ヘッダ */}
          <div
            className="d-flex align-items-center justify-content-between px-3 py-2"
            style={{ background: 'linear-gradient(135deg, #0d6efd 0%, #6610f2 100%)', color: '#fff' }}
          >
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-robot" style={{ fontSize: 22 }} />
              <div>
                <div className="fw-semibold" style={{ fontSize: '0.95rem' }}>AI アシスタント</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                  画面: {viewLabel}
                  {getApiKey()
                    ? toolsEnabled
                      ? ' · Gemini + フロー操作'
                      : ' · Gemini 接続中'
                    : ' · (キー未設定)'}
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-1">
              <button
                className="btn btn-sm text-white p-0 px-1"
                onClick={() => { setApiKeyDraft(getApiKey()); setModelDraft(getModel()); setShowSettings(true); }}
                title="設定"
                style={{ fontSize: 16, border: 'none', background: 'transparent' }}
              >
                <i className="bi bi-gear" />
              </button>
              <button
                className="btn btn-sm text-white p-0 px-2"
                onClick={() => setOpen(false)}
                title="閉じる"
                style={{ fontSize: 18, border: 'none', background: 'transparent' }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </div>

          {/* 設定パネル */}
          {showSettings && (
            <div className="p-3 border-bottom" style={{ background: '#f8f9fa' }}>
              <h6 className="fw-semibold mb-2">設定</h6>
              <div className="mb-2">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Gemini API キー</label>
                <input
                  type="password"
                  className="form-control form-control-sm"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder="AIza..."
                  autoComplete="off"
                />
                <div className="form-text" style={{ fontSize: '0.7rem' }}>
                  <i className="bi bi-info-circle me-1" />
                  ブラウザ localStorage に保存されます (端末ローカルのみ)。
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="ms-1">取得</a>
                </div>
              </div>
              <div className="mb-2">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>モデル</label>
                <select
                  className="form-select form-select-sm"
                  value={GEMINI_MODELS.some((m) => m.value === modelDraft) ? modelDraft : ''}
                  onChange={(e) => setModelDraft(e.target.value || DEFAULT_MODEL)}
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} — {m.tier === 'free' ? '無料' : m.tier === 'paid' ? '有料' : '無料/有料'}
                      {TOOL_CAPABLE_MODELS.has(m.value) ? ' [フロー操作対応]' : ''}
                    </option>
                  ))}
                </select>
                {(() => {
                  const sel = GEMINI_MODELS.find((m) => m.value === modelDraft);
                  return sel?.desc ? (
                    <div className="form-text" style={{ fontSize: '0.7rem' }}>
                      <i className="bi bi-info-circle me-1" />{sel.desc}
                    </div>
                  ) : null;
                })()}
                <div className="form-text" style={{ fontSize: '0.68rem', color: '#6c757d' }}>
                  料金詳細: <a href="https://ai.google.dev/pricing" target="_blank" rel="noreferrer">ai.google.dev/pricing</a>
                </div>
              </div>
              <div className="d-flex gap-1 justify-content-end">
                <button className="btn btn-sm btn-secondary" onClick={() => setShowSettings(false)}>キャンセル</button>
                <button className="btn btn-sm btn-primary" onClick={handleSaveSettings}>保存</button>
              </div>
            </div>
          )}

          {/* ツール対応バナー */}
          {getApiKey() && toolsEnabled && !showSettings && (
            <div
              className="px-3 py-1 d-flex align-items-center gap-1"
              style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd', fontSize: '0.72rem', color: '#0369a1' }}
            >
              <i className="bi bi-tools" />
              <span>フロー操作エージェントモード有効 — 自然言語でフローを操作できます</span>
            </div>
          )}

          {/* メッセージ一覧 */}
          <div ref={scrollRef} className="flex-grow-1 overflow-auto px-3 py-3" style={{ background: '#f8f9fa' }}>
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            {thinking && (
              <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: '0.83rem', color: '#6c757d' }}>
                <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} />
                <span>考えています…</span>
              </div>
            )}
          </div>

          {/* 入力 */}
          <div className="border-top p-2" style={{ background: '#fff' }}>
            {/* クイックアクション (解析フロー系画面の時のみ表示) */}
            {(view === 'analysisFlow' || view === 'analysisFlowDetail') && getApiKey() && toolsEnabled && (
              <div className="mb-2 d-flex flex-wrap gap-1">
                {[
                  'サイジングと空力のステップを追加して',
                  '全部実行して',
                  'テンプレ一覧を教えて',
                ].map((q) => (
                  <button
                    key={q}
                    className="btn btn-outline-secondary btn-sm"
                    style={{ fontSize: '0.68rem', padding: '2px 7px' }}
                    onClick={() => { setDraft(q); }}
                    disabled={thinking}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <textarea
              className="form-control form-control-sm mb-2"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="質問や指示を入力 (⌘/Ctrl+Enter で送信)"
              disabled={thinking}
            />
            <div className="d-flex justify-content-between align-items-center">
              <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                <i className="bi bi-info-circle me-1" />
                {getApiKey()
                  ? `${getModel()}${toolsEnabled ? ' (ツール有効)' : ''}`
                  : '歯車から API キー設定可'}
              </small>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSend}
                disabled={!draft.trim() || thinking}
              >
                <i className="bi bi-send me-1" />送信
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── メッセージバブル ──────────────────────────────────────────────────

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  if (msg.role === 'tool_call') {
    return (
      <div className="d-flex mb-1 justify-content-start">
        <div
          style={{
            maxWidth: '92%',
            background: msg.toolOk ? '#f0fdf4' : '#fff7ed',
            border: `1px solid ${msg.toolOk ? '#bbf7d0' : '#fed7aa'}`,
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: '0.75rem',
            color: msg.toolOk ? '#166534' : '#9a3412',
            fontFamily: 'monospace',
          }}
        >
          <i className={`bi bi-${msg.toolOk ? 'check-circle' : 'exclamation-triangle'} me-1`} />
          <span style={{ opacity: 0.7 }}>{msg.toolName}</span>
          {msg.text && <span className="ms-1 text-truncate" style={{ maxWidth: 260, display: 'inline-block', verticalAlign: 'bottom' }}>— {msg.text}</span>}
        </div>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div className={`d-flex mb-2 ${isUser ? 'justify-content-end' : 'justify-content-start'}`}>
      <div
        style={{
          maxWidth: '88%',
          background: isUser ? '#0d6efd' : '#fff',
          color: isUser ? '#fff' : '#212529',
          border: isUser ? 'none' : '1px solid #dee2e6',
          borderRadius: 12,
          padding: '8px 12px',
          fontSize: '0.85rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {!isUser && (
          <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: '0.7rem', color: '#6c757d' }}>
            <i className="bi bi-robot" />
            <span>AI</span>
          </div>
        )}
        <div>{msg.text}</div>
      </div>
    </div>
  );
};
