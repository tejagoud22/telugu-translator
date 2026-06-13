import { useState, useRef } from "react";

// ─── Replace with your Gemini API key (free at aistudio.google.com) ────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// ───────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a translator specializing in Telangana Telugu slang written in Roman/English script.

The user will give you Telugu words written in English letters (Romanized), often in Telangana dialect/slang. Your job:
1. Translate the meaning into natural English
2. Do NOT correct or alter the original Telugu words
3. Do NOT convert to standard Telugu script
4. Understand Telangana-specific slang, idioms, and expressions
5. Return ONLY a JSON object with two fields:
   - "original": the exact input text, unchanged
   - "translation": the English meaning

Examples:
- "ela unav" → {"original": "ela unav", "translation": "how are you"}
- "emchestunav" → {"original": "emchestunav", "translation": "what are you doing"}
- "enduku ala chestunnav" → {"original": "enduku ala chestunnav", "translation": "why are you doing that"}
- "konchem wait cheyyandi" → {"original": "konchem wait cheyyandi", "translation": "please wait a moment"}
- "em chesav" → {"original": "em chesav", "translation": "what did you do"}
- "raa bro" → {"original": "raa bro", "translation": "come here bro"}
- "endi ra" → {"original": "endi ra", "translation": "what's up man"}
- "poni le" → {"original": "poni le", "translation": "leave it, never mind"}
- "chala bagundi" → {"original": "chala bagundi", "translation": "very good / it's great"}

Return ONLY the JSON object, no extra text, no markdown fences.`;

async function translateText(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Gemini API error");
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { original: text, translation: raw };
  }
}

function MicIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function StopIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TranslatingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", height: 20 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "rgba(255,255,255,0.3)",
          display: "inline-block",
          animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </span>
  );
}

export default function App() {
  const [status, setStatus] = useState("idle");
  const [teluguText, setTeluguText] = useState("");
  const [englishText, setEnglishText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const recognitionRef = useRef(null);

  const isRecording = status === "recording";
  const isTranslating = status === "translating";

  async function requestMicAndStart() {
    setStatus("requesting");
    setErrorMsg("");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      startRecognition();
    } catch (err) {
      setStatus("error");
      if (err.name === "NotAllowedError") {
        setErrorMsg("Microphone access denied. Click the 🔒 lock icon in the address bar → Microphone → Allow → refresh.");
      } else {
        setErrorMsg("Could not access microphone: " + err.message);
      }
    }
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus("error");
      setErrorMsg("Speech recognition not supported. Please use Chrome browser.");
      return;
    }

    const r = new SR();
    r.lang = "te-IN";
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    recognitionRef.current = r;

    let finalTranscript = "";

    r.onstart = () => {
      setStatus("recording");
      setTeluguText("");
      setEnglishText("");
      setErrorMsg("");
      finalTranscript = "";
    };

    r.onresult = (e) => {
      let interim = "";
      finalTranscript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t;
        else interim += t;
      }
      setTeluguText(finalTranscript || interim);
    };

    r.onend = () => {
      if (finalTranscript.trim()) {
        runTranslation(finalTranscript.trim());
      } else {
        setStatus("idle");
        setTeluguText("");
      }
    };

    r.onerror = (e) => {
      if (e.error === "not-allowed") {
        setStatus("error");
        setErrorMsg("Microphone blocked. Click the 🔒 lock icon → Microphone → Allow → refresh.");
      } else if (e.error === "no-speech") {
        setErrorMsg("No speech detected. Try again and speak clearly.");
        setStatus("idle");
      } else if (e.error === "network") {
        setErrorMsg("Network error with speech recognition. Check your internet connection.");
        setStatus("idle");
      } else {
        setErrorMsg("Mic error: " + e.error);
        setStatus("idle");
      }
    };

    r.start();
  }

  function stopRecording() {
    recognitionRef.current?.stop();
  }

  async function runTranslation(text) {
    setStatus("translating");
    setErrorMsg("");
    try {
      const result = await translateText(text);
      setTeluguText(result.original);
      setEnglishText(result.translation);
      setHistory((prev) =>
        [{ telugu: result.original, english: result.translation }, ...prev].slice(0, 8)
      );
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg("Translation failed: " + err.message);
    }
  }

  function handleMicClick() {
    if (isRecording) stopRecording();
    else requestMicAndStart();
  }

  function handleManualSubmit() {
    const text = manualInput.trim();
    if (!text || isTranslating) return;
    setTeluguText(text);
    setManualInput("");
    runTranslation(text);
  }

  function copyTranslation() {
    if (!englishText) return;
    navigator.clipboard.writeText(englishText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f10", color: "#f0ede8" }}>
      <style>{`
        @keyframes ripple {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,93,93,0.3); }
          50% { box-shadow: 0 0 0 18px rgba(232,93,93,0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { outline: none; border-color: rgba(255,255,255,0.3) !important; }
        button { transition: opacity 0.15s, transform 0.1s; }
        button:active:not(:disabled) { transform: scale(0.97); }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        padding: "1.25rem 1.5rem",
        display: "flex", alignItems: "center", gap: 10
      }}>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>telugu</span>
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.3)" }}>→</span>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>english</span>
        <span style={{
          marginLeft: "auto", fontSize: 11,
          padding: "3px 10px",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 20, color: "rgba(255,255,255,0.4)",
          letterSpacing: "0.05em"
        }}>TELANGANA</span>

        {/* Gemini badge */}
        <span style={{
          fontSize: 11, padding: "3px 10px",
          border: "0.5px solid rgba(66,133,244,0.4)",
          borderRadius: 20, color: "rgba(66,133,244,0.8)",
          letterSpacing: "0.04em"
        }}>GEMINI</span>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Mic Button */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", marginBottom: "2.5rem" }}>
          <button
            onClick={handleMicClick}
            disabled={isTranslating || status === "requesting"}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            style={{
              width: 88, height: 88, borderRadius: "50%",
              border: isRecording ? "2px solid #e85d5d" : "1.5px solid rgba(255,255,255,0.18)",
              background: isRecording ? "rgba(232,93,93,0.1)" : "rgba(255,255,255,0.04)",
              cursor: (isTranslating || status === "requesting") ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: isRecording ? "#e85d5d" : "rgba(255,255,255,0.7)",
              animation: isRecording ? "ripple 1.4s ease-in-out infinite" : "none",
              opacity: (isTranslating || status === "requesting") ? 0.4 : 1,
            }}
          >
            {isRecording ? <StopIcon /> : <MicIcon />}
          </button>
          <span style={{
            fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
            color: isRecording ? "#e85d5d" : "rgba(255,255,255,0.35)",
          }}>
            {status === "requesting" ? "requesting mic..." :
             isRecording ? "● listening — tap to stop" :
             isTranslating ? "translating..." :
             "tap to speak"}
          </span>
        </div>

        {/* Telugu box */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "0.75rem"
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
            what you said
          </div>
          <div style={{
            fontSize: 17, lineHeight: 1.6, minHeight: 28,
            color: teluguText ? "#f0ede8" : "rgba(255,255,255,0.2)",
            fontStyle: teluguText ? "normal" : "italic",
          }}>
            {teluguText || (isRecording ? "listening..." : "your telugu will appear here")}
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display: "flex", justifyContent: "center", color: "rgba(255,255,255,0.2)", margin: "0.5rem 0" }}>
          <ArrowDownIcon />
        </div>

        {/* English box */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1rem"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              english translation
            </div>
            {englishText && (
              <button onClick={copyTranslation} style={{
                background: "none", border: "none", cursor: "pointer",
                color: copied ? "#7dcea0" : "rgba(255,255,255,0.35)",
                display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 6px"
              }}>
                <CopyIcon /> {copied ? "copied!" : "copy"}
              </button>
            )}
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.6, minHeight: 28 }}>
            {isTranslating ? (
              <TranslatingDots />
            ) : englishText ? (
              <span style={{ color: "#a8d5b5", fontWeight: 500 }}>{englishText}</span>
            ) : (
              <span style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>translation will appear here</span>
            )}
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div style={{
            fontSize: 13, color: "#e85d5d",
            background: "rgba(232,93,93,0.08)",
            border: "0.5px solid rgba(232,93,93,0.2)",
            borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", lineHeight: 1.5
          }}>
            {errorMsg}
          </div>
        )}

        {/* Manual input */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
            or type it
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              placeholder="e.g. ela unav, emchestunav..."
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "0.6rem 0.875rem",
                fontSize: 14, color: "#f0ede8",
              }}
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim() || isTranslating}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "0.5px solid rgba(255,255,255,0.12)",
                borderRadius: 8, padding: "0.6rem 1rem",
                fontSize: 13, color: "#f0ede8",
                cursor: manualInput.trim() && !isTranslating ? "pointer" : "not-allowed",
                opacity: manualInput.trim() && !isTranslating ? 1 : 0.4,
              }}
            >
              Translate
            </button>
          </div>
        </div>

        {/* History */}
        {history.length > 1 && (
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
              recent
            </div>
            {history.slice(1).map((h, i) => (
              <div key={i} style={{
                borderTop: "0.5px solid rgba(255,255,255,0.05)",
                padding: "0.75rem 0",
                display: "flex", justifyContent: "space-between",
                alignItems: "baseline", gap: 12
              }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{h.telugu}</span>
                <span style={{ fontSize: 13, color: "rgba(168,213,181,0.7)", textAlign: "right" }}>{h.english}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
