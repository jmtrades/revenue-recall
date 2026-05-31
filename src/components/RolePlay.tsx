"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { TONES, DEFAULT_TONE, type ToneId } from "@/lib/tones";
import {
  isSpeechSupported,
  isRecognitionSupported,
  loadVoices,
  pickVoice,
  speak,
  listenOnce,
  listenContinuous,
  type SpeakHandle,
  type ListenHandle,
} from "@/lib/voice/speech";
import { loadVoicePrefs, toVoicePrefs } from "@/lib/voice/prefs";
import { shouldBargeIn, wordCount } from "@/lib/voice/turntaking";
import { analyzeCall, type CallScore } from "@/lib/voice/scorecard";

type Difficulty = "easy" | "medium" | "hard";
interface Turn {
  speaker: "rep" | "prospect";
  text: string;
}

/**
 * Live call role-play. The app plays a realistic prospect (spoken aloud with our
 * in-house, no-third-party voice), the rep practises responding by typing or
 * speaking, and the conversation engine can coach the ideal next line. All voice
 * I/O is browser-native — no audio leaves the device, no provider key.
 */
export function RolePlay({ contactName, company, dealTitle, locale }: { contactName: string; company?: string; dealTitle: string; locale?: string }) {
  const speechLang = locale ?? "en-US";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tone, setTone] = useState<ToneId>(DEFAULT_TONE);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [coach, setCoach] = useState<{ text: string; tone: string; note: string } | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [score, setScore] = useState<CallScore | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speakHandleRef = useRef<SpeakHandle | null>(null);
  const speakingRef = useRef(false);
  const liveListenRef = useRef<ListenHandle | null>(null);
  const liveRef = useRef(false);

  // Keep a ref in sync so async callbacks see the latest live state.
  useEffect(() => {
    liveRef.current = live;
    if (!live) {
      liveListenRef.current?.stop();
      liveListenRef.current = null;
    }
  }, [live]);

  useEffect(() => () => {
    liveListenRef.current?.stop();
    speakHandleRef.current?.stop();
  }, []);

  // Browser-capability flags must start false so the server render and the first
  // client (hydration) render agree; flip them on after mount. Computing them
  // inline during render mismatches hydration (the server has no `window`, the
  // client does), which surfaces as React #418/#422 on this page.
  const [canSpeak, setCanSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  useEffect(() => {
    setCanSpeak(isSpeechSupported());
    setCanListen(isRecognitionSupported());
  }, []);

  useEffect(() => {
    if (canSpeak) loadVoices().then((v) => (voiceRef.current = pickVoice(v, { ...toVoicePrefs(loadVoicePrefs()), lang: speechLang })));
  }, [canSpeak, speechLang]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, coach]);

  interface TurnResp { text: string; emotion?: string; sentiment?: string; tone?: string; coachNote?: string }
  async function fetchTurn(who: "rep" | "prospect", nextTurns: Turn[]): Promise<TurnResp> {
    const res = await fetch("/api/voice/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ who, contactName, company, dealTitle, tone, difficulty, turns: nextTurns }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "turn failed");
    return data as TurnResp;
  }

  function sayAloud(text: string, emotion?: string) {
    if (!voiceOn || !canSpeak) {
      // No audio — in live mode, open the floor immediately so it stays hands-free.
      if (liveRef.current) startLiveListen();
      return;
    }
    speakingRef.current = true;
    const h = speak(text, { ...toVoicePrefs(loadVoicePrefs()), emotion: emotion as never }, voiceRef.current);
    speakHandleRef.current = h;
    h.done.finally(() => {
      speakingRef.current = false;
      if (liveRef.current) startLiveListen(); // hand the floor back to the human
    });
  }

  /**
   * Hands-free turn: listen continuously, barge-in (stop talking the instant the
   * human speaks over us), and on a finished sentence, take the turn.
   */
  function startLiveListen() {
    if (!canListen || !liveRef.current) return;
    liveListenRef.current?.stop();
    setListening(true);
    liveListenRef.current = listenContinuous({
      lang: speechLang,
      onSpeechStart: () => {
        if (shouldBargeIn(speakingRef.current, 2)) {
          speakHandleRef.current?.stop();
          speakingRef.current = false;
        }
      },
      onInterim: (t) => {
        // A couple of real words while we're still talking = they took the floor.
        if (speakingRef.current && wordCount(t) >= 2) {
          speakHandleRef.current?.stop();
          speakingRef.current = false;
        }
      },
      onFinal: (t) => {
        if (!liveRef.current) return;
        liveListenRef.current?.stop();
        liveListenRef.current = null;
        setListening(false);
        void send(t);
      },
      onError: () => setListening(false),
    });
  }

  async function start() {
    setError(null);
    setCoach(null);
    setBusy(true);
    try {
      // Rep opens; the app (prospect) reacts.
      const opener: Turn = { speaker: "rep", text: "Hey, it's me — caught you at an okay time?" };
      const p = await fetchTurn("prospect", [opener]);
      const next = [opener, { speaker: "prospect" as const, text: p.text }];
      setTurns(next);
      setMood(p.sentiment ?? null);
      sayAloud(p.text, p.emotion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const said = text.trim();
    if (!said || busy) return;
    setInput("");
    setCoach(null);
    setError(null);
    const afterRep = [...turns, { speaker: "rep" as const, text: said }];
    setTurns(afterRep);
    setBusy(true);
    try {
      const p = await fetchTurn("prospect", afterRep);
      const next = [...afterRep, { speaker: "prospect" as const, text: p.text }];
      setTurns(next);
      setMood(p.sentiment ?? null);
      sayAloud(p.text, p.emotion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't continue");
    } finally {
      setBusy(false);
    }
  }

  async function coachMe() {
    setError(null);
    setBusy(true);
    try {
      const ideal = await fetchTurn("rep", turns);
      setCoach({ text: ideal.text, tone: ideal.tone ?? "warm", note: ideal.coachNote ?? "" });
      sayAloud(ideal.text, ideal.emotion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't coach");
    } finally {
      setBusy(false);
    }
  }

  function mic() {
    if (!canListen || listening) return;
    setError(null);
    setListening(true);
    listenOnce(
      (t) => {
        setListening(false);
        void send(t);
      },
      { lang: speechLang, onError: (e) => { setListening(false); setError(`mic: ${e}`); } },
    );
  }

  function reset() {
    if (typeof window !== "undefined" && canSpeak) window.speechSynthesis.cancel();
    liveListenRef.current?.stop();
    liveListenRef.current = null;
    speakHandleRef.current?.stop();
    speakingRef.current = false;
    setListening(false);
    setTurns([]);
    setCoach(null);
    setMood(null);
    setScore(null);
    setInput("");
    setError(null);
  }

  const started = turns.length > 0;
  const input2 = "rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-brand";

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="mic" size={16} className="text-brand" /> Practice this call
          {mood && <span className="pill bg-surface-2 text-muted">reading the room: {mood}</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={input2} aria-label="Difficulty">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <select value={tone} onChange={(e) => setTone(e.target.value as ToneId)} className={input2} aria-label="Your tone">
            {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {canSpeak && (
            <button onClick={() => setVoiceOn((v) => !v)} title="Toggle spoken voice" className={`rounded-lg border px-2 py-1 text-xs transition ${voiceOn ? "border-brand text-brand" : "border-border text-muted"}`}>
              <Icon name={voiceOn ? "volume" : "mute"} size={14} />
            </button>
          )}
          {canListen && (
            <button
              onClick={() => setLive((v) => !v)}
              title="Hands-free: it listens, pauses, and you can talk over it"
              className={`rounded-lg border px-2 py-1 text-xs transition ${live ? "border-success text-success" : "border-border text-muted"}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {live && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                Live
              </span>
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-muted">
        You sell, the app plays {contactName.split(" ")[0]} as a {difficulty} prospect — out loud, on-device.
        {!canSpeak && " (Spoken voice needs a browser that supports speech synthesis.)"}
      </p>

      <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-surface-2/40 p-3">
        {!started ? (
          <p className="py-6 text-center text-sm text-muted">Start a live role-play to rehearse the opener, objections, and the close.</p>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={`flex ${t.speaker === "rep" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${t.speaker === "rep" ? "bg-brand text-white" : "bg-surface text-fg"}`}>
                {t.text}
              </span>
            </div>
          ))
        )}
        {coach && (
          <div className="mt-2 rounded-lg border border-brand/40 bg-brand-soft/20 p-2 text-xs text-fg">
            <div><span className="font-medium text-brand">Coach — try: </span>{coach.text}</div>
            {coach.note && <div className="mt-1 text-muted">Read: {coach.note} <span className="text-brand">(tone: {coach.tone})</span></div>}
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {!started ? (
        <button onClick={start} disabled={busy} className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
          {busy ? "Connecting…" : "Start role-play"}
        </button>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder={busy ? "…" : "Your response…"}
              disabled={busy}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand disabled:opacity-60"
            />
            {canListen && (
              <button onClick={mic} disabled={busy || listening} title="Speak your response" className={`rounded-lg border px-3 py-2 text-sm transition ${listening ? "border-danger text-danger" : "border-border text-muted hover:text-fg"} disabled:opacity-50`}>
                {listening ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger/70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                    </span>
                    listening
                  </span>
                ) : (
                  <Icon name="mic" size={15} />
                )}
              </button>
            )}
            <button onClick={() => send(input)} disabled={busy || !input.trim()} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
              Send
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={coachMe} disabled={busy} className="text-xs text-brand hover:underline disabled:opacity-50">Coach me</button>
              <button onClick={() => setScore(analyzeCall(turns))} disabled={turns.length < 2} className="text-xs text-brand hover:underline disabled:opacity-50">Score call</button>
            </div>
            <button onClick={reset} className="text-xs text-muted hover:text-fg">Reset</button>
          </div>

          {score && (
            <div className="mt-3 rounded-lg border border-border bg-surface-2/40 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">Call score</span>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold text-white ${score.grade === "A" || score.grade === "B" ? "bg-success" : score.grade === "C" ? "bg-warn" : "bg-danger"}`}>{score.grade}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                <span>Talk ratio: <span className="text-fg">{Math.round(score.talkRatio * 100)}% you</span></span>
                <span>Questions asked: <span className="text-fg">{score.questionsAsked}</span></span>
                <span>Their mood: <span className="text-fg">{score.sentimentArc}</span></span>
                <span>Next step: <span className={`inline-flex items-center gap-1 ${score.nextStepSecured ? "text-success" : "text-fg"}`}>{score.nextStepSecured ? <><Icon name="check" size={12} strokeWidth={3} /> booked</> : "none"}</span></span>
              </div>
              {score.objections.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Objections: {score.objections.map((o) => `${o.intent} (${o.handled ? "handled" : "missed"})`).join(", ")}
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {score.tips.map((tip, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-fg"><span className="text-brand">→</span>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
