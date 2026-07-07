"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Network, Inbox, Star, Plus, Trash2, Check, ChevronRight,
  ListChecks, GitBranch, RotateCcw, Search, Sun, CornerDownRight, X,
  ZoomIn, ZoomOut, Crosshair, Repeat, Calendar, Flag, Clock, Bell, StickyNote, HelpCircle, Archive, Eye, AlertTriangle,
  LogOut, UserPlus, Palette, KeyRound, Eraser, UserX, ChevronDown,
} from "lucide-react";
import { syncItems, signOut, inviteToBoard, updateTheme, requestPasswordReset, wipeAccount, deleteAccount } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

const uid = () => crypto.randomUUID();
const NW = 168, NH = 50, XG = 232, YG = 78;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtLabel = (d) => { if (!d) return ""; const p = d.split("-"); return `${MO[(+p[1])-1]} ${+p[2]}`; };
const fmtD = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
const to24 = (h, m, mer) => { let H = +h; const M = m ? +m : 0; if (mer) { const p = mer[0].toLowerCase(); if (p === "p" && H < 12) H += 12; if (p === "a" && H === 12) H = 0; } H = clamp(H, 0, 23); return `${String(H).padStart(2,"0")}:${String(clamp(M,0,59)).padStart(2,"0")}`; };
const fmtTime = (hhmm) => { if (!hhmm) return ""; const [h, m] = hhmm.split(":").map(Number); const mer = h >= 12 ? "pm" : "am"; let hh = h % 12; if (hh === 0) hh = 12; return m ? `${hh}:${String(m).padStart(2,"0")}${mer}` : `${hh}${mer}`; };
const DAYS = { sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,weds:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6 };
const PRI = { 1: "High", 2: "Medium", 3: "Low" };
const PRI_COLOR = { 1: "text-red-500", 2: "text-amber-500", 3: "text-sky-500" };
const REPEAT_OPTS = [["none","Does not repeat"],["daily","Daily"],["weekdays","Weekdays"],["weekly","Weekly"],["monthly","Monthly"]];
const repeatLabel = (t) => ({ daily:"daily", weekdays:"weekdays", weekly:"weekly", monthly:"monthly", everyN:`every ${t.repeatN||2}d` }[t.repeat] || "");

function nextDue(due, repeat, n, today) {
  const base = due && due >= today ? due : today;
  const [y, mo, da] = base.split("-").map(Number); const d = new Date(y, mo - 1, da);
  if (repeat === "weekdays") { do { d.setDate(d.getDate()+1); } while ([0,6].includes(d.getDay())); }
  else if (repeat === "weekly") d.setDate(d.getDate()+7);
  else if (repeat === "monthly") d.setMonth(d.getMonth()+1);
  else if (repeat === "everyN") d.setDate(d.getDate()+(n||2));
  else d.setDate(d.getDate()+1);
  return fmtD(d);
}
function parseDateToken(low, base) {
  if (low === "today" || low === "tod") return fmtD(base);
  if (["tomorrow","tom","tmr"].includes(low)) { const d = new Date(base); d.setDate(d.getDate()+1); return fmtD(d); }
  if (low in DAYS) { const d = new Date(base); const add = (DAYS[low] - d.getDay() + 7) % 7; d.setDate(d.getDate()+add); return fmtD(d); }
  return "";
}
function parseTags(text) {
  let desc = ""; const cm = text.match(/"([^"]*)"|“([^”]*)”/); if (cm) { desc = cm[1] || cm[2] || ""; text = text.replace(cm[0], " "); }
  const tags = [], assignees = [], keep = [];
  for (const tk of text.trim().split(/\s+/)) {
    if (!tk) continue;
    if (tk[0] === "#" && tk.length > 1) { tags.push(tk.slice(1)); continue; }
    if (tk[0] === "@" && tk.length > 1) { assignees.push(tk.slice(1)); continue; }
    keep.push(tk);
  }
  return { text: keep.join(" "), tags, assignees, desc };
}
function parseQuick(text) {
  let desc = ""; const cm = text.match(/"([^"]*)"|“([^”]*)”/); if (cm) { desc = cm[1] || cm[2] || ""; text = text.replace(cm[0], " "); }
  const base = new Date(); let due = "", time = "", priority = 0, lastTime = null; const tags = [], assignees = [], keep = [];
  for (const tk of text.trim().split(/\s+/)) {
    if (!tk) continue;
    if (/^!{1,3}$/.test(tk)) { priority = tk.length; continue; }
    if (/^p[1-3]$/i.test(tk)) { priority = +tk[1]; continue; }
    if (tk[0] === "#" && tk.length > 1) { tags.push(tk.slice(1)); continue; }
    if (tk[0] === "@" && tk.length > 1) { assignees.push(tk.slice(1)); continue; }
    let m = tk.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/i);
    if (m) { time = to24(m[1], m[2], m[3]); lastTime = null; continue; }
    m = tk.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { time = to24(m[1], m[2], null); lastTime = [m[1], m[2]]; continue; }
    if (/^(am|pm)$/i.test(tk) && lastTime) { time = to24(lastTime[0], lastTime[1], tk); lastTime = null; continue; }
    const d = parseDateToken(tk.toLowerCase(), base); if (d) { due = d; continue; }
    keep.push(tk);
  }
  return { name: keep.join(" "), due, time, priority, tags, assignees, desc };
}
export default function Hypersymmetry({ initialItems, email, username, bgColor, panelColor, boardId, boards, members }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems || []);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountView, setAccountView] = useState("menu");
  const [bg, setBg] = useState(bgColor || "#000000");
  const [panel, setPanel] = useState(panelColor || "#ffffff");
  const [bgDraft, setBgDraft] = useState(bgColor || "#000000");
  const [panelDraft, setPanelDraft] = useState(panelColor || "#ffffff");
  const [themeMsg, setThemeMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [wipeMsg, setWipeMsg] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState("home");
  const [homeMode, setHomeMode] = useState("today");
  const [groupBy, setGroupBy] = useState("none");
  const [capture, setCapture] = useState("");
  const [quick, setQuick] = useState("");
  const [newIdea, setNewIdea] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [sel, setSel] = useState(null);
  const [cv, setCv] = useState({ tx: 60, ty: 80, scale: 1 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [focus, setFocus] = useState(null);
  const [descOpen, setDescOpen] = useState({});
  const [repeatMenu, setRepeatMenu] = useState(null);
  const [tagDraft, setTagDraft] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [warn, setWarn] = useState("");
  const [notif, setNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [, setTick] = useState(0);
  const loaded = useRef(false);
  const pan = useRef(false);
  const moved = useRef(false);
  const inputs = useRef({});
  const quickRef = useRef(null);
  const ideaRef = useRef(null);
  const warnTimer = useRef();
  const saveTimer = useRef();
  const lastSynced = useRef(initialItems || []);
  const selRef = useRef(sel);
  const viewRef = useRef(view);
  const past = useRef([]);
  const future = useRef([]);
  const itemsRef = useRef([]);
  const notified = useRef(new Set());

  const now = new Date();
  const todayStr = fmtD(now);
  const nowHM = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  useEffect(() => { loaded.current = true; }, []);
  useEffect(() => {
    if (!loaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const prevById = new Map(lastSynced.current.map((i) => [i.id, i]));
      const nextIds = new Set(items.map((i) => i.id));
      const upserts = items.filter((i) => JSON.stringify(prevById.get(i.id)) !== JSON.stringify(i));
      const deleteIds = lastSynced.current.filter((i) => !nextIds.has(i.id)).map((i) => i.id);
      if (upserts.length || deleteIds.length) {
        syncItems(boardId, upserts, deleteIds)
          .then(() => { lastSynced.current = items; })
          .catch(() => {});
      } else {
        lastSynced.current = items;
      }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [items, boardId]);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`board:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `board_id=eq.${boardId}` }, (payload) => {
        setItems((prev) => {
          if (payload.eventType === "DELETE") {
            const deadId = payload.old.id;
            lastSynced.current = lastSynced.current.filter((i) => i.id !== deadId);
            return prev.filter((i) => i.id !== deadId);
          }
          const row = payload.new;
          const incoming = { id: row.id, type: row.type, parentId: row.parent_id, ...(row.fields || {}) };
          const idx = prev.findIndex((i) => i.id === incoming.id);
          lastSynced.current = idx === -1
            ? [...lastSynced.current, incoming]
            : lastSynced.current.map((i) => (i.id === incoming.id ? incoming : i));
          return idx === -1 ? [...prev, incoming] : prev.map((i, ix) => (ix === idx ? incoming : i));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [boardId]);
  useEffect(() => { if (focus && inputs.current[focus]) { const el = inputs.current[focus]; el.focus(); try { const v = el.value.length; el.setSelectionRange(v, v); } catch {} setFocus(null); } }, [focus, items]);

  useEffect(() => {
    const onKey = (e) => {
      const ae = document.activeElement; const typing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
      const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
      if (mod) {
        if (k === "z") { if (typing) return; e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
        else if (k === "y") { if (typing) return; e.preventDefault(); doRedo(); }
        return;
      }
      if (typing) return;
      if (k === "n") { e.preventDefault(); setView("home"); setTimeout(() => quickRef.current && quickRef.current.focus(), 0); return; }
      if (k === "i") { e.preventDefault(); setView("inbox"); setTimeout(() => ideaRef.current && ideaRef.current.focus(), 0); return; }
      if (viewRef.current !== "plan" || !selRef.current) return;
      const list = itemsRef.current || []; const node = list.find((x) => x.id === selRef.current); if (!node) return;
      const goalsU = (pid) => list.filter((x) => x.type === "goal" && x.parentId === pid);
      const tasksU = (gid) => list.filter((x) => x.type === "task" && x.parentId === gid);
      const kids = (node.type === "goal" || node.type === "idea") ? goalsU(node.id) : [];
      if (k === "arrowleft") { e.preventDefault(); if (node.parentId) setSel(node.parentId); return; }
      if (k === "arrowright") { e.preventDefault(); if (kids.length) { setCollapsed((c) => ({ ...c, [node.id]: false })); setSel(kids[0].id); } return; }
      if (k === "arrowup" || k === "arrowdown") {
        e.preventDefault();
        const sibs = node.parentId == null ? [...list.filter((x) => x.type === "idea" && x.starred && x.onCanvas), ...list.filter((x) => x.type === "goal" && x.parentId == null)] : goalsU(node.parentId);
        const idx = sibs.findIndex((x) => x.id === node.id); const nx = sibs[idx + (k === "arrowdown" ? 1 : -1)]; if (nx) setSel(nx.id); return;
      }
      if (k === "s") { e.preventDefault(); if (node.type === "idea") addGoal(node.id); else if (node.type === "goal") { if (tasksU(node.id).length) flash("This goal has a checklist — it can't also hold sub-goals."); else addGoal(node.id); } return; }
      if (k === "c") { e.preventDefault(); if (node.type === "goal") { if (goalsU(node.id).length) flash("This goal has sub-goals — it can't also have a checklist."); else addTask(node.id); } return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setTick((t) => t + 1);
      const d = new Date(); const ds = fmtD(d); const hm = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      for (const it of (itemsRef.current || [])) {
        if (it.type === "task" && it.time && it.due === ds && !it.done && it.name) {
          const k = it.id + ds;
          if (it.time <= hm && !notified.current.has(k)) {
            notified.current.add(k);
            if (typeof Notification !== "undefined" && Notification.permission === "granted") { try { new Notification(it.name, { body: "Due now" }); } catch {} }
          }
        }
      }
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  itemsRef.current = items; selRef.current = sel; viewRef.current = view;

  const all = items;
  const goalsUnder = (pid) => all.filter((i) => i.type === "goal" && i.parentId === pid);
  const tasksUnder = (gid) => all.filter((i) => i.type === "task" && i.parentId === gid);
  const subsUnder = (tid) => all.filter((i) => i.type === "subtask" && i.parentId === tid);
  const ideas = all.filter((i) => i.type === "idea");
  const rootGoals = all.filter((i) => i.type === "goal" && i.parentId == null);
  const allTasks = all.filter((i) => i.type === "task");

  const taskDone = (t) => { const s = subsUnder(t.id); return s.length ? s.every((x) => x.done) : !!t.done; };
  const taskFrac = (t) => { const s = subsUnder(t.id); return s.length ? s.filter((x) => x.done).length / s.length : t.done ? 1 : 0; };
  const progress = (n) => {
    if (n.type === "idea") { const g = goalsUnder(n.id); return g.length ? g.reduce((a, x) => a + progress(x), 0) / g.length : 0; }
    if (n.type === "goal") { const cg = goalsUnder(n.id); if (cg.length) return cg.reduce((a, x) => a + progress(x), 0) / cg.length; const ts = tasksUnder(n.id); if (ts.length) return ts.reduce((a, t) => a + taskFrac(t), 0) / ts.length; return 0; }
    return 0;
  };
  const pct = (n) => Math.round(progress(n) * 100);
  const goalKind = (g) => goalsUnder(g.id).length ? "branch" : tasksUnder(g.id).length ? "leaf" : "open";
  const overdue = (t) => { if (taskDone(t) || !t.due) return false; if (t.due < todayStr) return true; if (t.due === todayStr && t.time) return t.time < nowHM; return false; };

  // history-aware mutators
  const apply = (updater) => setItems((prev) => { past.current.push(prev); future.current = []; if (past.current.length > 200) past.current.shift(); return updater(prev); });
  const edit = (id, f) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...f } : i)));
  const update = (id, f) => apply((prev) => prev.map((i) => (i.id === id ? { ...i, ...f } : i)));
  const toggle = (id, k) => apply((prev) => prev.map((i) => (i.id === id ? { ...i, [k]: !i[k] } : i)));
  const doUndo = () => setItems((prev) => { if (!past.current.length) return prev; future.current.push(prev); return past.current.pop(); });
  const doRedo = () => setItems((prev) => { if (!future.current.length) return prev; past.current.push(prev); return future.current.pop(); });

  const checkTask = (t) => {
    if (t.repeat && t.repeat !== "none" && !subsUnder(t.id).length) { update(t.id, { due: nextDue(t.due, t.repeat, t.repeatN, todayStr), done: false }); return; }
    update(t.id, { done: !t.done });
  };
  const toggleSub = (s) => apply((prev) => {
    const np = prev.map((i) => (i.id === s.id ? { ...i, done: !i.done } : i));
    const sibs = np.filter((i) => i.type === "subtask" && i.parentId === s.parentId);
    const parent = np.find((i) => i.id === s.parentId);
    if (sibs.length && sibs.every((x) => x.done) && parent && parent.repeat && parent.repeat !== "none") {
      const nd = nextDue(parent.due, parent.repeat, parent.repeatN, todayStr);
      return np.map((i) => i.id === parent.id ? { ...i, due: nd } : (i.type === "subtask" && i.parentId === parent.id ? { ...i, done: false } : i));
    }
    return np;
  });
  const remove = (id) => apply((prev) => { const kill = new Set([id]); let chg = true; while (chg) { chg = false; for (const it of prev) if (it.parentId && kill.has(it.parentId) && !kill.has(it.id)) { kill.add(it.id); chg = true; } } return prev.filter((i) => !kill.has(i.id)); });
  const addIdea = (text, starred = false) => { const raw = text.trim(); if (!raw) return; const r = parseTags(raw); apply((p) => [...p, { id: uid(), type: "idea", text: r.text || raw, starred, onCanvas: false, tags: r.tags, assignees: r.assignees, desc: r.desc }]); };
  const addGoal = (parentId) => { const id = uid(); apply((p) => [...p, { id, type: "goal", parentId: parentId ?? null, name: "", timeframe: "" }]); setSel(id); };
  const addTask = (goalId) => { const id = uid(); apply((p) => [...p, { id, type: "task", parentId: goalId, name: "", today: false, done: false }]); setFocus(id); };
  const addSub = (taskId) => { const id = uid(); apply((p) => [...p, { id, type: "subtask", parentId: taskId, name: "", done: false }]); setFocus(id); };
  const addIdeaAfter = (i) => { const id = uid(); apply((p) => { const idx = p.findIndex((x) => x.id === i.id); return [...p.slice(0, idx + 1), { id, type: "idea", text: "", starred: false, onCanvas: false, tags: [], assignees: [] }, ...p.slice(idx + 1)]; }); setFocus(id); };
  const submitQuick = () => { const r = parseQuick(quick); const name = r.name || quick.trim(); if (!name) return; const id = uid(); apply((p) => [...p, { id, type: "task", parentId: null, name, today: true, done: false, due: r.due, time: r.time, priority: r.priority, tags: r.tags, assignees: r.assignees, desc: r.desc }]); setQuick(""); if (r.desc) setDescOpen((o) => ({ ...o, [id]: true })); setFocus(id); };
  const setRepeat = (t, v) => { update(t.id, { repeat: v, due: v !== "none" && !t.due ? todayStr : t.due }); setRepeatMenu(null); };

  const addTaskAfter = (t) => { const id = uid(); const loose = t.parentId == null; apply((p) => { const idx = p.findIndex((i) => i.id === t.id); let j = idx + 1; while (j < p.length && p[j].type === "subtask" && p[j].parentId === t.id) j++; const nt = { id, type: "task", parentId: t.parentId ?? null, name: "", today: loose ? homeMode === "today" : false, done: false, priority: 0, tags: loose ? (t.tags || []) : [] }; return [...p.slice(0, j), nt, ...p.slice(j)]; }); setFocus(id); };
  const addSubAfter = (s) => { const id = uid(); apply((p) => { const idx = p.findIndex((i) => i.id === s.id); return [...p.slice(0, idx + 1), { id, type: "subtask", parentId: s.parentId, name: "", done: false }, ...p.slice(idx + 1)]; }); setFocus(id); };
  const indentTask = (t, tops) => { if (subsUnder(t.id).length) return; const i = tops.indexOf(t.id); if (i <= 0) return; const prevId = tops[i - 1]; apply((p) => { const without = p.filter((x) => x.id !== t.id); const conv = { ...t, type: "subtask", parentId: prevId }; const idx = without.findIndex((x) => x.id === prevId); let j = idx + 1; while (j < without.length && without[j].type === "subtask" && without[j].parentId === prevId) j++; return [...without.slice(0, j), conv, ...without.slice(j)]; }); setFocus(t.id); };
  const outdentSub = (s) => { apply((p) => { const parent = p.find((i) => i.id === s.parentId); if (!parent) return p; const without = p.filter((x) => x.id !== s.id); const conv = { id: s.id, type: "task", parentId: null, name: s.name, today: homeMode === "today", done: s.done, priority: 0, tags: [] }; const idx = without.findIndex((x) => x.id === parent.id); let j = idx + 1; while (j < without.length && without[j].type === "subtask" && without[j].parentId === parent.id) j++; return [...without.slice(0, j), conv, ...without.slice(j)]; }); setFocus(s.id); };
  const nav = (dir, id, fields) => { const i = fields.indexOf(id); const n = fields[i + dir]; if (n) setFocus(n); };
  const backspaceEmpty = (id, fields) => { const i = fields.indexOf(id); const prev = i > 0 ? fields[i - 1] : null; remove(id); if (prev) setFocus(prev); };
  const toggleDesc = (id) => setDescOpen((o) => ({ ...o, [id]: !o[id] }));
  const flash = (m) => { setWarn(m); clearTimeout(warnTimer.current); warnTimer.current = setTimeout(() => setWarn(""), 2500); };
  const doInvite = () => {
    const name = inviteName.trim();
    if (!name) return;
    inviteToBoard(boardId, name)
      .then((res) => {
        if (res.ok) { setInviteName(""); setInviteMsg("Invited!"); router.refresh(); }
        else setInviteMsg(res.error);
      })
      .catch(() => setInviteMsg("Couldn't invite that user."));
  };
  const closeAccountMenu = () => { setAccountOpen(false); setAccountView("menu"); setThemeMsg(""); setPwMsg(""); setWipeMsg(""); setDeleteConfirmText(""); };
  const openCustomize = () => { setBgDraft(bg); setPanelDraft(panel); setThemeMsg(""); setAccountView("customize"); };
  const previewTheme = (nextBg, nextPanel) => { setBgDraft(nextBg); setPanelDraft(nextPanel); setBg(nextBg); setPanel(nextPanel); };
  const cancelCustomize = () => { setBg(bgColor || "#000000"); setPanel(panelColor || "#ffffff"); setAccountView("menu"); };
  const saveTheme = () => {
    updateTheme(bgDraft, panelDraft)
      .then((res) => { if (res.ok) { setThemeMsg("Saved."); } else setThemeMsg(res.error); })
      .catch(() => setThemeMsg("Couldn't save theme."));
  };
  const doRequestPasswordReset = () => {
    requestPasswordReset(window.location.origin)
      .then(() => setPwMsg("Check your email for a reset link."))
      .catch(() => setPwMsg("Couldn't send reset email."));
  };
  const doWipeAccount = () => {
    wipeAccount()
      .then(() => {
        setWipeMsg("Done — your boards are cleared.");
        // router.refresh() alone doesn't remount this client component (same
        // class of stale-state issue as switching boards), and an optimistic
        // local setItems([]) would be wrong if the user is currently viewing
        // a board they don't own (wipe only touches boards they DO own) — so
        // force a full reload rather than guess.
        setTimeout(() => window.location.reload(), 700);
      })
      .catch(() => setWipeMsg("Couldn't wipe your data."));
  };
  const doDeleteAccount = () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    deleteAccount().catch(() => setDeleting(false));
  };

  const q = query.trim().toLowerCase();
  const matches = (n) => { if (!q) return true; if ((n.name || n.text || "").toLowerCase().includes(q)) return true; if (n.type === "idea") return goalsUnder(n.id).some(matches); if (n.type === "goal") return goalsUnder(n.id).some(matches) || tasksUnder(n.id).some((t) => (t.name || "").toLowerCase().includes(q)); return false; };
  const pathOf = (taskId) => { const out = []; let cur = all.find((i) => i.id === taskId); cur = cur && cur.parentId ? all.find((i) => i.id === cur.parentId) : null; while (cur) { out.unshift(cur.name || cur.text || "untitled"); cur = cur.parentId ? all.find((i) => i.id === cur.parentId) : null; } return out; };

  const canvasKids = (n) => (n.type === "idea" || n.type === "goal") ? goalsUnder(n.id).filter(matches) : [];
  const roots = [...ideas.filter((i) => i.starred && i.onCanvas && matches(i)), ...rootGoals.filter(matches)];
  const pos = {}; let leafY = 0;
  const place = (n, depth) => { const kids = collapsed[n.id] ? [] : canvasKids(n); let y; if (!kids.length) { y = leafY * YG; leafY++; } else { const ys = kids.map((k) => place(k, depth + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; } pos[n.id] = { x: depth * XG, y }; return y; };
  roots.forEach((r) => { place(r, 0); leafY += 0.6; });
  const innerW = Math.max(0, ...Object.values(pos).map((p) => p.x)) + NW + 80;
  const innerH = Math.max(0, ...Object.values(pos).map((p) => p.y)) + NH + 80;
  const edges = [];
  Object.keys(pos).forEach((id) => { const n = all.find((i) => i.id === id); if (!n || collapsed[id]) return; canvasKids(n).forEach((k) => { if (pos[k.id]) edges.push([id, k.id]); }); });

  const inp = "bg-transparent outline-none focus:bg-stone-100 rounded px-1.5 py-0.5 transition-colors";
  const iconBtn = "text-stone-400 hover:text-stone-700 transition-colors";
  const chip = "inline-flex items-center gap-1 text-xs uppercase tracking-wide px-1.5 py-0.5 rounded font-medium";
  const stop = { onPointerDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation() };
  const reg = (id) => (el) => { if (el) inputs.current[id] = el; else delete inputs.current[id]; };
  const noteArea = "w-full text-sm bg-stone-50 rounded-lg p-2 outline-none focus:ring-1 focus:ring-stone-300 text-stone-700 resize-none";
  const tagPills = (it) => (<>
    {(it.tags || []).map((tg) => <button key={"t" + tg} onClick={() => update(it.id, { tags: (it.tags || []).filter((x) => x !== tg) })} className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 hover:bg-stone-200">#{tg}</button>)}
    {(it.assignees || []).map((a) => <button key={"a" + a} onClick={() => update(it.id, { assignees: (it.assignees || []).filter((x) => x !== a) })} className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 hover:bg-sky-200">@{a}</button>)}
  </>);
  const tagEditor = (n) => (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-stone-400 mb-1">tags & people</div>
      <div className="flex flex-wrap gap-1 mb-1">{tagPills(n)}{!(n.tags || []).length && !(n.assignees || []).length && <span className="text-xs text-stone-300">none yet</span>}</div>
      <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const r = parseTags(tagDraft); update(n.id, { tags: Array.from(new Set([...(n.tags || []), ...r.tags])), assignees: Array.from(new Set([...(n.assignees || []), ...r.assignees])) }); setTagDraft(""); } }} placeholder="#tag or @person — enter to add" className="w-full text-sm bg-stone-50 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-stone-300" />
    </div>
  );

  const sortTasks = (a, b) => { const dn = (taskDone(a) ? 1 : 0) - (taskDone(b) ? 1 : 0); if (dn) return dn; const pa = a.priority || 9, pb = b.priority || 9; if (pa !== pb) return pa - pb; return (a.due || "9999") < (b.due || "9999") ? -1 : 1; };
  const visibleTasks = allTasks.filter((t) => showArchived || !t.archived);
  const baseTasks = (homeMode === "today" ? visibleTasks.filter((t) => t.today || (t.repeat && t.repeat !== "none")) : visibleTasks);
  let groups = [];
  if (groupBy === "none") groups = [{ label: null, tasks: baseTasks.slice().sort(sortTasks) }];
  else if (groupBy === "priority") groups = [1, 2, 3, 0].map((lv) => ({ label: lv ? PRI[lv] : "No priority", tasks: baseTasks.filter((t) => (t.priority || 0) === lv).sort(sortTasks) })).filter((g) => g.tasks.length);
  else if (groupBy === "due") { const b = { Overdue: [], Today: [], Upcoming: [], "No date": [] }; baseTasks.forEach((t) => { if (!t.due) b["No date"].push(t); else if (overdue(t)) b.Overdue.push(t); else if (t.due === todayStr) b.Today.push(t); else b.Upcoming.push(t); }); groups = Object.entries(b).map(([label, tasks]) => ({ label, tasks: tasks.sort(sortTasks) })).filter((g) => g.tasks.length); }
  else if (groupBy === "category") { const m = {}; baseTasks.forEach((t) => { const c = (t.tags && t.tags[0]) ? "#" + t.tags[0] : "No category"; (m[c] = m[c] || []).push(t); }); groups = Object.entries(m).map(([label, tasks]) => ({ label, tasks: tasks.sort(sortTasks) })); }
  const homeFields = [], homeTops = [];
  groups.forEach((g) => g.tasks.forEach((t) => { homeTops.push(t.id); homeFields.push(t.id); subsUnder(t.id).forEach((s) => homeFields.push(s.id)); }));

  function renderTaskRow(t, ctx) {
    const { showPath = false, fields = [], tops = [] } = ctx || {};
    const subs = subsUnder(t.id); const done = taskDone(t); const over = overdue(t); const path = showPath ? pathOf(t.id) : [];
    const lv = t.priority || 0;
    const onTaskKey = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!subs.length) checkTask(t); return; }
      if (e.key === "Enter") { e.preventDefault(); addTaskAfter(t); return; }
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); indentTask(t, tops); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); nav(-1, t.id, fields); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); nav(1, t.id, fields); return; }
      if (e.key === "Escape") { e.target.blur(); return; }
      if (e.key === "Backspace" && t.name === "") { e.preventDefault(); backspaceEmpty(t.id, fields); return; }
    };
    const onSubKey = (e, s) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSub(s); return; }
      if (e.key === "Enter") { e.preventDefault(); addSubAfter(s); return; }
      if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); outdentSub(s); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); nav(-1, s.id, fields); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); nav(1, s.id, fields); return; }
      if (e.key === "Escape") { e.target.blur(); return; }
      if (e.key === "Backspace" && s.name === "") { e.preventDefault(); backspaceEmpty(s.id, fields); return; }
    };
    return (
      <div key={t.id} className={t.archived ? "opacity-60" : ""}>
        <div className="flex items-center gap-2 py-1.5 group">
          {subs.length ? <span className="text-xs tabular-nums text-stone-400 w-7 text-center shrink-0">{subs.filter((x) => x.done).length}/{subs.length}</span>
            : <button onClick={() => checkTask(t)} className="shrink-0"><span className={`flex items-center justify-center w-5 h-5 rounded-md border ${done ? "bg-teal-500 border-teal-500" : over ? "border-red-300" : "border-stone-300"}`}>{done && <Check size={13} className="text-white" />}</span></button>}
          <button title="priority" onClick={() => update(t.id, { priority: (lv + 1) % 4 })} className={`shrink-0 ${lv ? PRI_COLOR[lv] : "text-stone-300 hover:text-stone-500"}`}><Flag size={13} fill={lv ? "currentColor" : "none"} /></button>
          <div className="min-w-0 flex-1">
            <input ref={reg(t.id)} className={`${inp} w-full text-sm ${done ? "line-through text-stone-400" : over ? "text-red-600" : "text-stone-800"}`} value={t.name} placeholder="untitled task" onChange={(e) => edit(t.id, { name: e.target.value })} onKeyDown={onTaskKey} />
            {showPath && path.length > 0 && <div className="text-xs text-stone-400 truncate px-1.5">↑ {path.join(" › ")}</div>}
          </div>
          {tagPills(t)}
          <button title="notes" onClick={() => toggleDesc(t.id)} className={`shrink-0 ${t.desc ? "text-stone-600" : "opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700"}`}><StickyNote size={13} /></button>
          <span className="relative inline-flex items-center shrink-0 text-xs">
            {t.due ? <span className={over ? "text-red-500 font-medium" : "text-stone-500"}>{fmtLabel(t.due)}</span> : <Calendar size={14} className="text-stone-300 group-hover:text-stone-400" />}
            <input type="date" value={t.due || ""} onChange={(e) => update(t.id, { due: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
          </span>
          {t.due && <span className="relative inline-flex items-center shrink-0 text-xs">
            {t.time ? <span className={over ? "text-red-500 font-medium" : "text-stone-500"}>{fmtTime(t.time)}</span> : <Clock size={13} className="text-stone-300 group-hover:text-stone-400" />}
            <input type="time" value={t.time || ""} onChange={(e) => update(t.id, { time: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
          </span>}
          <span className="relative shrink-0">
            <button title="repeat" onClick={() => setRepeatMenu(repeatMenu === t.id ? null : t.id)} className={`flex items-center gap-0.5 ${t.repeat && t.repeat !== "none" ? "text-violet-500" : "text-stone-300 hover:text-stone-500"}`}><Repeat size={14} />{t.repeat && t.repeat !== "none" && <span className="text-xs">{repeatLabel(t)}</span>}</button>
            {repeatMenu === t.id && (
              <div className="absolute right-0 top-7 z-20 bg-white border border-stone-200 rounded-lg shadow-lg p-1 w-40 text-sm text-stone-700">
                {REPEAT_OPTS.map(([v, l]) => <button key={v} onClick={() => setRepeat(t, v)} className={`block w-full text-left px-2 py-1 rounded hover:bg-stone-100 ${(t.repeat || "none") === v ? "text-violet-600 font-medium" : ""}`}>{l}</button>)}
                <div className="flex items-center gap-1 px-2 py-1 border-t border-stone-100 mt-1">
                  <button onClick={() => setRepeat(t, "everyN")} className={`${t.repeat === "everyN" ? "text-violet-600 font-medium" : ""}`}>every</button>
                  <input type="number" min="1" value={t.repeatN || 2} onChange={(e) => update(t.id, { repeat: "everyN", repeatN: Math.max(1, +e.target.value || 1), due: t.due || todayStr })} className="w-12 border border-stone-300 rounded px-1 py-0.5" />
                  <span>days</span>
                </div>
              </div>
            )}
          </span>
          <button title="show on today" onClick={() => toggle(t.id, "today")} className={`shrink-0 ${t.today ? "text-amber-500" : "text-stone-300 hover:text-stone-500"}`}><Sun size={15} /></button>
          <button title="add subtask" onClick={() => addSub(t.id)} className={`${iconBtn} opacity-0 group-hover:opacity-100 shrink-0`}><Plus size={14} /></button>
          <button title={t.archived ? "unarchive" : "archive"} onClick={() => toggle(t.id, "archived")} className={`${iconBtn} shrink-0 ${t.archived ? "text-stone-600" : "opacity-0 group-hover:opacity-100"}`}><Archive size={13} /></button><button onClick={() => remove(t.id)} className={`${iconBtn} opacity-0 group-hover:opacity-100 shrink-0`}><Trash2 size={13} /></button>
        </div>
        {descOpen[t.id] && <div className="pl-9 pb-2"><textarea rows={2} className={noteArea} value={t.desc || ""} placeholder="notes, context, bullet points…" onChange={(e) => edit(t.id, { desc: e.target.value })} /></div>}
        {subs.map((s) => (
          <div key={s.id}>
            <div className="flex items-center gap-2 pl-9 py-0.5 group">
              <CornerDownRight size={12} className="text-stone-300 shrink-0" />
              <button onClick={() => toggleSub(s)} className="shrink-0"><span className={`flex items-center justify-center w-3.5 h-3.5 rounded border ${s.done ? "bg-teal-500 border-teal-500" : "border-stone-300"}`}>{s.done && <Check size={10} className="text-white" />}</span></button>
              <input ref={reg(s.id)} className={`${inp} flex-1 text-sm min-w-0 ${s.done ? "line-through text-stone-400" : ""}`} value={s.name} placeholder="subtask…" onChange={(e) => edit(s.id, { name: e.target.value })} onKeyDown={(e) => onSubKey(e, s)} />
              <button title="notes" onClick={() => toggleDesc(s.id)} className={`shrink-0 ${s.desc ? "text-stone-600" : "opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700"}`}><StickyNote size={12} /></button>
              <button onClick={() => remove(s.id)} className={`${iconBtn} opacity-0 group-hover:opacity-100`}><Trash2 size={11} /></button>
            </div>
            {descOpen[s.id] && <div className="pl-16 pb-2"><textarea rows={2} className={noteArea} value={s.desc || ""} placeholder="notes…" onChange={(e) => edit(s.id, { desc: e.target.value })} /></div>}
          </div>
        ))}
      </div>
    );
  }

  function renderNode(n) {
    const p = pos[n.id]; if (!p) return null;
    const isIdea = n.type === "idea"; const kind = isIdea ? "idea" : goalKind(n);
    const hasKids = canvasKids(n).length > 0; const ts = isIdea ? [] : tasksUnder(n.id); const doneN = ts.filter(taskDone).length;
    const selected = sel === n.id;
    return (
      <div key={n.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setSel(n.id); }} style={{ left: p.x, top: p.y, width: NW }}
        className={`absolute rounded-xl border bg-white px-3 py-2 cursor-pointer transition-shadow ${selected ? "border-teal-500 shadow-md" : "border-stone-200 hover:border-stone-300"}`}>
        <div className="flex items-center gap-1.5">
          <span className={`${chip} ${isIdea ? "bg-stone-100 text-stone-500" : "bg-violet-100 text-violet-700"}`}>{isIdea ? "idea" : <><GitBranch size={11} />goal</>}</span>
          {!isIdea && kind === "leaf" && <span className="text-xs text-teal-600 ml-auto">{doneN}/{ts.length}</span>}
        </div>
        <div className="text-sm text-stone-800 mt-1 truncate">{n.name || n.text || <span className="text-stone-300">untitled</span>}</div>
        {(isIdea ? goalsUnder(n.id).length > 0 : kind !== "open") && <div className="mt-1.5 h-1 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${pct(n)}%` }} /></div>}
        {hasKids && <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [n.id]: !c[n.id] })); }} className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-500 hover:text-stone-800">{collapsed[n.id] ? <Plus size={12} /> : <ChevronRight size={12} />}</button>}
      </div>
    );
  }

  function renderInspector() {
    const n = all.find((i) => i.id === sel); if (!n) return null;
    const isIdea = n.type === "idea"; const kind = isIdea ? null : goalKind(n);
    const cts = isIdea ? [] : tasksUnder(n.id); const cfields = []; cts.forEach((t) => { cfields.push(t.id); subsUnder(t.id).forEach((s) => cfields.push(s.id)); }); const ctops = cts.map((t) => t.id);
    return (
      <div {...stop} className="absolute top-3 right-3 bottom-3 w-72 max-w-full bg-white rounded-xl border border-stone-200 shadow-lg p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3"><span className={`${chip} ${isIdea ? "bg-stone-100 text-stone-500" : "bg-violet-100 text-violet-700"}`}>{isIdea ? "idea" : "goal"}</span><button onClick={() => setSel(null)} className={iconBtn}><X size={16} /></button></div>
        {isIdea ? (
          <>
            <textarea rows={2} className="w-full text-sm bg-stone-50 rounded-lg p-2 outline-none focus:ring-1 focus:ring-stone-300 mb-3 resize-none" value={n.text} onChange={(e) => edit(n.id, { text: e.target.value })} />
            <div className="text-xs uppercase tracking-wide text-stone-400 mb-1">goals</div>
            {goalsUnder(n.id).map((g) => <button key={g.id} onClick={() => setSel(g.id)} className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-stone-100 truncate">{g.name || "untitled goal"}</button>)}
            <button onClick={() => addGoal(n.id)} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 mt-1"><Plus size={14} />add goal</button>
            {tagEditor(n)}<button onClick={() => { update(n.id, { onCanvas: false }); setSel(null); }} className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mt-5"><X size={13} />remove from canvas</button>
          </>
        ) : (
          <>
            <input className="w-full text-base font-medium bg-stone-50 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-stone-300 mb-2" value={n.name} placeholder="name this goal…  #tag @person" onChange={(e) => edit(n.id, { name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { const r = parseTags(n.name); update(n.id, { name: r.text, tags: Array.from(new Set([...(n.tags || []), ...r.tags])), assignees: Array.from(new Set([...(n.assignees || []), ...r.assignees])) }); e.target.blur(); } }} />
            <input className="w-full text-sm text-stone-600 bg-stone-50 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-stone-300 mb-2" value={n.timeframe} placeholder="timeframe…" onChange={(e) => edit(n.id, { timeframe: e.target.value })} />
            <textarea rows={3} className="w-full text-sm bg-stone-50 rounded-lg p-2 outline-none focus:ring-1 focus:ring-stone-300 mb-3 resize-none text-stone-700" value={n.desc || ""} placeholder="description — context, notes, anything helpful…" onChange={(e) => edit(n.id, { desc: e.target.value })} />
            {tagEditor(n)}
            <div className="flex items-center gap-2 text-sm text-stone-500 mb-3"><span>progress</span><div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${pct(n)}%` }} /></div><span className="tabular-nums">{pct(n)}%</span></div>
            {kind === "open" && <div className="grid grid-cols-2 gap-2 mb-2"><button onClick={() => addGoal(n.id)} className="flex flex-col items-center gap-1 text-xs border border-stone-200 rounded-lg py-3 hover:bg-stone-50"><Network size={18} className="text-violet-500" />break into sub-goals</button><button onClick={() => addTask(n.id)} className="flex flex-col items-center gap-1 text-xs border border-stone-200 rounded-lg py-3 hover:bg-stone-50"><ListChecks size={18} className="text-teal-600" />make a checklist</button></div>}
            {kind === "branch" && (<><div className="text-xs uppercase tracking-wide text-stone-400 mb-1">sub-goals</div>{goalsUnder(n.id).map((g) => <button key={g.id} onClick={() => setSel(g.id)} className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-stone-100 truncate">{g.name || "untitled goal"}</button>)}<button onClick={() => addGoal(n.id)} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 mt-1"><Plus size={14} />add sub-goal</button></>)}
            {kind === "leaf" && (<><div className="text-xs uppercase tracking-wide text-stone-400 mb-1">checklist</div><div>{cts.map((t) => renderTaskRow(t, { showPath: false, fields: cfields, tops: ctops }))}<button onClick={() => addTask(n.id)} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 mt-1"><Plus size={14} />add item</button></div></>)}
          </>
        )}
        <button onClick={() => { remove(n.id); setSel(null); }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 mt-5"><Trash2 size={13} />delete</button>
      </div>
    );
  }

  const NavBtn = ({ id, icon: Icon, label }) => (<button onClick={() => setView(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${view === id ? "bg-white text-stone-900" : "text-stone-300 hover:bg-stone-700"}`}><Icon size={16} />{label}</button>);
  const GroupBtn = ({ id, label }) => (<button onClick={() => setGroupBy(id)} className={`px-2 py-0.5 rounded-md ${groupBy === id ? "bg-white shadow-sm text-stone-800" : "text-stone-500"}`}>{label}</button>);
  const starredIdeas = ideas.filter((i) => i.starred);
  const unsorted = ideas.filter((i) => !i.starred);
  const inboxFields = unsorted.map((x) => x.id);

  return (
    <div className="hs-root min-h-screen text-stone-200 font-sans" style={{ background: bg }} onClick={() => { repeatMenu && setRepeatMenu(null); switcherOpen && setSwitcherOpen(false); inviteOpen && setInviteOpen(false); accountOpen && closeAccountMenu(); }}>
      <style>{`.hs-root .bg-white { background-color: ${panel} !important; }`}</style>
      <div className="max-w-5xl mx-auto px-4 py-5">
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-baseline gap-2">
            <h1 className="font-mono font-bold text-lg tracking-tight text-white">hypersymmetry</h1>
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 border border-stone-700 rounded-full px-2 py-0.5">alpha</span>
            {boards && boards.length > 1 && (
              <span className="relative">
                <button onClick={(e) => { e.stopPropagation(); setSwitcherOpen((v) => !v); }} className="text-xs text-stone-400 hover:text-stone-100 border border-stone-700 rounded-full px-2 py-0.5 ml-1">
                  {boards.find((b) => b.id === boardId)?.isOwn ? "My board" : `${boards.find((b) => b.id === boardId)?.ownerUsername}'s board`}
                </button>
                {switcherOpen && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute left-0 top-7 z-30 bg-white border border-stone-200 rounded-lg shadow-lg p-1 w-48 text-sm text-stone-700">
                    {boards.map((b) => (
                      <Link key={b.id} href={`/app?board=${b.id}`} onClick={() => setSwitcherOpen(false)} className={`block px-2 py-1 rounded hover:bg-stone-100 ${b.id === boardId ? "text-teal-600 font-medium" : ""}`}>
                        {b.isOwn ? "My board" : `${b.ownerUsername}'s board`}
                      </Link>
                    ))}
                  </div>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <NavBtn id="home" icon={Home} label="Home" />
            <NavBtn id="inbox" icon={Inbox} label="Inbox" />
            <NavBtn id="plan" icon={Network} label="Plan" />
            <NavBtn id="help" icon={HelpCircle} label="Help" />
            {confirmReset ? <span className="flex items-center gap-1 text-xs"><button onClick={() => { setItems([]); setSel(null); setConfirmReset(false); }} className="px-2 py-1 rounded bg-red-500 text-white">erase all</button><button onClick={() => setConfirmReset(false)} className="px-2 py-1 rounded text-stone-200 hover:bg-stone-700">cancel</button></span>
              : <button title="reset everything" onClick={() => setConfirmReset(true)} className="text-stone-400 hover:text-stone-100 ml-1"><RotateCcw size={16} /></button>}
            {boards && boards.find((b) => b.id === boardId)?.isOwn && (
              <span className="relative">
                <button title="invite" onClick={(e) => { e.stopPropagation(); setInviteMsg(""); setInviteOpen((v) => !v); }} className="text-stone-400 hover:text-stone-100 ml-1"><UserPlus size={16} /></button>
                {inviteOpen && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-30 bg-white border border-stone-200 rounded-lg shadow-lg p-3 w-64 text-sm text-stone-700">
                    <div className="text-xs uppercase tracking-wide text-stone-400 mb-1.5">members</div>
                    <div className="space-y-1 mb-2 max-h-32 overflow-auto">
                      {(members || []).map((m) => (
                        <div key={m.userId} className="flex items-center justify-between text-xs text-stone-600">
                          <span>@{m.username}</span>
                          <span className="text-stone-400">{m.role}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <input
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doInvite(); }}
                        placeholder="username to invite"
                        className="flex-1 text-sm bg-stone-50 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-stone-300"
                      />
                      <button
                        onClick={doInvite}
                        className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-500"
                      >invite</button>
                    </div>
                    {inviteMsg && <p className="text-xs text-stone-500 mt-1.5">{inviteMsg}</p>}
                  </div>
                )}
              </span>
            )}
            <span className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setAccountOpen((v) => !v); if (!accountOpen) setAccountView("menu"); }}
                className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-100 ml-2"
              >
                {username ? `@${username}` : email}
                <ChevronDown size={12} />
              </button>
              {accountOpen && (
                <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-30 bg-white border border-stone-200 rounded-lg shadow-lg p-3 w-64 text-sm text-stone-700">
                  {accountView === "menu" && (
                    <>
                      <div className="text-xs text-stone-400 mb-2 truncate px-2">{email}</div>
                      <button onClick={openCustomize} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100"><Palette size={14} />Customize</button>
                      <button onClick={doRequestPasswordReset} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100"><KeyRound size={14} />Reset password</button>
                      {pwMsg && <p className="text-xs text-stone-500 px-2 pb-1">{pwMsg}</p>}
                      <button onClick={() => { setView("help"); closeAccountMenu(); }} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100"><HelpCircle size={14} />Help</button>
                      <div className="my-1 border-t border-stone-100" />
                      <button onClick={() => setAccountView("wipe")} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100 text-amber-600"><Eraser size={14} />Wipe account clean</button>
                      <button onClick={() => setAccountView("delete")} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100 text-red-600"><UserX size={14} />Delete account</button>
                      <div className="my-1 border-t border-stone-100" />
                      <button onClick={() => signOut()} className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-stone-100"><LogOut size={14} />Sign out</button>
                    </>
                  )}
                  {accountView === "customize" && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-wide text-stone-400">customize</span>
                        <button onClick={() => setAccountView("menu")} className="text-xs text-stone-400 hover:text-stone-700">back</button>
                      </div>
                      <label className="block text-xs text-stone-500 mb-1">background color</label>
                      <input
                        value={bgDraft}
                        onChange={(e) => previewTheme(e.target.value, panelDraft)}
                        placeholder="#000000"
                        className="w-full text-sm bg-stone-50 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-stone-300 mb-2 font-mono"
                      />
                      <label className="block text-xs text-stone-500 mb-1">textbox color</label>
                      <input
                        value={panelDraft}
                        onChange={(e) => previewTheme(bgDraft, e.target.value)}
                        placeholder="#ffffff"
                        className="w-full text-sm bg-stone-50 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-stone-300 mb-2 font-mono"
                      />
                      <div className="flex gap-1.5">
                        <button onClick={saveTheme} className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-500">save</button>
                        <button onClick={cancelCustomize} className="text-xs px-2 py-1 rounded text-stone-500 hover:bg-stone-100">cancel</button>
                      </div>
                      {themeMsg && <p className="text-xs text-stone-500 mt-1.5">{themeMsg}</p>}
                    </>
                  )}
                  {accountView === "wipe" && (
                    <>
                      <p className="text-sm text-stone-700 mb-2">This deletes every item on every board you own. This can&apos;t be undone.</p>
                      <div className="flex gap-1.5">
                        <button onClick={doWipeAccount} className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600">wipe it</button>
                        <button onClick={() => setAccountView("menu")} className="text-xs px-2 py-1 rounded text-stone-500 hover:bg-stone-100">cancel</button>
                      </div>
                      {wipeMsg && <p className="text-xs text-stone-500 mt-1.5">{wipeMsg}</p>}
                    </>
                  )}
                  {accountView === "delete" && (
                    <>
                      <p className="text-sm text-stone-700 mb-2">This permanently deletes your account, boards you own, and everyone&apos;s access to them. Type <span className="font-mono font-semibold">DELETE</span> to confirm.</p>
                      <input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="w-full text-sm bg-stone-50 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-red-300 mb-2 font-mono"
                      />
                      <div className="flex gap-1.5">
                        <button
                          disabled={deleteConfirmText !== "DELETE" || deleting}
                          onClick={doDeleteAccount}
                          className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >{deleting ? "deleting…" : "delete my account"}</button>
                        <button onClick={() => { setAccountView("menu"); setDeleteConfirmText(""); }} className="text-xs px-2 py-1 rounded text-stone-500 hover:bg-stone-100">cancel</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </span>
          </div>
        </header>

        {view === "home" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <section className="rounded-xl border border-stone-200 bg-white p-4 text-stone-800 lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Sun size={17} className="text-amber-500" /><h2 className="font-medium text-stone-700">Tasks</h2>
                <div className="ml-auto flex bg-stone-100 rounded-lg p-0.5 text-sm">
                  <button onClick={() => setHomeMode("today")} className={`px-2.5 py-1 rounded-md ${homeMode === "today" ? "bg-white shadow-sm" : "text-stone-500"}`}>Today</button>
                  <button onClick={() => setHomeMode("all")} className={`px-2.5 py-1 rounded-md ${homeMode === "all" ? "bg-white shadow-sm" : "text-stone-500"}`}>All</button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mb-3 text-xs text-stone-500 flex-wrap">
                <span className="uppercase tracking-wide">group</span>
                <div className="flex bg-stone-100 rounded-lg p-0.5"><GroupBtn id="none" label="None" /><GroupBtn id="priority" label="Priority" /><GroupBtn id="due" label="Due" /><GroupBtn id="category" label="Category" /></div>
                <button onClick={() => { const ids = new Set(baseTasks.filter((t) => taskDone(t) && !t.archived).map((t) => t.id)); if (ids.size) apply((p) => p.map((i) => ids.has(i.id) ? { ...i, archived: true } : i)); }} className="flex items-center gap-1 text-stone-500 hover:text-stone-800"><Archive size={13} />archive done</button>
                <button title="show archived" onClick={() => setShowArchived((v) => !v)} className={`flex items-center gap-1 ${showArchived ? "text-stone-800" : "text-stone-400 hover:text-stone-600"}`}><Eye size={13} />{showArchived ? "hide archived" : "show archived"}</button>
                {notif !== "granted" && notif !== "unsupported" && <button onClick={() => { try { Notification.requestPermission().then((p) => setNotif(p)); } catch {} }} className="flex items-center gap-1 ml-auto text-stone-500 hover:text-stone-800"><Bell size={13} />enable reminders</button>}
                {notif === "granted" && <span className="flex items-center gap-1 ml-auto text-teal-600"><Bell size={13} />reminders on</span>}
              </div>
              <div className="flex items-center gap-2 mb-2 rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5">
                <Plus size={15} className="text-stone-400" />
                <input ref={quickRef} className="bg-transparent outline-none text-sm flex-1 min-w-0" placeholder="add a task…  try: pay rent fri 9am !! #finance" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitQuick(); }} />
              </div>
              {baseTasks.length === 0 ? <p className="text-sm text-stone-400 py-2">No tasks here yet. Add one above, or flag tasks in Plan with the sun.</p> : (
                <div className="space-y-3">
                  {groups.map((g, gi) => (
                    <div key={gi}>
                      {g.label && <div className="text-xs uppercase tracking-wide text-stone-400 mb-0.5 px-1">{g.label} <span className="text-stone-300">· {g.tasks.length}</span></div>}
                      <div className="divide-y divide-stone-100">{g.tasks.map((t) => renderTaskRow(t, { showPath: true, fields: homeFields, tops: homeTops }))}</div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-stone-400 mt-3 px-1">press n for a new task · enter: new · tab / ⇧tab: indent / outdent · ↑ ↓: move · ⌘/ctrl+enter: complete · ⌘/ctrl+z: undo · #tag @person · see Help</p>
            </section>

            <div className="space-y-5">
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2"><Inbox size={17} className="text-stone-400" /><h2 className="font-medium text-stone-700">Capture</h2><span className="text-xs text-stone-400">— a thought, not a task. lands in your inbox.</span></div>
              <textarea rows={2} value={capture} onChange={(e) => setCapture(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addIdea(capture); setCapture(""); } }} placeholder="what's on your mind?  #tag or @person works too · enter to drop it" className="w-full resize-none text-sm bg-stone-50 rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-stone-300 text-stone-800" />
              <div className="flex justify-end mt-2"><button onClick={() => { addIdea(capture); setCapture(""); }} className="text-sm px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 text-stone-700">drop in inbox</button></div>
            </section>
            <section style={{ minHeight: "7rem" }} className="rounded-xl border border-dashed border-stone-600 p-4 text-stone-400 text-sm flex items-center justify-center text-center">Team space — arriving with multiplayer</section>
            </div>
          </div>
        )}

        {view === "inbox" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex items-center gap-2"><Inbox size={18} className="text-stone-300" /><h2 className="font-medium text-stone-100">Inbox</h2><span className="text-xs text-stone-400">{unsorted.length} unsorted</span></div>
            <p className="text-xs text-stone-400">Star the ones worth building. Let the rest go.</p>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-stone-600 px-2.5 py-2">
              <Plus size={15} className="text-stone-400" />
              <input ref={ideaRef} className="bg-transparent outline-none text-sm flex-1 min-w-0 text-stone-100" placeholder="add to inbox…" value={newIdea} onChange={(e) => setNewIdea(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addIdea(newIdea, false); setNewIdea(""); } }} />
            </div>
            <div className="space-y-1.5">
              {unsorted.length === 0 && <p className="text-sm text-stone-400 py-6 text-center">Inbox zero. Nicely done.</p>}
              {unsorted.map((i) => (
                <div key={i.id} className="flex items-center gap-2 rounded-lg bg-white border border-stone-200 px-3 py-2 group">
                  <button title="star — keep it" onClick={() => toggle(i.id, "starred")} className="text-stone-300 hover:text-amber-400 shrink-0"><Star size={15} /></button>
                  <input ref={reg(i.id)} className={`${inp} flex-1 text-sm min-w-0 text-stone-800`} value={i.text} onChange={(e) => edit(i.id, { text: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggle(i.id, "starred"); return; } if (e.key === "Enter") { e.preventDefault(); addIdeaAfter(i); return; } if (e.key === "ArrowUp") { e.preventDefault(); nav(-1, i.id, inboxFields); return; } if (e.key === "ArrowDown") { e.preventDefault(); nav(1, i.id, inboxFields); return; } if (e.key === "Escape") { e.target.blur(); return; } if (e.key === "Backspace" && i.text === "") { e.preventDefault(); backspaceEmpty(i.id, inboxFields); return; } }} />
                  {tagPills(i)}<button onClick={() => remove(i.id)} className={`${iconBtn} opacity-0 group-hover:opacity-100 shrink-0`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "help" && (
          <div className="space-y-4 max-w-2xl mx-auto text-stone-200">
            <div className="flex items-center gap-2"><HelpCircle size={18} className="text-stone-300" /><h2 className="font-medium text-stone-100">Commands &amp; shortcuts</h2></div>
            <section className="rounded-xl border border-stone-200 bg-white p-4 text-stone-700">
              <h3 className="font-medium text-stone-800 mb-2">Quick add</h3>
              <p className="text-sm mb-3">Type a task naturally — these are pulled out for you:</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex gap-3"><span className="w-32 shrink-0 font-mono text-xs text-stone-500">today · fri · 6/30</span><span>a due date</span></div>
                <div className="flex gap-3"><span className="w-32 shrink-0 font-mono text-xs text-stone-500">9am · 9:30pm · 21:00</span><span>a due time</span></div>
                <div className="flex gap-3"><span className="w-32 shrink-0 font-mono text-xs text-stone-500">! !! !!! · p1 p2 p3</span><span>priority</span></div>
                <div className="flex gap-3"><span className="w-32 shrink-0 font-mono text-xs text-stone-500">#finance</span><span>category tag — add as many as you like</span></div>
                <div className="flex gap-3"><span className="w-32 shrink-0 font-mono text-xs text-stone-500">@mark</span><span>a person (assignee)</span></div>
                <div className="flex gap-3"><span className="w-32 shrink-0 font-mono text-xs text-stone-500">"a note"</span><span>a caption / description</span></div>
              </div>
              <p className="text-sm mt-3 text-stone-500">e.g. <span className="font-mono text-xs bg-stone-100 rounded px-1 py-0.5 text-stone-700">handle budget fri 9am !! #finance @mark "Q3 deck in shared drive"</span></p>
            </section>
            <section className="rounded-xl border border-stone-200 bg-white p-4 text-stone-700">
              <h3 className="font-medium text-stone-800 mb-2">Tags &amp; people</h3>
              <p className="text-sm"><span className="font-mono text-xs">#tag</span> files something under a category — use as many as you want on any task, goal, or idea. <span className="font-mono text-xs">@person</span> marks an assignee. Both work in the capture box too, so a stray thought gets filed and addressed the moment you jot it.</p>
            </section>
            <section className="rounded-xl border border-stone-200 bg-white p-4 text-stone-700">
              <h3 className="font-medium text-stone-800 mb-2">Keyboard</h3>
              <div className="space-y-1.5 text-sm">
                {[["n", "new task, from anywhere"], ["enter", "new item below"], ["tab / \u21e7tab", "indent / outdent"], ["\u2191 \u2193", "move between items"], ["\u2318/ctrl + enter", "complete item"], ["\u2318/ctrl + z", "undo"], ["\u2318/ctrl + \u21e7 + z", "redo"], ["\u232b on empty", "delete item"], ["esc", "stop editing"]].map(([k, d]) => (<div key={k} className="flex gap-3"><span className="w-36 shrink-0 font-mono text-xs bg-stone-100 rounded px-1.5 py-0.5 text-stone-700">{k}</span><span>{d}</span></div>))}
              </div>
            </section>
          </div>
        )}

        {view === "plan" && (
          <div className="flex gap-4">
            <aside className="w-56 shrink-0">
              <div className="flex items-center gap-1.5 mb-2 px-1 text-stone-200"><Star size={13} className="text-amber-400" /><span className="text-xs uppercase tracking-wide">starred ideas</span></div>
              <p className="text-xs text-stone-400 mb-2 px-1">Pruned and ready. Tap the canvas icon to place one on the grid.</p>
              <div className="space-y-1.5">
                {starredIdeas.length === 0 && <p className="text-xs text-stone-400 px-1 py-3">No starred ideas yet.</p>}
                {starredIdeas.map((i) => (
                  <div key={i.id} className="flex items-center gap-1.5 rounded-lg bg-white border border-stone-200 px-2 py-1.5 group">
                    <button onClick={() => toggle(i.id, "starred")} className="text-amber-400"><Star size={14} fill="currentColor" /></button>
                    <input className={`${inp} flex-1 text-sm min-w-0 text-stone-800`} value={i.text} onChange={(e) => edit(i.id, { text: e.target.value })} />
                    <button title={i.onCanvas ? "on canvas — click to remove" : "place on canvas"} onClick={() => { const v = !i.onCanvas; update(i.id, { onCanvas: v }); if (v) { setView("plan"); setSel(i.id); } }} className={i.onCanvas ? "text-violet-500" : "text-stone-300 hover:text-stone-600"}><Network size={14} /></button>
                    <button onClick={() => remove(i.id)} className={`${iconBtn} opacity-0 group-hover:opacity-100`}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-3 rounded-lg border border-dashed border-stone-600 px-2 py-1.5">
                <Plus size={13} className="text-stone-400" />
                <input className="bg-transparent outline-none text-sm flex-1 min-w-0 text-stone-100" placeholder="add a starred idea…" value={newIdea} onChange={(e) => setNewIdea(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addIdea(newIdea, true); setNewIdea(""); } }} />
              </div>
            </aside>

            <main className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"><Search size={14} className="text-stone-400" /><input className="bg-transparent outline-none text-sm flex-1 min-w-0 text-stone-800" placeholder="search goals…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <button onClick={() => addGoal(null)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 bg-white text-stone-700 shrink-0"><Plus size={15} />new goal</button>
              </div>
              <div className="relative rounded-xl border border-stone-600 overflow-hidden" style={{ height: "70vh", minHeight: 460, background: "#2c2c2c", backgroundImage: "radial-gradient(circle, #4a4a4a 1.2px, transparent 1.2px)", backgroundSize: "24px 24px", backgroundPosition: `${cv.tx}px ${cv.ty}px`, cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => { pan.current = true; moved.current = false; e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => { if (pan.current) { moved.current = true; setCv((v) => ({ ...v, tx: v.tx + e.movementX, ty: v.ty + e.movementY })); } }}
                onPointerUp={() => { pan.current = false; }} onClick={() => { if (!moved.current) setSel(null); }}
                onWheel={(e) => { const f = e.deltaY < 0 ? 1.08 : 0.92; setCv((v) => ({ ...v, scale: clamp(v.scale * f, 0.4, 1.8) })); }}>
                {roots.length === 0 ? <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400 text-center px-6">Nothing on the canvas yet. Star an idea and tap its canvas icon to place it, or hit “new goal”.</div> : (
                  <div style={{ position: "absolute", left: 0, top: 0, width: innerW, height: innerH, transform: `translate(${cv.tx}px, ${cv.ty}px) scale(${cv.scale})`, transformOrigin: "0 0" }}>
                    <svg width={innerW} height={innerH} className="absolute left-0 top-0 pointer-events-none">{edges.map(([a, b]) => { const A = pos[a], B = pos[b], x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2, mx = (x1 + x2) / 2; return <path key={a + b} d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} fill="none" stroke="#5e5e5e" strokeWidth="1.5" />; })}</svg>
                    {Object.keys(pos).map((id) => { const n = all.find((i) => i.id === id); return n ? renderNode(n) : null; })}
                  </div>
                )}
                <div {...stop} className="absolute left-3 bottom-3 flex items-center gap-1 bg-white rounded-lg border border-stone-200 p-0.5">
                  <button onClick={() => setCv((v) => ({ ...v, scale: clamp(v.scale * 0.88, 0.4, 1.8) }))} className="p-1.5 text-stone-500 hover:text-stone-800"><ZoomOut size={15} /></button>
                  <button onClick={() => setCv((v) => ({ ...v, scale: clamp(v.scale * 1.14, 0.4, 1.8) }))} className="p-1.5 text-stone-500 hover:text-stone-800"><ZoomIn size={15} /></button>
                  <button title="recenter" onClick={() => setCv({ tx: 60, ty: 80, scale: 1 })} className="p-1.5 text-stone-500 hover:text-stone-800"><Crosshair size={15} /></button>
                </div>
                {sel && renderInspector()}
              </div>
              <p className="text-xs text-stone-400 mt-2 px-1">click a node, then: arrows navigate · s: sub-goal · c: checklist · drag to roam · scroll / +− zoom · fold with the edge dot</p>
            </main>
          </div>
        )}
        {warn && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg flex items-center gap-2"><AlertTriangle size={15} className="text-amber-400" />{warn}</div>}
      </div>
    </div>
  );
}
