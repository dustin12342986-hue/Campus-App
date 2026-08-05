import React, { useState, useEffect, useRef } from "react";
import {
  Home, CalendarDays, Wallet, MapPin, PartyPopper, Bell, Plus, X, Trash2,
  ChevronDown, ChevronUp, AlertTriangle, Check, Clock, Footprints, Pin as PinIcon,
  RefreshCw, Users, Flag, Settings, ListChecks, LifeBuoy, CreditCard, Camera,
  ShieldCheck, Phone, ExternalLink, ShieldAlert, MessageCircle, Send, Sparkles,
} from "lucide-react";

/* ---------- tokens ----------
  bg #EEF0E6 paper sage | card #FBFBF6 | ink #1B2430 | soft #5B6470 | line #D8DBCF
  accent #3B4B6B | ok #1F7A5C | warn #C77D2D | over #B4432F
------------------------------- */
const FONTS_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";
const GLOBAL_CSS = `
  button { transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease, background 0.15s ease; }
  button:active:not(:disabled) { transform: scale(0.96); }
  input, select { transition: box-shadow 0.15s ease, border-color 0.15s ease; }
  input:focus, select:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,75,107,0.15); border-color: #3B4B6B !important; }
  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .campus-fade-in { animation: fadeSlideUp 0.28s ease both; }
  @keyframes modalUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
  .campus-modal { animation: modalUp 0.22s cubic-bezier(0.16,1,0.3,1) both; }
`;

const uid = () => Math.random().toString(36).slice(2, 10);
function classChecklistKey(name) {
  return `checklist-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}`;
}
function schoolChecklistKey(school) {
  return `student-checklist-${school.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}`;
}
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CLASS_COLORS = ["#3B4B6B", "#1F7A5C", "#C77D2D", "#B4432F", "#6B4B8A", "#4B7A8A"];
const SCHOOL_PRESETS = [
  { name: "Dallas College – North Lake Campus", domains: ["student.dcccd.edu", "student.dallascollege.edu"] },
  { name: "Lone Star Test University (fake — for testing)", domains: ["student.lonestartest.edu"] },
];
function isAllowedEmail(email, school) {
  const domain = (email.split("@")[1] || "").trim().toLowerCase();
  if (!domain) return false;
  const preset = SCHOOL_PRESETS.find((s) => s.name.toLowerCase() === school.trim().toLowerCase());
  if (preset) return preset.domains.some((d) => domain === d);
  return domain.endsWith(".edu");
}

function parseTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmtTime(hhmm) {
  const mins = parseTime(hhmm);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function fmtMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}
function daysUntil(dateStr) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
function nextRenewalDate(sub) {
  const cadenceDays = sub.cadence === "weekly" ? 7 : sub.cadence === "yearly" ? 365 : 30;
  let d = new Date(sub.renewsOn);
  const now = new Date();
  while (d < now) d.setDate(d.getDate() + cadenceDays);
  return d;
}
function monthlyCost(sub) {
  if (sub.cadence === "weekly") return sub.amount * 4.33;
  if (sub.cadence === "yearly") return sub.amount / 12;
  return sub.amount;
}
function computeSemesterPace(semester, budgetTx) {
  const start = new Date(semester.startDate);
  const end = new Date(semester.endDate);
  const now = new Date();
  const totalDays = Math.max(1, (end - start) / 86400000);
  const elapsedDays = Math.min(totalDays, Math.max(0, (now - start) / 86400000));
  const spent = budgetTx.filter((t) => new Date(t.date) >= start).reduce((s, t) => s + t.amount, 0);
  const remaining = semester.total - spent;
  const expectedRemaining = semester.total * (1 - elapsedDays / totalDays);
  const weeklyAllowance = semester.total / (totalDays / 7);
  let status = "ok";
  if (remaining < expectedRemaining * 0.75) status = "over";
  else if (remaining < expectedRemaining * 0.9) status = "warn";
  return { remaining, expectedRemaining, weeklyAllowance, status, spent, totalDays, elapsedDays };
}
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

// campus scale: schematic map represents ~2200ft wide, ~1400ft tall; walking ~250ft/min
const MAP_FT_W = 2200;
const MAP_FT_H = 1400;
const WALK_FT_PER_MIN = 250;
function walkMinutes(pinA, pinB) {
  if (!pinA || !pinB) return null;
  const dx = ((pinA.x - pinB.x) / 100) * MAP_FT_W;
  const dy = ((pinA.y - pinB.y) / 100) * MAP_FT_H;
  const ft = Math.sqrt(dx * dx + dy * dy);
  return Math.max(1, Math.ceil(ft / WALK_FT_PER_MIN));
}

const LEVEL_COLOR = { info: "#3B4B6B", warn: "#C77D2D", over: "#B4432F" };
const LEVEL_ICON = { info: Clock, warn: Footprints, over: AlertTriangle };

function statusFor(pct) {
  if (pct >= 100) return "over";
  if (pct >= 75) return "warn";
  return "ok";
}
const STATUS_COLOR = { ok: "#1F7A5C", warn: "#C77D2D", over: "#B4432F" };
const STATUS_LABEL = { ok: "On track", warn: "Near limit", over: "Over limit" };

function buildBlueBonnetContext({ enrollment, isVerified, classes, assignments, events, budgetCats, spentFor, budgetTx, semester, subscriptions }) {
  const now = new Date();
  const dayIdx = now.getDay();
  const todays = classes.filter((c) => c.days.includes(dayIdx)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const dueSoon = assignments.filter((a) => !a.done && daysUntil(a.dueDate) >= 0 && daysUntil(a.dueDate) <= 5).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const todayEvents = events.filter((e) => e.date && new Date(e.date).toDateString() === now.toDateString());
  const discCats = budgetCats.filter((c) => c.discretionary);
  const discSpent = discCats.reduce((s, c) => s + spentFor(c.id), 0);
  const discLimit = discCats.reduce((s, c) => s + c.weeklyLimit, 0);
  const pace = semester ? computeSemesterPace(semester, budgetTx) : null;
  const upcomingSubs = subscriptions.map((s) => ({ ...s, away: daysUntil(nextRenewalDate(s)) })).filter((s) => s.away <= 7);

  const lines = [];
  lines.push(`Today is ${now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.`);
  lines.push(`Student is ${isVerified ? "a verified" : "a pending, not-yet-verified"} student at ${enrollment?.school || "an unspecified school"}.`);
  lines.push(todays.length ? `Today's classes: ${todays.map((c) => `${c.name} ${fmtTime(c.start)}-${fmtTime(c.end)}${c.location ? ` at ${c.location}` : ""}`).join("; ")}.` : "No classes today.");
  lines.push(dueSoon.length ? `Assignments due soon: ${dueSoon.map((a) => `${a.title} (due in ${daysUntil(a.dueDate)}d)`).join("; ")}.` : "No assignments due in the next 5 days.");
  lines.push(todayEvents.length ? `Events today: ${todayEvents.map((e) => e.title).join(", ")}.` : "No events today.");
  lines.push(`Discretionary spending this week: $${discSpent.toFixed(2)} of $${discLimit.toFixed(2)} budgeted.`);
  if (pace) lines.push(`Semester funds: $${pace.remaining.toFixed(2)} left of $${semester.total}, about $${pace.weeklyAllowance.toFixed(2)}/week to stay on pace.`);
  if (upcomingSubs.length) lines.push(`Subscriptions renewing soon: ${upcomingSubs.map((s) => `${s.name} in ${s.away}d ($${s.amount})`).join("; ")}.`);
  return lines.join(" ");
}

function BrandMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <rect width="36" height="36" rx="9" fill="#3B4B6B" />
      <line x1="9" y1="18" x2="27" y2="18" stroke="#F4C77A" strokeWidth="2" />
      <line x1="18" y1="9" x2="18" y2="27" stroke="#F4C77A" strokeWidth="2" />
      <circle cx="18" cy="18" r="3" fill="#FBFBF6" />
    </svg>
  );
}
function RulerBar({ pct, status }) {
  const fillWidth = Math.min(pct, 100);
  const gradients = {
    ok: "linear-gradient(90deg, #1F7A5C, #279470)",
    warn: "linear-gradient(90deg, #C77D2D, #D99447)",
    over: "linear-gradient(90deg, #B4432F, #C85843)",
  };
  return (
    <div className="relative w-full h-3 rounded-full overflow-hidden" style={{ background: "#E3E6DA", boxShadow: "inset 0 1px 2px rgba(27,36,48,0.08)" }}>
      <div className="h-3 rounded-full transition-all duration-500 ease-out" style={{ width: `${fillWidth}%`, background: gradients[status], boxShadow: fillWidth > 3 ? "0 0 6px rgba(27,36,48,0.15)" : "none" }} />
      <div className="absolute top-0 h-3 w-px" style={{ left: "75%", background: "rgba(27,36,48,0.3)" }} />
      {pct > 100 && <div className="absolute -top-1 h-5 w-1.5 rounded-full" style={{ left: "calc(100% - 3px)", background: STATUS_COLOR.over, boxShadow: "0 1px 3px rgba(27,36,48,0.3)" }} />}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 px-0 sm:px-5" style={{ background: "rgba(27,36,48,0.5)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="campus-modal w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-xl sm:rounded-xl p-5" style={{ background: "#FBFBF6", boxShadow: "0 -8px 30px rgba(27,36,48,0.15), 0 20px 40px -12px rgba(27,36,48,0.25)" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: "#D8DBCF" }} />
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg">{title}</h3>
          <button onClick={onClose}><X size={18} color="#5B6470" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="text-xs uppercase tracking-wide block mb-1" style={{ color: "#5B6470" }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { border: "1px solid #D8DBCF", background: "white" };

function EnrollmentGate({ onVerified }) {
  const [school, setSchool] = useState(SCHOOL_PRESETS[0].name);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!school.trim()) { setError("Enter your school."); return; }
    if (!email.includes("@")) { setError("Enter a valid email."); return; }
    if (!isAllowedEmail(email, school)) {
      const preset = SCHOOL_PRESETS.find((s) => s.name.toLowerCase() === school.trim().toLowerCase());
      setError(preset ? `That doesn't match ${preset.name}'s student email domain.` : "Use your school email (usually ending in .edu).");
      return;
    }
    setError("");
    onVerified({ email: email.trim(), school: school.trim(), verifiedAt: new Date().toISOString(), verified: true });
  }
  function continuePending() {
    if (!school.trim()) { setError("Enter your school."); return; }
    setError("");
    onVerified({ email: email.trim(), name: name.trim(), school: school.trim(), verifiedAt: new Date().toISOString(), verified: false });
  }

  return (
    <div style={{ background: "linear-gradient(180deg, #F1F3E9 0%, #E4E7DA 100%)", minHeight: "100vh" }} className="flex items-center justify-center px-5">
      <style>{FONTS_IMPORT + GLOBAL_CSS}</style>
      <div className="campus-fade-in w-full max-w-sm rounded-xl p-6" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 20px 50px -12px rgba(27,36,48,0.2)" }}>
        <div className="flex flex-col items-center mb-5">
          <BrandMark size={44} />
          <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-xl mt-2">Campus</h1>
          <p className="text-xs text-center mt-1" style={{ color: "#5B6470" }}>Sign in with your student email to continue</p>
        </div>

        <Field label="School">
          <select value={school} onChange={(e) => setSchool(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle}>
            {SCHOOL_PRESETS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            <option value="Other">Other school</option>
          </select>
        </Field>
        <Field label="Student email">
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@student.dcccd.edu" className="w-full px-3 py-2 rounded-xl" style={inputStyle} />
        </Field>
        {error && <p className="text-xs mb-3" style={{ color: "#B4432F" }}>{error}</p>}
        <button onClick={submit} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}>
          <ShieldCheck size={15} /> Continue
        </button>

        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px" style={{ background: "#D8DBCF" }} />
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "#9098A0" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "#D8DBCF" }} />
        </div>

        <Field label="Your name (optional)">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="For your ID card" className="w-full px-3 py-2 rounded-xl" style={inputStyle} />
        </Field>
        <button onClick={continuePending} className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5" style={{ border: "1px solid #D8DBCF", color: "#3B4B6B" }}>
          Continue — not enrolled yet
        </button>
        <p className="text-xs mt-2 leading-relaxed" style={{ color: "#9098A0" }}>
          Not registered yet, or don't have your student email? You can still use Campus. Your ID will show as "Pending" instead of "Verified" until you sign in with a matching student email later.
        </p>
      </div>
    </div>
  );
}

function LockedFeature({ what, school, tryVerify }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  function submit() {
    if (!email.includes("@")) { setError("Enter a valid email."); return; }
    if (!tryVerify(email)) { setError(`That doesn't match ${school}'s student email domain.`); return; }
  }
  return (
    <div className="rounded-xl p-6 flex flex-col items-center text-center" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
      <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: "#E3E6DA" }}>
        <ShieldCheck size={20} color="#3B4B6B" />
      </div>
      <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-base mb-1">Verify to unlock {what}</p>
      <p className="text-xs mb-4" style={{ color: "#5B6470" }}>Map, events, and shared class checklists are shared with real classmates, so they're limited to verified {school} students. Budget and your personal schedule stay open either way.</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@student.dcccd.edu" className="w-full px-3 py-2 rounded-xl mb-2" style={inputStyle} />
      {error && <p className="text-xs mb-2" style={{ color: "#B4432F" }}>{error}</p>}
      <button onClick={submit} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}>
        <ShieldCheck size={15} /> Verify with student email
      </button>
    </div>
  );
}

function BlueBonnetChat({ contextText, onClose }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi, I'm Blue Bonnet. Ask me about your classes, budget, or what's due soon." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: `You are Blue Bonnet, a friendly, concise campus assistant built into the Campus app. Use the live context below about this specific student's schedule, budget, and deadlines to answer their questions. Only rely on this context for their personal data — don't invent specifics you weren't given. Keep answers short and conversational. Context: ${contextText}`,
          messages: apiMessages,
        }),
      });
      const data = await response.json();
      const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      setMessages((prev) => [...prev, { role: "assistant", content: textBlocks || "Sorry, I didn't catch that — try asking again." }]);
    } catch (err) {
      setError("Blue Bonnet couldn't respond right now — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(27,36,48,0.5)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="campus-modal w-full sm:max-w-sm h-[80vh] sm:h-[600px] flex flex-col rounded-t-xl sm:rounded-xl overflow-hidden" style={{ background: "#FBFBF6", boxShadow: "0 -8px 30px rgba(27,36,48,0.15), 0 20px 40px -12px rgba(27,36,48,0.25)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid #D8DBCF" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#3B4B6B" }}>
              <Sparkles size={15} color="white" />
            </div>
            <div>
              <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-sm leading-none">Blue Bonnet</p>
              <p className="text-[10px]" style={{ color: "#5B6470" }}>Your campus assistant</p>
            </div>
          </div>
          <button onClick={onClose}><X size={18} color="#5B6470" /></button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="flex" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div className="rounded-xl px-3 py-2 text-sm max-w-[80%]" style={{ background: m.role === "user" ? "#3B4B6B" : "#F2F3EB", color: m.role === "user" ? "white" : "#1B2430", whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "#F2F3EB", color: "#5B6470" }}>Thinking…</div>
            </div>
          )}
          {error && <p className="text-xs" style={{ color: "#B4432F" }}>{error}</p>}
        </div>
        <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #D8DBCF" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your classes, budget, deadlines…"
            className="flex-1 px-3 py-2 rounded-xl text-sm"
            style={inputStyle}
          />
          <button onClick={send} disabled={loading || !input.trim()} className="px-3 rounded-xl disabled:opacity-40 flex items-center justify-center" style={{ background: "#3B4B6B", color: "white" }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CampusApp() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [classes, setClasses] = useState([]);
  const [pins, setPins] = useState([]);
  const [events, setEvents] = useState([]);
  const [budgetCats, setBudgetCats] = useState([]);
  const [budgetTx, setBudgetTx] = useState([]);
  const [semester, setSemester] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [splits, setSplits] = useState([]);
  const [importantDates, setImportantDates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [profile, setProfile] = useState({ name: "", school: "", studentId: "", photo: "", verified: false });
  const [enrollment, setEnrollment] = useState(null);
  const [enrollChecklist, setEnrollChecklist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [showFeed, setShowFeed] = useState(false);
  const [showID, setShowID] = useState(false);
  const [showBlueBonnet, setShowBlueBonnet] = useState(false);
  const [saveError, setSaveError] = useState("");
  const alertedKeys = useRef(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    (async () => {
      const loadKey = async (key, fallback) => {
        try {
          const r = await window.storage.get(key);
          return r ? JSON.parse(r.value) : fallback;
        } catch (e) {
          return fallback;
        }
      };
      setClasses(await loadKey("campus-classes", []));
      setPins(await loadKey("campus-pins", []));
      setEvents(await loadKey("campus-events", []));
      setBudgetCats(await loadKey("campus-budget-cats", [
        { id: uid(), name: "Dining Out", weeklyLimit: 40, discretionary: true },
        { id: uid(), name: "Coffee", weeklyLimit: 15, discretionary: true },
        { id: uid(), name: "Textbooks & Supplies", weeklyLimit: 30, discretionary: false },
      ]));
      setBudgetTx(await loadKey("campus-budget-tx", []));
      setSemester(await loadKey("campus-semester", null));
      setSubscriptions(await loadKey("campus-subscriptions", []));
      setSplits(await loadKey("campus-splits", []));
      setImportantDates(await loadKey("campus-dates", []));
      setAssignments(await loadKey("campus-assignments", []));
      setProfile(await loadKey("campus-profile", { name: "", school: "", studentId: "", photo: "", verified: false }));
      setEnrollment(await loadKey("campus-enrollment", null));
      setEnrollChecklist(await loadKey("campus-enrollment-checklist", DEFAULT_ENROLL_STEPS.map((text) => ({ id: uid(), text, done: false }))));
      setAlerts(await loadKey("campus-alerts", []));
      setLoading(false);
      initialized.current = true;
    })();
  }, []);

  async function persist(key, value) {
    try {
      const res = await window.storage.set(key, JSON.stringify(value));
      setSaveError(res ? "" : "Couldn't save — changes may not persist.");
    } catch (e) {
      setSaveError("Couldn't save — changes may not persist.");
    }
  }
  useEffect(() => { if (initialized.current) persist("campus-classes", classes); }, [classes]);
  useEffect(() => { if (initialized.current) persist("campus-pins", pins); }, [pins]);
  useEffect(() => { if (initialized.current) persist("campus-events", events); }, [events]);
  useEffect(() => { if (initialized.current) persist("campus-budget-cats", budgetCats); }, [budgetCats]);
  useEffect(() => { if (initialized.current) persist("campus-budget-tx", budgetTx); }, [budgetTx]);
  useEffect(() => { if (initialized.current && semester) persist("campus-semester", semester); }, [semester]);
  useEffect(() => { if (initialized.current) persist("campus-subscriptions", subscriptions); }, [subscriptions]);
  useEffect(() => { if (initialized.current) persist("campus-splits", splits); }, [splits]);
  useEffect(() => { if (initialized.current) persist("campus-dates", importantDates); }, [importantDates]);
  useEffect(() => { if (initialized.current) persist("campus-assignments", assignments); }, [assignments]);
  useEffect(() => { if (initialized.current) persist("campus-profile", profile); }, [profile]);
  useEffect(() => { if (initialized.current && enrollment) persist("campus-enrollment", enrollment); }, [enrollment]);
  useEffect(() => { if (initialized.current) persist("campus-enrollment-checklist", enrollChecklist); }, [enrollChecklist]);
  useEffect(() => { if (initialized.current) persist("campus-alerts", alerts); }, [alerts]);

  function pushAlert(key, message, level) {
    if (alertedKeys.current.has(key)) return;
    alertedKeys.current.add(key);
    setAlerts((prev) => [{ id: uid(), message, level, timestamp: new Date().toISOString() }, ...prev].slice(0, 60));
  }

  // live check: class starting soon + tight back-to-back transitions + events today
  function runChecks() {
    const now = new Date();
    const todayStr = now.toDateString();
    const dayIdx = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const todays = classes.filter((c) => c.days.includes(dayIdx)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
    todays.forEach((c) => {
      const startMin = parseTime(c.start);
      if (nowMin >= startMin - 15 && nowMin < startMin) {
        pushAlert(`class-${c.id}-${todayStr}`, `${c.name} starts in ${startMin - nowMin} min${c.location ? ` at ${c.location}` : ""}.`, "info");
      }
    });
    for (let i = 0; i < todays.length - 1; i++) {
      const a = todays[i], b = todays[i + 1];
      const gap = parseTime(b.start) - parseTime(a.end);
      const pinA = pins.find((p) => p.id === a.pinId);
      const pinB = pins.find((p) => p.id === b.pinId);
      const wm = walkMinutes(pinA, pinB);
      if (wm !== null && gap < wm + 5) {
        pushAlert(`gap-${a.id}-${b.id}-${todayStr}`, `Tight transition: ${a.name} → ${b.name} is a ${wm} min walk but you only have ${gap} min.`, "warn");
      }
    }
    events.forEach((ev) => {
      if (!ev.date || !ev.time) return;
      if (new Date(ev.date).toDateString() !== todayStr) return;
      const startMin = parseTime(ev.time);
      if (nowMin >= startMin - 60 && nowMin < startMin) {
        pushAlert(`event-${ev.id}-${todayStr}`, `${ev.title} starts in ${startMin - nowMin} min${ev.location ? ` at ${ev.location}` : ""}.`, "info");
      }
    });
    subscriptions.forEach((sub) => {
      const nd = nextRenewalDate(sub);
      const away = daysUntil(nd);
      if (away >= 0 && away <= 3) {
        pushAlert(`sub-${sub.id}-${nd.toDateString()}`, `${sub.name} renews ${away === 0 ? "today" : `in ${away} day${away > 1 ? "s" : ""}`} — ${fmtMoney(sub.amount)}.`, "warn");
      }
    });
    importantDates.forEach((d) => {
      const away = daysUntil(d.date);
      if (away >= 0 && away <= 3) {
        pushAlert(`date-${d.id}-${d.date}`, `${d.label} is ${away === 0 ? "today" : `in ${away} day${away > 1 ? "s" : ""}`}.`, away <= 1 ? "over" : "warn");
      }
    });
    assignments.forEach((a) => {
      if (a.done) return;
      const away = daysUntil(a.dueDate);
      if (away >= 0 && away <= 2) {
        pushAlert(`assign-${a.id}-${a.dueDate}`, `${a.title} is due ${away === 0 ? "today" : `in ${away} day${away > 1 ? "s" : ""}`}.`, away === 0 ? "over" : "warn");
      }
    });
  }
  useEffect(() => {
    if (loading) return;
    runChecks();
    const interval = setInterval(runChecks, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, classes, pins, events, subscriptions, importantDates, assignments]);

  // ---- budget helpers ----
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());
  function spentFor(catId) {
    return budgetTx.filter((t) => t.categoryId === catId).filter((t) => { const d = new Date(t.date); return d >= weekStart && d <= weekEnd; }).reduce((s, t) => s + t.amount, 0);
  }
  function addTransaction(categoryId, amount, note) {
    const cat = budgetCats.find((c) => c.id === categoryId);
    if (!cat || !amount || amount <= 0) return;
    const prevSpent = spentFor(categoryId);
    setBudgetTx((prev) => [...prev, { id: uid(), categoryId, amount, note: note || "", date: new Date().toISOString() }]);
    const newSpent = prevSpent + amount;
    const prevPct = (prevSpent / cat.weeklyLimit) * 100;
    const newPct = (newSpent / cat.weeklyLimit) * 100;
    if (prevPct < 100 && newPct >= 100) pushAlert(`budget-over-${cat.id}-${Date.now()}`, `${cat.name} hit its weekly limit of ${fmtMoney(cat.weeklyLimit)}.`, "over");
    else if (prevPct < 75 && newPct >= 75) pushAlert(`budget-warn-${cat.id}-${Date.now()}`, `${cat.name} is at ${Math.round(newPct)}% of its weekly limit.`, "warn");
  }

  const activeBanners = alerts.filter((a) => !dismissed.includes(a.id)).slice(0, 3);
  const isVerified = !!enrollment?.verified;
  function tryVerify(email) {
    if (!isAllowedEmail(email, enrollment.school)) return false;
    setEnrollment({ ...enrollment, email: email.trim(), verified: true, verifiedAt: new Date().toISOString() });
    return true;
  }

  if (loading) {
    return (
      <div style={{ background: "#EEF0E6", minHeight: "100vh" }} className="flex flex-col items-center justify-center gap-3">
        <style>{FONTS_IMPORT + GLOBAL_CSS}</style>
        <BrandMark size={44} />
        <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600, color: "#1B2430" }} className="text-lg">Campus</p>
        <p style={{ fontFamily: "Inter, sans-serif", color: "#5B6470" }} className="text-xs">Loading your day…</p>
      </div>
    );
  }

  if (!enrollment) {
    return <EnrollmentGate onVerified={(e) => { setEnrollment(e); setProfile((p) => ({ ...p, school: p.school || e.school })); }} />;
  }

  const TABS = [
    { id: "today", label: "Today", icon: Home },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "budget", label: "Budget", icon: Wallet },
    { id: "map", label: "Map", icon: MapPin },
    { id: "events", label: "Events", icon: PartyPopper },
  ];

  return (
    <div style={{ background: "linear-gradient(180deg, #F1F3E9 0%, #E9ECE0 60%, #E4E7DA 100%)", color: "#1B2430", fontFamily: "Inter, sans-serif", minHeight: "100vh" }} className="pb-24">
      <style>{FONTS_IMPORT + GLOBAL_CSS}</style>

      <div className="sticky top-0 z-30" style={{ background: "rgba(241,243,233,0.85)", backdropFilter: "blur(10px)", borderBottom: "1px solid #D8DBCF", boxShadow: "0 1px 0 rgba(255,255,255,0.6), 0 4px 16px rgba(27,36,48,0.05)" }}>
        <div className="max-w-md mx-auto px-5 pt-5 pb-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={34} />
            <div>
              <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-2xl tracking-tight leading-none">Campus</h1>
              <p className="text-xs mt-1" style={{ color: "#5B6470" }}>Money, classes, and campus life in one place</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowID(true)} className="relative p-2 rounded-full" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
              <CreditCard size={18} color="#1B2430" />
            </button>
            <button onClick={() => setShowFeed(true)} className="relative p-2 rounded-full" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
              <Bell size={18} color="#1B2430" />
              {alerts.length > 0 && <span className="absolute -top-1 -right-1 rounded-full text-[10px] flex items-center justify-center" style={{ background: "#B4432F", color: "white", width: 16, height: 16, boxShadow: "0 1px 3px rgba(180,67,47,0.5)" }}>{alerts.length > 9 ? "9+" : alerts.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {activeBanners.length > 0 && (
        <div className="max-w-md mx-auto px-5 pt-2 space-y-2">
          {activeBanners.map((a) => {
            const Icon = LEVEL_ICON[a.level] || Bell;
            return (
              <div key={a.id} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: `${LEVEL_COLOR[a.level]}1A`, borderLeft: `3px solid ${LEVEL_COLOR[a.level]}` }}>
                <Icon size={16} style={{ color: LEVEL_COLOR[a.level], marginTop: 2, flexShrink: 0 }} />
                <p className="text-sm flex-1">{a.message}</p>
                <button onClick={() => setDismissed((p) => [...p, a.id])}><X size={15} color="#5B6470" /></button>
              </div>
            );
          })}
        </div>
      )}

      <div key={tab} className="campus-fade-in max-w-md mx-auto px-5 pt-4">
        {tab === "today" && <TodayTab classes={classes} pins={pins} events={events} budgetCats={budgetCats} spentFor={spentFor} semester={semester} subscriptions={subscriptions} budgetTx={budgetTx} assignments={assignments} isVerified={isVerified} school={enrollment.school} tryVerify={tryVerify} enrollChecklist={enrollChecklist} setEnrollChecklist={setEnrollChecklist} />}
        {tab === "schedule" && <ScheduleTab classes={classes} setClasses={setClasses} pins={pins} importantDates={importantDates} setImportantDates={setImportantDates} assignments={assignments} setAssignments={setAssignments} isVerified={isVerified} school={enrollment.school} tryVerify={tryVerify} />}
        {tab === "budget" && (
          <BudgetTab
            cats={budgetCats} setCats={setBudgetCats} spentFor={spentFor} addTransaction={addTransaction} tx={budgetTx} setTx={setBudgetTx}
            semester={semester} setSemester={setSemester} budgetTx={budgetTx}
            subscriptions={subscriptions} setSubscriptions={setSubscriptions}
            splits={splits} setSplits={setSplits}
          />
        )}
        {tab === "map" && (isVerified ? <MapTab pins={pins} setPins={setPins} /> : <LockedFeature what="the campus map" school={enrollment.school} tryVerify={tryVerify} />)}
        {tab === "events" && (isVerified ? <EventsTab events={events} setEvents={setEvents} pins={pins} /> : <LockedFeature what="campus events" school={enrollment.school} tryVerify={tryVerify} />)}
        {saveError && <p className="text-xs mt-3" style={{ color: "#B4432F" }}>{saveError}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40" style={{ background: "rgba(251,251,246,0.9)", backdropFilter: "blur(10px)", borderTop: "1px solid #D8DBCF", boxShadow: "0 -4px 20px rgba(27,36,48,0.08)" }}>
        <div className="max-w-md mx-auto flex">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const locked = !isVerified && (t.id === "map" || t.id === "events");
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="relative flex-1 flex flex-col items-center gap-1 py-2.5">
                {active && <div className="absolute top-0 rounded-b-full" style={{ width: 20, height: 2.5, background: "#F4C77A" }} />}
                <div className="relative">
                  <Icon size={19} color={active ? "#3B4B6B" : "#9098A0"} />
                  {locked && <div className="absolute -bottom-0.5 -right-1 rounded-full flex items-center justify-center" style={{ width: 10, height: 10, background: "#FBFBF6" }}><ShieldCheck size={8} color="#C77D2D" /></div>}
                </div>
                <span className="text-[10px]" style={{ color: active ? "#3B4B6B" : "#9098A0", fontWeight: active ? 600 : 400 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => setShowBlueBonnet(true)}
        className="fixed z-40 rounded-full flex items-center justify-center"
        style={{ bottom: 88, right: 20, width: 52, height: 52, background: "linear-gradient(135deg, #3B4B6B, #2E3C57)", boxShadow: "0 8px 20px -4px rgba(59,75,107,0.5)" }}
      >
        <Sparkles size={22} color="white" />
      </button>

      {showBlueBonnet && (
        <BlueBonnetChat
          contextText={buildBlueBonnetContext({ enrollment, isVerified, classes, assignments, events, budgetCats, spentFor, budgetTx, semester, subscriptions })}
          onClose={() => setShowBlueBonnet(false)}
        />
      )}

      {showID && <DigitalIDModal profile={profile} setProfile={setProfile} classes={classes} enrollment={enrollment} onSignOut={() => setEnrollment(null)} onClose={() => setShowID(false)} />}

      {showFeed && (
        <Modal title="Notifications" onClose={() => setShowFeed(false)}>
          {alerts.length === 0 && <p className="text-sm" style={{ color: "#5B6470" }}>No alerts yet. You'll see class reminders, tight-transition warnings, event reminders, and budget alerts here.</p>}
          <div className="space-y-2">
            {alerts.map((a) => {
              const Icon = LEVEL_ICON[a.level] || Bell;
              return (
                <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: "#F2F3EB" }}>
                  <Icon size={14} style={{ color: LEVEL_COLOR[a.level], marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1">
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs" style={{ color: "#5B6470" }}>{new Date(a.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

function resizeImage(file, maxSize = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function DigitalIDModal({ profile, setProfile, classes, enrollment, onSignOut, onClose }) {
  const [form, setForm] = useState(profile);
  const [error, setError] = useState("");
  const fileInput = useRef(null);
  const dayIdx = new Date().getDay();
  const todays = classes.filter((c) => c.days.includes(dayIdx)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const isVerified = !!enrollment?.verified;

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setForm((f) => ({ ...f, photo: dataUrl }));
    } catch (err) {
      setError("Couldn't process that photo — try a different one.");
    }
  }
  function save() {
    setProfile(form);
    onClose();
  }

  return (
    <Modal title="Student ID" onClose={onClose}>
      {/* card preview */}
      <div className="rounded-xl p-4 mb-4" style={{ background: "linear-gradient(135deg, #3B4B6B, #2E3C57)", color: "white", boxShadow: "0 8px 24px -8px rgba(59,75,107,0.5)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <BrandMark size={22} />
            <span className="text-xs font-medium tracking-wide uppercase" style={{ opacity: 0.85 }}>Campus</span>
          </div>
          {isVerified ? (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
              <ShieldCheck size={11} /> Student email verified
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(244,199,122,0.25)" }}>
              <Clock size={11} /> Pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 56, height: 56, background: "rgba(255,255,255,0.15)", overflow: "hidden", border: "2px solid rgba(255,255,255,0.3)" }}>
            {form.photo ? <img src={form.photo} alt="" className="w-full h-full object-cover" /> : <Camera size={20} color="rgba(255,255,255,0.6)" />}
          </div>
          <div className="min-w-0">
            <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg truncate">{form.name || "Your name"}</p>
            <p className="text-xs truncate" style={{ opacity: 0.8 }}>{form.school || "Your school"}</p>
            <p className="text-xs mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", opacity: 0.8 }}>{form.studentId || "ID number"}</p>
          </div>
        </div>
        {todays.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ opacity: 0.7 }}>Today</p>
            {todays.slice(0, 3).map((c) => (
              <p key={c.id} className="text-xs" style={{ opacity: 0.9 }}>{fmtTime(c.start)} · {c.name}</p>
            ))}
          </div>
        )}
      </div>

      <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="School"><input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="Your college" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Student ID number"><input value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} placeholder="e.g. 20260145" className="w-full px-3 py-2 rounded-xl" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} /></Field>
      <Field label="Photo">
        <input ref={fileInput} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        <button onClick={() => fileInput.current.click()} className="w-full py-2 rounded-xl text-sm flex items-center justify-center gap-1.5" style={{ border: "1px solid #D8DBCF", color: "#3B4B6B" }}><Camera size={14} /> {form.photo ? "Replace photo" : "Upload a photo"}</button>
        {error && <p className="text-xs mt-1" style={{ color: "#B4432F" }}>{error}</p>}
      </Field>
      <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "#F2F3EB" }}>
        {isVerified ? (
          <>
            <p className="flex items-center gap-1.5" style={{ color: "#1F7A5C" }}><ShieldCheck size={14} /> Signed in with {enrollment.email}</p>
            <p className="text-xs mt-1" style={{ color: "#5B6470" }}>Verified badge is based on a student-email domain match, not your school's registrar.</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5" style={{ color: "#C77D2D" }}><Clock size={14} /> Pending — not enrolled yet</p>
            <p className="text-xs mt-1" style={{ color: "#5B6470" }}>You're using Campus without a verified student email. Sign in with your student email once you're registered to switch to Verified.</p>
          </>
        )}
      </div>
      <button onClick={save} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Save ID</button>
      <p className="text-xs mt-3 text-center" style={{ color: "#5B6470" }}>Your photo is stored privately on your device account — no one else can see it.</p>
      <button onClick={onSignOut} className="w-full text-xs mt-3 text-center" style={{ color: "#B4432F" }}>Sign out</button>
    </Modal>
  );
}

// ---------------- Today ----------------
const DEFAULT_ENROLL_STEPS = [
  "Submit your admissions application",
  "Request your official high school transcript or GED sent to the school",
  "Complete the FAFSA (or your state/school financial aid form)",
  "Take your placement assessment or submit SAT/ACT/TSI scores",
  "Apply for scholarships you may qualify for",
  "Meet with an academic advisor to plan your first semester",
  "Register for new-student orientation",
  "Submit immunization records (if your school requires them)",
  "Set up your school email and student portal login",
  "Register for classes",
  "Pay your tuition deposit or set up a payment plan",
  "Order your student ID and check on-campus housing/parking if needed",
];
function enrollChecklistKey() { return "campus-enrollment-checklist"; }

function EnrollmentChecklistCard({ isVerified, items, setItems }) {
  const [open, setOpen] = useState(!isVerified);
  const [text, setText] = useState("");
  const done = items.filter((i) => i.done).length;
  const pct = items.length > 0 ? (done / items.length) * 100 : 0;

  function addItem() {
    if (!text.trim()) return;
    setItems((prev) => [...prev, { id: uid(), text: text.trim(), done: false }]);
    setText("");
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#5B6470" }}>
          <ListChecks size={13} /> {isVerified ? "Enrollment checklist" : "Getting enrolled"}
        </span>
        {open ? <ChevronUp size={14} color="#5B6470" /> : <ChevronDown size={14} color="#5B6470" />}
      </button>
      {open && (
        <div className="mt-3">
          {!isVerified && <p className="text-xs mb-3" style={{ color: "#5B6470" }}>General steps for getting into an accredited school — check off what you've done. Your specific school may have a few extra requirements, so confirm anything unclear with their admissions office.</p>}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs" style={{ color: "#5B6470" }}>{done} of {items.length} done</span>
              <span className="text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#5B6470" }}>{Math.round(pct)}%</span>
            </div>
            <RulerBar pct={pct} status={pct >= 100 ? "ok" : pct >= 50 ? "warn" : "over"} />
          </div>
          <div className="space-y-1.5 mt-3">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <button onClick={() => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="flex-shrink-0">
                  <div className="w-4 h-4 rounded-md flex items-center justify-center" style={{ border: "1px solid #3B4B6B", background: it.done ? "#3B4B6B" : "white" }}>
                    {it.done && <Check size={11} color="white" />}
                  </div>
                </button>
                <span className="flex-1" style={{ textDecoration: it.done ? "line-through" : "none", color: it.done ? "#9098A0" : "#1B2430" }}>{it.text}</span>
                <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}><X size={12} color="#B0B4A6" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Add your own step"
              className="flex-1 px-2.5 py-1.5 rounded-xl text-sm"
              style={inputStyle}
            />
            <button onClick={addItem} className="px-2.5 rounded-xl" style={{ background: "#3B4B6B", color: "white" }}><Plus size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function TodayTab({ classes, pins, events, budgetCats, spentFor, semester, subscriptions, budgetTx, assignments, isVerified, school, tryVerify, enrollChecklist, setEnrollChecklist }) {
  const now = new Date();
  const dayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todays = classes.filter((c) => c.days.includes(dayIdx)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const next = todays.find((c) => parseTime(c.end) > nowMin);
  const todayEvents = events.filter((e) => e.date && new Date(e.date).toDateString() === now.toDateString());
  const dueSoon = assignments.filter((a) => !a.done && daysUntil(a.dueDate) >= 0 && daysUntil(a.dueDate) <= 3).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const commitmentCount = todays.length + todayEvents.length;
  const heavyDay = commitmentCount >= 4;
  const discCats = budgetCats.filter((c) => c.discretionary);
  const discSpent = discCats.reduce((s, c) => s + spentFor(c.id), 0);
  const discLimit = discCats.reduce((s, c) => s + c.weeklyLimit, 0);
  const upcomingSubs = subscriptions
    .map((s) => ({ ...s, next: nextRenewalDate(s), away: daysUntil(nextRenewalDate(s)) }))
    .filter((s) => s.away <= 7)
    .sort((a, b) => a.away - b.away);

  const pace = semester ? computeSemesterPace(semester, budgetTx) : null;

  return (
    <div className="space-y-4">
      <EnrollmentChecklistCard isVerified={isVerified} items={enrollChecklist} setItems={setEnrollChecklist} />
      {pace && <SemesterPaceCard pace={pace} total={semester.total} />}
      {heavyDay && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: "rgba(199,125,45,0.1)", borderLeft: "3px solid #C77D2D" }}>
          <AlertTriangle size={15} style={{ color: "#C77D2D", flexShrink: 0 }} />
          <span>Heavy day — {commitmentCount} things on the calendar. Worth protecting a real break somewhere.</span>
        </div>
      )}
      <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", borderTop: "3px dashed #C3C7B8", boxShadow: "0 2px 4px rgba(27,36,48,0.05), 0 10px 24px -8px rgba(59,75,107,0.18)" }}>
        <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#5B6470" }}>Up next</p>
        {next ? (
          <>
            <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-xl">{next.name}</p>
            <p className="text-sm mt-0.5" style={{ color: "#5B6470" }}>{fmtTime(next.start)} – {fmtTime(next.end)}{next.location ? ` · ${next.location}` : ""}</p>
          </>
        ) : <p className="text-sm" style={{ color: "#5B6470" }}>No more classes today.</p>}
      </div>

      {todayEvents.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#5B6470" }}>Today's events</p>
          <div className="space-y-1.5">
            {todayEvents.map((e) => (
              <div key={e.id} className="flex justify-between text-sm">
                <span>{e.title}</span>
                <span style={{ color: "#5B6470" }}>{e.time ? fmtTime(e.time) : "All day"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dueSoon.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
          <p className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#5B6470" }}><ListChecks size={13} /> Due soon</p>
          <div className="space-y-1.5">
            {dueSoon.map((a) => {
              const away = daysUntil(a.dueDate);
              return (
                <div key={a.id} className="flex justify-between text-sm">
                  <span>{a.title}</span>
                  <span style={{ color: away <= 1 ? "#B4432F" : "#C77D2D" }}>{away === 0 ? "Today" : `${away}d`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upcomingSubs.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#5B6470" }}>Renewing soon</p>
          <div className="space-y-1.5">
            {upcomingSubs.map((s) => (
              <div key={s.id} className="flex justify-between text-sm">
                <span>{s.name}</span>
                <span style={{ color: s.away <= 3 ? "#C77D2D" : "#5B6470" }}>{s.away === 0 ? "Today" : `${s.away}d`} · {fmtMoney(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
        <RadialRing pct={discLimit > 0 ? (discSpent / discLimit) * 100 : 0} status={statusFor(discLimit > 0 ? (discSpent / discLimit) * 100 : 0)}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }} className="text-xs">{discLimit > 0 ? Math.round((discSpent / discLimit) * 100) : 0}%</span>
        </RadialRing>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#5B6470" }}>Discretionary spend this week</p>
          <div className="flex items-baseline gap-1.5">
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }} className="text-2xl">{fmtMoney(discSpent)}</span>
            <span style={{ color: "#5B6470", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">/ {fmtMoney(discLimit)}</span>
          </div>
        </div>
      </div>

      <CampusSafetyCard />
      <CampusSupportCard />
    </div>
  );
}

function RadialRing({ pct, status, size = 72, children }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(pct, 100);
  const gradients = { ok: "#1F7A5C", warn: "#C77D2D", over: "#B4432F" };
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E3E6DA" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={gradients[status]} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function CampusSafetyCard() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState("");
  const [escortNumber, setEscortNumber] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("campus-safety-info");
        if (r) {
          const v = JSON.parse(r.value);
          setSafetyNumber(v.safetyNumber || "");
          setEscortNumber(v.escortNumber || "");
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);
  async function save() {
    try {
      await window.storage.set("campus-safety-info", JSON.stringify({ safetyNumber, escortNumber }));
    } catch (e) {}
    setEditing(false);
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#5B6470" }}><ShieldAlert size={13} /> Campus safety</span>
        {open ? <ChevronUp size={14} color="#5B6470" /> : <ChevronDown size={14} color="#5B6470" />}
      </button>
      {open && loaded && (
        <div className="mt-3 space-y-2.5 text-sm">
          <p className="flex items-center gap-1.5"><Phone size={13} color="#B4432F" /> Emergency — call 911</p>
          {editing ? (
            <>
              <input value={safetyNumber} onChange={(e) => setSafetyNumber(e.target.value)} placeholder="Campus safety / police non-emergency number" className="w-full px-3 py-2 rounded-xl" style={inputStyle} />
              <input value={escortNumber} onChange={(e) => setEscortNumber(e.target.value)} placeholder="Safety escort number (if your campus has one)" className="w-full px-3 py-2 rounded-xl" style={inputStyle} />
              <button onClick={save} className="w-full py-2 rounded-xl text-sm" style={{ background: "#3B4B6B", color: "white" }}>Save</button>
            </>
          ) : (
            <>
              {safetyNumber ? <p className="flex items-center gap-1.5"><Phone size={13} color="#3B4B6B" /> Campus safety — {safetyNumber}</p> : null}
              {escortNumber ? <p className="flex items-center gap-1.5"><Footprints size={13} color="#3B4B6B" /> Safety escort — {escortNumber}</p> : null}
              {!safetyNumber && !escortNumber && <button onClick={() => setEditing(true)} className="text-xs" style={{ color: "#3B4B6B" }}>+ Add your campus safety numbers</button>}
              <a href="https://www.nsopw.gov" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5" style={{ color: "#3B4B6B" }}>
                <ExternalLink size={13} /> Search the official public sex offender registry
              </a>
              {(safetyNumber || escortNumber) && <button onClick={() => setEditing(true)} className="text-xs" style={{ color: "#3B4B6B" }}>Edit numbers</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CampusSupportCard() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [center, setCenter] = useState("");
  const [number, setNumber] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("campus-support-info");
        if (r) {
          const v = JSON.parse(r.value);
          setCenter(v.center || "");
          setNumber(v.number || "");
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);
  async function save() {
    try {
      await window.storage.set("campus-support-info", JSON.stringify({ center, number }));
    } catch (e) {}
    setEditing(false);
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#5B6470" }}><LifeBuoy size={13} /> Campus support</span>
        {open ? <ChevronUp size={14} color="#5B6470" /> : <ChevronDown size={14} color="#5B6470" />}
      </button>
      {open && loaded && (
        <div className="mt-3 space-y-2 text-sm">
          {editing ? (
            <>
              <input value={center} onChange={(e) => setCenter(e.target.value)} placeholder="Your campus counseling center" className="w-full px-3 py-2 rounded-xl" style={inputStyle} />
              <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Their phone number" className="w-full px-3 py-2 rounded-xl" style={inputStyle} />
              <button onClick={save} className="w-full py-2 rounded-xl text-sm" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}>Save</button>
            </>
          ) : (
            <>
              {center ? <p>{center}{number ? ` · ${number}` : ""}</p> : <button onClick={() => setEditing(true)} className="text-xs" style={{ color: "#3B4B6B" }}>+ Add your campus counseling center</button>}
              <p style={{ color: "#5B6470" }}>988 Suicide & Crisis Lifeline — call or text 988, any time.</p>
              {center && <button onClick={() => setEditing(true)} className="text-xs" style={{ color: "#3B4B6B" }}>Edit</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SemesterPaceCard({ pace, total }) {
  const pct = Math.min(100, Math.max(0, ((total - pace.remaining) / total) * 100));
  const diff = Math.abs(pace.remaining - pace.expectedRemaining);
  const ahead = pace.remaining >= pace.expectedRemaining;
  return (
    <div className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
      <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#5B6470" }}>Semester funds</p>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }} className="text-2xl">{fmtMoney(pace.remaining)}</span>
        <span style={{ color: "#5B6470", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">left of {fmtMoney(total)}</span>
      </div>
      <RulerBar pct={pct} status={pace.status} />
      <p className="text-xs mt-2" style={{ color: pace.status === "ok" ? "#1F7A5C" : pace.status === "warn" ? "#C77D2D" : "#B4432F" }}>
        {ahead ? `${fmtMoney(diff)} ahead of an even pace` : `${fmtMoney(diff)} behind an even pace`} · about {fmtMoney(pace.weeklyAllowance)}/week to stay on track
      </p>
    </div>
  );
}

// ---------------- Schedule ----------------
function ScheduleTab({ classes, setClasses, pins, importantDates, setImportantDates, assignments, setAssignments, isVerified, school, tryVerify }) {
  const [dayIdx, setDayIdx] = useState(new Date().getDay() === 0 ? 1 : new Date().getDay());
  const [showAdd, setShowAdd] = useState(false);
  const [showAddDate, setShowAddDate] = useState(false);
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [openChecklist, setOpenChecklist] = useState(null);
  const dayClasses = classes.filter((c) => c.days.includes(dayIdx)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const sortedDates = [...importantDates].sort((a, b) => new Date(a.date) - new Date(b.date));
  const sortedAssignments = [...assignments].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return (
    <div>
      <div className="rounded-xl p-3.5 mb-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#5B6470" }}><ListChecks size={12} /> Student checklist</p>
        </div>
        {isVerified ? (
          <>
            <p className="text-[10px] mb-2" style={{ color: "#9098A0" }}>Shared with everyone verified at {school}</p>
            <ChecklistPanel storageKey={schoolChecklistKey(school)} noBorder hideLabel />
          </>
        ) : (
          <p className="text-xs" style={{ color: "#5B6470" }}>Move-in steps, first-week to-dos, anything worth broadcasting to everyone at {school || "your school"}. Verify your student email to see and add items.</p>
        )}
      </div>

      <div className="rounded-xl p-3.5 mb-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#5B6470" }}><Flag size={12} /> Important dates</p>
            <button onClick={() => setShowAddDate(true)} className="text-xs px-2 py-1 rounded-xl flex items-center gap-1" style={{ border: "1px solid #3B4B6B", color: "#3B4B6B" }}><Plus size={11} /> Add</button>
          </div>
          {sortedDates.length === 0 && <p className="text-xs" style={{ color: "#5B6470" }}>Track drop deadlines, last day of classes, finals week.</p>}
          <div className="space-y-1">
            {sortedDates.map((d) => {
              const away = daysUntil(d.date);
              return (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.label}</span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: away <= 3 ? "#C77D2D" : "#5B6470" }} className="text-xs">
                      {away === 0 ? "Today" : away > 0 ? `in ${away}d` : "past"}
                    </span>
                    <button onClick={() => setImportantDates((prev) => prev.filter((x) => x.id !== d.id))}><X size={12} color="#B0B4A6" /></button>
                  </div>
                </div>
              );
            })}
          </div>
      </div>
      {showAddDate && (
        <Modal title="Add important date" onClose={() => setShowAddDate(false)}>
          <AddDateForm onSave={(label, date) => { setImportantDates((p) => [...p, { id: uid(), label, date }]); setShowAddDate(false); }} />
        </Modal>
      )}

      <div className="rounded-xl p-3.5 mb-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#5B6470" }}><ListChecks size={12} /> Assignments</p>
          <button onClick={() => setShowAddAssign(true)} className="text-xs px-2 py-1 rounded-xl flex items-center gap-1" style={{ border: "1px solid #3B4B6B", color: "#3B4B6B" }}><Plus size={11} /> Add</button>
        </div>
        {sortedAssignments.length === 0 && <p className="text-xs" style={{ color: "#5B6470" }}>Track what's due so nothing sneaks up on you.</p>}
        <div className="space-y-1.5">
          {sortedAssignments.map((a) => {
            const away = daysUntil(a.dueDate);
            return (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <button onClick={() => setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))} className="flex-shrink-0">
                  <div className="w-4 h-4 rounded-xl flex items-center justify-center" style={{ border: "1px solid #3B4B6B", background: a.done ? "#3B4B6B" : "white" }}>
                    {a.done && <Check size={11} color="white" />}
                  </div>
                </button>
                <span className="flex-1" style={{ textDecoration: a.done ? "line-through" : "none", color: a.done ? "#9098A0" : "#1B2430" }}>{a.title}</span>
                <span className="text-xs" style={{ color: !a.done && away <= 1 ? "#B4432F" : "#5B6470" }}>
                  {away === 0 ? "Today" : away > 0 ? `${away}d` : "past due"}
                </span>
                <button onClick={() => setAssignments((prev) => prev.filter((x) => x.id !== a.id))}><X size={12} color="#B0B4A6" /></button>
              </div>
            );
          })}
        </div>
      </div>
      {showAddAssign && (
        <Modal title="Add assignment" onClose={() => setShowAddAssign(false)}>
          <AddAssignmentForm onSave={(a) => { setAssignments((p) => [...p, a]); setShowAddAssign(false); }} />
        </Modal>
      )}

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} onClick={() => setDayIdx(d)} className="px-3.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0" style={{ background: dayIdx === d ? "#3B4B6B" : "#FBFBF6", color: dayIdx === d ? "white" : "#1B2430", border: "1px solid #D8DBCF", boxShadow: dayIdx === d ? "0 2px 6px -1px rgba(59,75,107,0.4)" : "none" }}>
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg">Classes</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-xl" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}>
          <Plus size={14} /> Class
        </button>
      </div>

      {dayClasses.length === 0 && <p className="text-sm" style={{ color: "#5B6470" }}>No classes scheduled for {DAY_LABELS[dayIdx]}.</p>}

      <div className="space-y-2">
        {dayClasses.map((c, i) => {
          const next = dayClasses[i + 1];
          const pinA = pins.find((p) => p.id === c.pinId);
          const pinB = next ? pins.find((p) => p.id === next.pinId) : null;
          const wm = next ? walkMinutes(pinA, pinB) : null;
          const gap = next ? parseTime(next.start) - parseTime(c.end) : null;
          const tight = wm !== null && gap !== null && gap < wm + 5;
          return (
            <React.Fragment key={c.id}>
              <div className="rounded-xl p-3.5" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", borderLeft: `4px solid ${c.color}`, boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-base">{c.name}</p>
                    <p className="text-sm" style={{ color: "#5B6470" }}>{fmtTime(c.start)} – {fmtTime(c.end)}{c.location ? ` · ${c.location}` : ""}</p>
                  </div>
                  <button onClick={() => setClasses((prev) => prev.filter((x) => x.id !== c.id))}><Trash2 size={14} color="#B0B4A6" /></button>
                </div>
                {isVerified ? (
                  <>
                    <button onClick={() => setOpenChecklist(openChecklist === c.id ? null : c.id)} className="flex items-center gap-1 text-xs mt-2" style={{ color: "#3B4B6B" }}>
                      <ListChecks size={12} /> Class checklist {openChecklist === c.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {openChecklist === c.id && <ChecklistPanel storageKey={classChecklistKey(c.name)} />}
                  </>
                ) : (
                  <p className="flex items-center gap-1 text-xs mt-2" style={{ color: "#9098A0" }}>
                    <ListChecks size={12} /> Class checklist — verify enrollment to unlock
                  </p>
                )}
              </div>
              {next && wm !== null && (
                <div className="flex items-center gap-1.5 pl-2 text-xs" style={{ color: tight ? "#C77D2D" : "#5B6470" }}>
                  <Footprints size={12} /> {wm} min walk to next class {tight && "— tight"}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {showAdd && <AddClassModal pins={pins} onClose={() => setShowAdd(false)} onAdd={(cls) => { setClasses((p) => [...p, cls]); setShowAdd(false); }} />}
    </div>
  );
}

function AddClassModal({ pins, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [pinId, setPinId] = useState("");
  const [color, setColor] = useState(CLASS_COLORS[0]);
  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const pin = pins.find((p) => p.id === pinId);

  return (
    <Modal title="Add class" onClose={onClose}>
      <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chem 101" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Days">
        <div className="flex gap-1.5 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} onClick={() => toggleDay(d)} className="px-2.5 py-1 rounded-full text-xs" style={{ background: days.includes(d) ? "#3B4B6B" : "white", color: days.includes(d) ? "white" : "#1B2430", border: "1px solid #D8DBCF" }}>{DAY_LABELS[d]}</button>
          ))}
        </div>
      </Field>
      <div className="flex gap-3">
        <Field label="Start"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
        <Field label="End"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      </div>
      <Field label="Building (optional)">
        <select value={pinId} onChange={(e) => setPinId(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle}>
          <option value="">No location set</option>
          {pins.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {pins.length === 0 && <p className="text-xs mt-1" style={{ color: "#5B6470" }}>Add pins on the Map tab to enable walk-time warnings.</p>}
      </Field>
      <Field label="Color">
        <div className="flex gap-2">
          {CLASS_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full" style={{ background: c, outline: color === c ? "2px solid #1B2430" : "none", outlineOffset: 2 }} />
          ))}
        </div>
      </Field>
      <button
        disabled={!name.trim() || days.length === 0}
        onClick={() => onAdd({ id: uid(), name: name.trim(), days, start, end, pinId: pinId || null, location: pin ? pin.name : "", color })}
        className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}
      ><Check size={15} /> Add class</button>
    </Modal>
  );
}

function ChecklistPanel({ storageKey, noBorder, hideLabel }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(storageKey, true);
        setItems(r ? JSON.parse(r.value) : []);
      } catch (e) {
        setItems([]);
      }
      setLoading(false);
    })();
  }, [storageKey]);

  async function save(newItems) {
    setItems(newItems);
    try {
      const res = await window.storage.set(storageKey, JSON.stringify(newItems), true);
      setError(res ? "" : "Couldn't sync — try again.");
    } catch (e) {
      setError("Couldn't sync — try again.");
    }
  }
  function addItem() {
    if (!text.trim()) return;
    save([...items, { id: uid(), text: text.trim(), done: false }]);
    setText("");
  }

  return (
    <div className={noBorder ? "" : "mt-2.5 pt-2.5"} style={noBorder ? {} : { borderTop: "1px dashed #D8DBCF" }}>
      {!hideLabel && <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "#9098A0" }}>Shared with anyone tracking this class</p>}
      {loading ? (
        <p className="text-xs" style={{ color: "#5B6470" }}>Loading…</p>
      ) : (
        <>
          {items.length === 0 && <p className="text-xs mb-2" style={{ color: "#5B6470" }}>No items yet — add what people need to know or bring.</p>}
          <div className="space-y-1.5 mb-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <button onClick={() => save(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="flex-shrink-0">
                  <div className="w-4 h-4 rounded-xl flex items-center justify-center" style={{ border: "1px solid #3B4B6B", background: it.done ? "#3B4B6B" : "white" }}>
                    {it.done && <Check size={11} color="white" />}
                  </div>
                </button>
                <span className="flex-1" style={{ textDecoration: it.done ? "line-through" : "none", color: it.done ? "#9098A0" : "#1B2430" }}>{it.text}</span>
                <button onClick={() => save(items.filter((x) => x.id !== it.id))}><X size={12} color="#B0B4A6" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="e.g. Bring calculator"
              className="flex-1 px-2.5 py-1.5 rounded-xl text-sm"
              style={inputStyle}
            />
            <button onClick={addItem} className="px-2.5 rounded-xl" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Plus size={14} /></button>
          </div>
          {error && <p className="text-xs mt-1" style={{ color: "#B4432F" }}>{error}</p>}
        </>
      )}
    </div>
  );
}

function AddDateForm({ onSave }) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div>
      <Field label="What is it"><input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Add/Drop Deadline" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <button disabled={!label.trim()} onClick={() => onSave(label.trim(), date)} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Save date</button>
    </div>
  );
}

function AddAssignmentForm({ onSave }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div>
      <Field label="Assignment"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chem lab report" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Due date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <button disabled={!title.trim()} onClick={() => onSave({ id: uid(), title: title.trim(), dueDate, done: false })} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Add assignment</button>
    </div>
  );
}

// ---------------- Budget ----------------
function BudgetTab({ cats, setCats, spentFor, addTransaction, tx, setTx, semester, setSemester, budgetTx, subscriptions, setSubscriptions, splits, setSplits }) {
  const [expanded, setExpanded] = useState(null);
  const [showAddCat, setShowAddCat] = useState(false);
  const [addTxFor, setAddTxFor] = useState(null);
  const [showSemesterSetup, setShowSemesterSetup] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [showAddSplit, setShowAddSplit] = useState(false);
  const pace = semester ? computeSemesterPace(semester, budgetTx) : null;
  const totalMonthlySubs = subscriptions.reduce((s, sub) => s + monthlyCost(sub), 0);
  const balances = {};
  splits.filter((s) => !s.settled).forEach((s) => {
    balances[s.person] = (balances[s.person] || 0) + (s.iOwe ? -s.amount : s.amount);
  });

  return (
    <div>
      {/* semester allowance */}
      <div className="rounded-xl p-4 mb-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", borderTop: "3px dashed #C3C7B8", boxShadow: "0 2px 4px rgba(27,36,48,0.05), 0 10px 24px -8px rgba(59,75,107,0.18)" }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs uppercase tracking-wide" style={{ color: "#5B6470" }}>Semester funds</p>
          <button onClick={() => setShowSemesterSetup(true)} className="text-xs" style={{ color: "#3B4B6B" }}><Settings size={13} /></button>
        </div>
        {pace ? (
          <>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }} className="text-xl">{fmtMoney(pace.remaining)}</span>
              <span style={{ color: "#5B6470", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm">left of {fmtMoney(semester.total)}</span>
            </div>
            <RulerBar pct={Math.min(100, Math.max(0, ((semester.total - pace.remaining) / semester.total) * 100))} status={pace.status} />
            <p className="text-xs mt-2" style={{ color: "#5B6470" }}>~{fmtMoney(pace.weeklyAllowance)}/week keeps you on pace to the end of the semester.</p>
          </>
        ) : (
          <p className="text-sm" style={{ color: "#5B6470" }}>Got a lump sum — financial aid, a parent transfer? Set it up once and see a weekly pace instead of one big scary number.</p>
        )}
      </div>
      {showSemesterSetup && <SemesterSetupModal semester={semester} onClose={() => setShowSemesterSetup(false)} onSave={(s) => { setSemester(s); setShowSemesterSetup(false); }} onClear={() => { setSemester(null); setShowSemesterSetup(false); }} />}

      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg">Weekly categories</h2>
        <button onClick={() => setShowAddCat(true)} className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-xl" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Plus size={14} /> Category</button>
      </div>
      <div className="space-y-3">
        {cats.map((cat) => {
          const spent = spentFor(cat.id);
          const pct = (spent / cat.weeklyLimit) * 100;
          const status = statusFor(pct);
          const isExp = expanded === cat.id;
          const catTx = tx.filter((t) => t.categoryId === cat.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
          return (
            <div key={cat.id} className="rounded-xl p-4" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>{cat.name}</span>
                  {cat.discretionary && <span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase" style={{ background: "#E3E6DA", color: "#5B6470" }}>Discretionary</span>}
                </div>
                <button onClick={() => setCats((prev) => prev.filter((c) => c.id !== cat.id))}><Trash2 size={14} color="#B0B4A6" /></button>
              </div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }} className="text-lg">{fmtMoney(spent)}</span>
                <span style={{ color: "#5B6470", fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs">of {fmtMoney(cat.weeklyLimit)}</span>
              </div>
              <RulerBar pct={pct} status={status} />
              <div className="flex items-center justify-between mt-2">
                <button onClick={() => setExpanded(isExp ? null : cat.id)} className="flex items-center gap-1 text-xs" style={{ color: "#5B6470" }}>
                  {catTx.length} recent {isExp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button onClick={() => setAddTxFor(cat.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-xl" style={{ border: "1px solid #3B4B6B", color: "#3B4B6B" }}><Plus size={12} /> Add expense</button>
              </div>
              {isExp && (
                <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px dashed #D8DBCF" }}>
                  {catTx.length === 0 && <p className="text-xs" style={{ color: "#5B6470" }}>No expenses yet.</p>}
                  {catTx.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span><span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmtMoney(t.amount)}</span>{t.note && ` — ${t.note}`}</span>
                      <button onClick={() => setTx((prev) => prev.filter((x) => x.id !== t.id))}><X size={12} color="#B0B4A6" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {addTxFor && <AddTxModal category={cats.find((c) => c.id === addTxFor)} onClose={() => setAddTxFor(null)} onAdd={(amt, note) => { addTransaction(addTxFor, amt, note); setAddTxFor(null); }} />}
      {showAddCat && <AddCategoryModal onClose={() => setShowAddCat(false)} onAdd={(name, limit, disc) => { setCats((p) => [...p, { id: uid(), name, weeklyLimit: limit, discretionary: disc }]); setShowAddCat(false); }} />}

      {/* subscriptions */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg flex items-center gap-1.5"><RefreshCw size={16} /> Subscriptions</h2>
        <button onClick={() => setShowAddSub(true)} className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-xl" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Plus size={14} /> Add</button>
      </div>
      {subscriptions.length === 0 ? (
        <p className="text-sm" style={{ color: "#5B6470" }}>Add streaming, software, or other recurring charges — you'll get a heads-up a few days before each renews.</p>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: "#5B6470" }}>{fmtMoney(totalMonthlySubs)}/month across {subscriptions.length} subscription{subscriptions.length > 1 ? "s" : ""}</p>
          <div className="space-y-2">
            {subscriptions.map((sub) => {
              const nd = nextRenewalDate(sub);
              const away = daysUntil(nd);
              return (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
                  <div>
                    <p className="text-sm font-medium">{sub.name}</p>
                    <p className="text-xs" style={{ color: "#5B6470" }}>{fmtMoney(sub.amount)}/{sub.cadence} · renews in {away}d</p>
                  </div>
                  <button onClick={() => setSubscriptions((prev) => prev.filter((s) => s.id !== sub.id))}><Trash2 size={14} color="#B0B4A6" /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {showAddSub && (
        <Modal title="Add subscription" onClose={() => setShowAddSub(false)}>
          <AddSubForm onSave={(sub) => { setSubscriptions((p) => [...p, sub]); setShowAddSub(false); }} />
        </Modal>
      )}

      {/* split expenses */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg flex items-center gap-1.5"><Users size={16} /> Split with roommates</h2>
        <button onClick={() => setShowAddSplit(true)} className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-xl" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Plus size={14} /> Add</button>
      </div>
      {Object.keys(balances).length === 0 ? (
        <p className="text-sm" style={{ color: "#5B6470" }}>Log a shared cost — utilities, groceries, an Uber — and keep track of who owes who.</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(balances).map(([person, bal]) => (
            <div key={person} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
              <span className="text-sm font-medium">{person}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace", color: bal >= 0 ? "#1F7A5C" : "#B4432F" }}>
                  {bal >= 0 ? `owes you ${fmtMoney(bal)}` : `you owe ${fmtMoney(bal)}`}
                </span>
                <button onClick={() => setSplits((prev) => prev.map((s) => (s.person === person ? { ...s, settled: true } : s)))} className="text-xs px-2 py-1 rounded-xl" style={{ border: "1px solid #D8DBCF", color: "#5B6470" }}>Settle</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showAddSplit && (
        <Modal title="Add split expense" onClose={() => setShowAddSplit(false)}>
          <AddSplitForm onSave={(s) => { setSplits((p) => [...p, s]); setShowAddSplit(false); }} />
        </Modal>
      )}
    </div>
  );
}

function SemesterSetupModal({ semester, onClose, onSave, onClear }) {
  const [total, setTotal] = useState(semester ? String(semester.total) : "");
  const [startDate, setStartDate] = useState(semester ? semester.startDate : new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(semester ? semester.endDate : "");
  return (
    <Modal title="Semester funds" onClose={onClose}>
      <Field label="Total funds for the semester"><input autoFocus type="number" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="e.g. 2500" className="w-full px-3 py-2 rounded-xl" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} /></Field>
      <div className="flex gap-3">
        <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
        <Field label="End date"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      </div>
      <button disabled={!total || parseFloat(total) <= 0 || !endDate} onClick={() => onSave({ total: parseFloat(total), startDate, endDate })} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40 mb-2" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Save</button>
      {semester && <button onClick={onClear} className="w-full py-2 rounded-xl text-sm" style={{ color: "#B4432F" }}>Remove semester tracking</button>}
    </Modal>
  );
}
function AddSubForm({ onSave }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [renewsOn, setRenewsOn] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div>
      <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spotify" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Amount"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-xl" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} /></Field>
      <Field label="Bills">
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </Field>
      <Field label="Next renewal date"><input type="date" value={renewsOn} onChange={(e) => setRenewsOn(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <button disabled={!name.trim() || !amount || parseFloat(amount) <= 0} onClick={() => onSave({ id: uid(), name: name.trim(), amount: parseFloat(amount), cadence, renewsOn })} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Add subscription</button>
    </div>
  );
}
function AddSplitForm({ onSave }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [person, setPerson] = useState("");
  const [iOwe, setIOwe] = useState(false);
  return (
    <div>
      <Field label="What was it"><input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Electric bill" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Their share"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-xl" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} /></Field>
      <Field label="Roommate's name"><input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="e.g. Jordan" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setIOwe(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ background: !iOwe ? "#3B4B6B" : "white", color: !iOwe ? "white" : "#1B2430", border: "1px solid #D8DBCF" }}>They owe me</button>
        <button onClick={() => setIOwe(true)} className="flex-1 py-2 rounded-xl text-sm" style={{ background: iOwe ? "#3B4B6B" : "white", color: iOwe ? "white" : "#1B2430", border: "1px solid #D8DBCF" }}>I owe them</button>
      </div>
      <button disabled={!description.trim() || !amount || parseFloat(amount) <= 0 || !person.trim()} onClick={() => onSave({ id: uid(), description: description.trim(), amount: parseFloat(amount), person: person.trim(), iOwe, settled: false, date: new Date().toISOString() })} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Save</button>
    </div>
  );
}
function AddTxModal({ category, onClose, onAdd }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!category) return null;
  return (
    <Modal title={`Add to ${category.name}`} onClose={onClose}>
      <Field label="Amount"><input autoFocus type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-xl text-lg" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} /></Field>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lunch" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <button disabled={!amount || parseFloat(amount) <= 0} onClick={() => onAdd(parseFloat(amount), note)} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Log expense</button>
    </Modal>
  );
}
function AddCategoryModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [disc, setDisc] = useState(true);
  return (
    <Modal title="New category" onClose={onClose}>
      <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscriptions" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <Field label="Weekly limit"><input type="number" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-xl" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} /></Field>
      <label className="flex items-center gap-2 mb-4 text-sm"><input type="checkbox" checked={disc} onChange={(e) => setDisc(e.target.checked)} /> Count as discretionary</label>
      <button disabled={!name.trim() || !limit || parseFloat(limit) <= 0} onClick={() => onAdd(name.trim(), parseFloat(limit), disc)} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Create category</button>
    </Modal>
  );
}

// ---------------- Map ----------------
function MapTab({ pins, setPins }) {
  const [addMode, setAddMode] = useState(false);
  const [pending, setPending] = useState(null);
  const svgRef = useRef(null);

  function handleClick(e) {
    if (!addMode) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPending({ x, y });
    setAddMode(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg">Campus map</h2>
        <button onClick={() => setAddMode((v) => !v)} className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-xl" style={{ background: addMode ? "#C77D2D" : "#3B4B6B", color: "white" }}>
          <Plus size={14} /> {addMode ? "Tap the map…" : "Pin"}
        </button>
      </div>

      <svg ref={svgRef} viewBox="0 0 100 63.6" onClick={handleClick} className="w-full rounded-xl" style={{ background: "#E3E6DA", cursor: addMode ? "crosshair" : "default", border: "1px solid #D8DBCF" }}>
        {/* schematic quad paths */}
        <rect x="20" y="14" width="60" height="36" fill="#EEF0E6" stroke="#C3C7B8" strokeWidth="0.4" />
        <line x1="20" y1="32" x2="80" y2="32" stroke="#C3C7B8" strokeWidth="0.4" />
        <line x1="50" y1="14" x2="50" y2="50" stroke="#C3C7B8" strokeWidth="0.4" />
        {pins.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y * 0.636} r="1.6" fill="#3B4B6B" stroke="white" strokeWidth="0.4" />
            <text x={p.x} y={p.y * 0.636 - 2.5} fontSize="3" textAnchor="middle" fill="#1B2430" fontFamily="Inter, sans-serif">{p.name}</text>
          </g>
        ))}
      </svg>
      <p className="text-xs mt-2" style={{ color: "#5B6470" }}>Tap "Pin" then tap the map to mark a building. Walk-time warnings on your schedule use these pins.</p>

      <div className="mt-4 space-y-2">
        {pins.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
            <span className="flex items-center gap-1.5 text-sm"><PinIcon size={13} color="#3B4B6B" /> {p.name}</span>
            <button onClick={() => setPins((prev) => prev.filter((x) => x.id !== p.id))}><Trash2 size={14} color="#B0B4A6" /></button>
          </div>
        ))}
      </div>

      {pending && (
        <Modal title="Name this pin" onClose={() => setPending(null)}>
          <NamePinForm onSave={(name) => { setPins((prev) => [...prev, { id: uid(), name, x: pending.x, y: pending.y }]); setPending(null); }} />
        </Modal>
      )}
    </div>
  );
}
function NamePinForm({ onSave }) {
  const [name, setName] = useState("");
  return (
    <div>
      <Field label="Building or spot name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Science Hall" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <button disabled={!name.trim()} onClick={() => onSave(name.trim())} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Save pin</button>
    </div>
  );
}

// ---------------- Events ----------------
function EventsTab({ events, setEvents, pins }) {
  const [showAdd, setShowAdd] = useState(false);
  const upcoming = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }} className="text-lg">Events</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-xl" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Plus size={14} /> Event</button>
      </div>
      {upcoming.length === 0 && <p className="text-sm" style={{ color: "#5B6470" }}>No events yet.</p>}
      <div className="space-y-2">
        {upcoming.map((e) => (
          <div key={e.id} className="rounded-xl p-3.5 flex items-start justify-between" style={{ background: "#FBFBF6", border: "1px solid #D8DBCF", boxShadow: "0 1px 2px rgba(27,36,48,0.04), 0 4px 14px -4px rgba(27,36,48,0.08)" }}>
            <div>
              <p style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>{e.title}</p>
              <p className="text-sm" style={{ color: "#5B6470" }}>{new Date(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{e.time ? ` · ${fmtTime(e.time)}` : ""}{e.location ? ` · ${e.location}` : ""}</p>
              {e.note && <p className="text-xs mt-1" style={{ color: "#5B6470" }}>{e.note}</p>}
            </div>
            <button onClick={() => setEvents((prev) => prev.filter((x) => x.id !== e.id))}><Trash2 size={14} color="#B0B4A6" /></button>
          </div>
        ))}
      </div>
      {showAdd && <AddEventModal pins={pins} onClose={() => setShowAdd(false)} onAdd={(ev) => { setEvents((p) => [...p, ev]); setShowAdd(false); }} />}
    </div>
  );
}
function AddEventModal({ pins, onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [pinId, setPinId] = useState("");
  const [note, setNote] = useState("");
  const pin = pins.find((p) => p.id === pinId);
  return (
    <Modal title="Add event" onClose={onClose}>
      <Field label="Title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall Formal" className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <div className="flex gap-3">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
        <Field label="Time (optional)"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      </div>
      <Field label="Location (optional)">
        <select value={pinId} onChange={(e) => setPinId(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle}>
          <option value="">No location set</option>
          {pins.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 rounded-xl" style={inputStyle} /></Field>
      <button disabled={!title.trim()} onClick={() => onAdd({ id: uid(), title: title.trim(), date, time, pinId: pinId || null, location: pin ? pin.name : "", note })} className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: "#3B4B6B", color: "white", boxShadow: "0 2px 6px -1px rgba(59,75,107,0.4)" }}><Check size={15} /> Add event</button>
    </Modal>
  );
}
