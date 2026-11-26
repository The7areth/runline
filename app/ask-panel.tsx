'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { answerTraining, type Checkin, type trainingBrief } from '@/lib/intelligence';
import type { Run } from '@/lib/running';
import type { InsightAnswer } from '@/lib/insights/synthesize.server';

type Props = { demo: boolean; runs: Run[]; selected?: Run; checks: Checkin[]; brief: ReturnType<typeof trainingBrief> };

export function AskPanel({ demo, runs, selected, checks, brief }: Props) {
  const [question, setQuestion] = useState('');
  const [ai, setAi] = useState(false);
  const [answer, setAnswer] = useState<InsightAnswer | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function clear() {
    pending.current?.abort();
    setLoading(false);
    setError('');
    setAnswer(null);
  }
  async function ask(text: string) {
    clear();
    setQuestion(text);
    if (!text.trim()) return;
    if (demo || !ai || !selected?.id) {
      setAnswer({ mode: 'deterministic', takeaway: answerTraining(text, runs, selected, demo ? [] : checks), evidence: [], caveats: [] });
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/insights', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedRunId: selected.id, question: text }) });
      if (!response.ok) throw new Error('Request failed');
      const result = await response.json() as InsightAnswer;
      if (!controller.signal.aborted) setAnswer(result);
    } catch {
      if (!controller.signal.aborted) setError('Unable to load this answer. Please try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <section className="panel coach-card">
    <div className="section-head"><h2><MessageCircle size={19}/> Training intelligence</h2></div>
    {!demo && selected?.id && <label><input type="checkbox" checked={ai} onChange={e => { clear(); setAi(e.target.checked); }}/>
      Use Ollama for this panel. It receives your question and eligible finding labels and phrases.
    </label>}
    <div className="prompts">{['Analyze my latest run', 'Compare my training', 'What about recovery?'].map(q =>
      <button key={q} onClick={() => void ask(q)}>{q}</button>)}</div>
    <form className="ask" onSubmit={e => { e.preventDefault(); void ask(question); }}>
      <input aria-label="Training question" maxLength={500} value={question}
        onChange={e => { clear(); setQuestion(e.target.value); }} placeholder="Ask about this training…"/>
      <button className="primary" type="submit" aria-label="Analyze question"><MessageCircle size={17}/></button>
    </form>
    <div aria-live="polite">{loading && <p>Preparing your answer…</p>}{error && <p>{error}</p>}
      {answer ? <div className="answer"><strong>{answer.mode === 'ai' ? 'AI-assisted answer' : 'Deterministic answer'}</strong>
        <p>{answer.takeaway}</p>{answer.evidence.map(f => <div key={f.title}><strong>{f.title}</strong><p>{f.detail}</p></div>)}
        {answer.caveats.length > 0 && <details><summary>Evidence limitations</summary><ul>{answer.caveats.map(c => <li key={c}>{c}</li>)}</ul></details>}
      </div> : !loading && !error && <div className="brief-preview">{brief.findings.slice(0, 2).map(f =>
        <div key={f.title}><strong>{f.title}</strong><p>{f.detail}</p></div>)}</div>}
    </div>
    <details className="analysis-method"><summary>How this analysis was produced</summary>
      <p>{brief.tools.join(' · ')}</p><p>Runline calculates measurements from activity records.</p></details>
  </section>;
}
