import React, { useState, useMemo, useCallback, useRef, useEffect }
  from "react";
import {
  EAGLE_LIGHT_B64, installEagleLightWebFont,
} from "./eagle_light_font.js";
import { LOGO_PARTNERS_B64, LOGO_DESIGNWORKS_B64 } from "./logos.js";

/* ============================================================
   PMM Construct — Invoice Questionnaire Prototype
   Part of the PMM Tools Suite (Trilogy Design Intelligence)

   Visual language: PMM Tools Design System v1.0
     - Cream backgrounds, burgundy primary, gold accent
     - Eagle Light for display (INVOICE title, large numbers)
     - Libre Baskerville for body, Barlow Condensed for UI labels,
       DM Mono for tracker labels and codes
     - Warm-tinted shadows, soft brand-tinted card heads

   PMM Construct's product color is burgundy (--burg-700), placing
   it alongside Estimate, Purchase Orders, Connection, and on the
   Ground in the money/operations cluster.
   ============================================================ */

/* ---- Design tokens, mirroring PMM_Design_System.html :root ---- */
const T = {
  cream50: "#FDFAF5", cream100: "#F5F0E5", cream200: "#EDE5D5",
  cream300: "#D8CAAA", cream400: "#C4B088",
  burg900: "#3A0C08", burg800: "#5A1A10", burg700: "#7A2818",
  burg600: "#9A3820", burg500: "#B84830", burg400: "#D06848",
  burg100: "#F5E8E5",
  gold900: "#5A3408", gold700: "#8B6020", gold500: "#C8922A",
  gold400: "#D8A840", gold300: "#E8C870", gold100: "#FBF3DC",
  successText: "#1E5E1E", successBg: "#EAF5EA",
  warningText: "#6B4A08", warningBg: "#FBF3DC",
  errorText:   "#7A2818", errorBg:   "#F5E8E5",
  shadowSm:  "0 1px 3px rgba(90,26,16,0.08), 0 1px 2px rgba(90,26,16,0.05)",
  shadowMd:  "0 4px 12px rgba(90,26,16,0.10), 0 2px 4px rgba(90,26,16,0.06)",
  shadowLg:  "0 8px 24px rgba(90,26,16,0.12), 0 4px 8px rgba(90,26,16,0.08)",
  shadowInset: "inset 0 1px 3px rgba(90,26,16,0.08)",
};

const FONT = {
  display: "'Eagle Light', 'Cormorant Garamond', Georgia, serif",
  body:    "'Libre Baskerville', Georgia, serif",
  ui:      "'Barlow Condensed', 'Helvetica Neue', sans-serif",
  bodySm:  "'Barlow', 'Helvetica Neue', sans-serif",
  mono:    "'DM Mono', 'SF Mono', Menlo, monospace",
};

function installWebFonts() {
  if (typeof document === "undefined") return;
  installEagleLightWebFont();
  if (document.getElementById("pmm-google-fonts")) return;
  const link = document.createElement("link");
  link.id = "pmm-google-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?" +
    "family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400" +
    "&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400" +
    "&family=Barlow+Condensed:wght@400;600;700;800" +
    "&family=Barlow:wght@400;600" +
    "&family=DM+Mono:wght@400;500" +
    "&display=swap";
  document.head.appendChild(link);
}

const ENTITIES = {
  designworks: {
    key: "designworks",
    name: "Trilogy DesignWorks",
    address: [
      "Trilogy DesignWorks", "PO Box 5636",
      "Breckenridge, CO 80424-5636", "+1 970-453-2230",
      "finance@trilogybuilds.com", "virtualdesignworks.com",
    ],
    numberLabel: "Invoice Number",
    numberShort: "Invoice #",
    hasFee: true,
    feeLabel: "Trilogy DesignWorks Administration and Supervision",
    feeRate: 0.20,
    uploadsItems: false,
  },
  partners: {
    key: "partners",
    name: "Trilogy Partners LLC",
    address: [
      "Trilogy Partners LLC", "PO Box 5636",
      "Breckenridge, CO 80424-5636", "+1 970-453-2230",
      "finance@trilogybuilds.com", "Trilogybuilds.com",
    ],
    numberLabel: "Draw #",
    numberShort: "Draw #",
    hasFee: false,
    uploadsItems: true,
  },
};

const money = (n) =>
  (isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency", currency: "USD",
  });

const CONF = {
  high:   { label: "High confidence",      color: T.successText,
            bg: T.successBg, border: "#90C890" },
  medium: { label: "Review",               color: T.warningText,
            bg: T.warningBg, border: T.gold400 },
  low:    { label: "Low — please check",   color: T.errorText,
            bg: T.errorBg,   border: T.burg500 },
};

let ROW_SEQ = 0;
const nextId = () => `r${++ROW_SEQ}`;

/* ---- pdf.js loader: parses uploaded sub-invoice PDFs ---- */
const PDFJS_SRC =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement("script");
    s.src = PDFJS_SRC;
    s.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      } else reject(new Error("pdf.js failed to initialize"));
    };
    s.onerror = () => reject(new Error("pdf.js failed to load"));
    document.head.appendChild(s);
  });
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = {};
    content.items.forEach((it) => {
      const y = Math.round(it.transform[5]);
      (rows[y] = rows[y] || []).push(it);
    });
    Object.keys(rows)
      .sort((a, b) => b - a)
      .forEach((y) => {
        const text = rows[y]
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((it) => it.str).join(" ")
          .replace(/\s+/g, " ").trim();
        if (text) lines.push(text);
      });
  }
  return { lines, pageCount: pdf.numPages };
}

const MONEY_RE =
  /\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/g;
const TOTAL_WORDS =
  /(balance due|amount due|total due|grand total|invoice total|total)/i;

function parseAmount(str) {
  const n = parseFloat(str.replace(/[, $]/g, ""));
  return isNaN(n) ? null : n;
}

function detectTotal(lines) {
  let labeled = null, largest = 0;
  lines.forEach((ln) => {
    const matches = ln.match(MONEY_RE);
    if (!matches) return;
    const vals = matches.map(parseAmount).filter((v) => v !== null);
    vals.forEach((v) => { if (v > largest) largest = v; });
    if (TOTAL_WORDS.test(ln) && !/subtotal/i.test(ln)) {
      const v = vals[vals.length - 1];
      if (v != null && (labeled === null || v >= labeled)) labeled = v;
    }
  });
  if (labeled !== null) return { value: labeled, basis: "labeled total" };
  if (largest > 0) return { value: largest, basis: "largest amount" };
  return { value: 0, basis: "no amount found" };
}

function guessVendor(lines, fallback) {
  for (const ln of lines.slice(0, 6)) {
    if (!MONEY_RE.test(ln) && ln.length > 2 && ln.length < 60
        && !/invoice/i.test(ln)) return ln;
  }
  return fallback;
}

async function parseSubInvoice(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const fallback = file.name
    .replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Subcontractor";

  const base = {
    id: nextId(), source: file.name, qty: "1", rate: "",
    rawText: [], showRaw: false, pageCount: 0,
  };

  if (["jpg", "jpeg", "png", "heic"].includes(ext)) {
    return {
      ...base, kind: "scan", confidence: "low",
      desc: fallback + " — ", amount: "",
      detected: { value: 0, basis: "needs OCR" },
      note: "Photo/scan — OCR is Phase C. Enter the amount manually.",
    };
  }
  if (ext !== "pdf") {
    return {
      ...base, kind: "other", confidence: "low",
      desc: fallback + " — ", amount: "",
      detected: { value: 0, basis: "unsupported" },
      note: "Unsupported file — please upload a PDF.",
    };
  }
  try {
    const { lines, pageCount } = await extractPdfText(file);
    if (lines.length === 0) {
      return {
        ...base, kind: "scan", confidence: "low", pageCount,
        desc: fallback + " — ", amount: "",
        detected: { value: 0, basis: "no text layer" },
        note: "No text layer — likely a scan. OCR is Phase C.",
      };
    }
    const vendor = guessVendor(lines, fallback);
    const detected = detectTotal(lines);
    const confidence =
      detected.basis === "labeled total" ? "high"
      : detected.value > 0 ? "medium" : "low";
    return {
      ...base, kind: "pdf", confidence, pageCount, rawText: lines,
      desc: vendor + " — ",
      amount: detected.value ? String(detected.value) : "",
      detected,
      note: null,
    };
  } catch (err) {
    return {
      ...base, kind: "error", confidence: "low",
      desc: fallback + " — ", amount: "",
      detected: { value: 0, basis: "parse error" },
      note: "Couldn't parse this PDF (" + err.message + ").",
    };
  }
}

/* ---- GC Fee helpers ---- */
/* ---- Trilogy fee lines ----
   Three distinct fee types can appear on a Trilogy Partners invoice:

   - GC Fee (during active construction): % of an externally-computed
     base, formatted as "GC Fee for the period September 2025 14% of
     $73,954.76". Amount auto-calculates as % x base $.

   - Project Management Fee (during pre-construction): mechanically
     identical to GC Fee — % of a base, same structured fields, same
     auto-calc. Only the name differs in how it reads on the invoice.

   - Supervision Fee (during construction): a flat dollar amount set
     per project. Not a percentage; the user types the dollar figure
     directly. Description reads "Trilogy Supervision Fee".

   The user picks which fee type when adding the line. All three are
   editable, none are auto-finalized. */
const FEE_TYPES = {
  gc: {
    key: "gc",
    label: "GC Fee",
    addButtonLabel: "+ GC Fee line",
    isCalculated: true,
    descriptionPrefix: "GC Fee for the period",
  },
  projectmgmt: {
    key: "projectmgmt",
    label: "Project Management Fee",
    addButtonLabel: "+ Project Management Fee line",
    isCalculated: true,
    descriptionPrefix: "Project Management Fee for the period",
  },
  supervision: {
    key: "supervision",
    label: "Trilogy Supervision Fee",
    addButtonLabel: "+ Trilogy Supervision Fee",
    isCalculated: false,
    descriptionPrefix: "Trilogy Supervision Fee",
  },
};

// Description for a fee row. Calculated fees (GC, PM) assemble from
// the month/year/%/base fields; the flat Supervision Fee uses just
// the prefix (with an optional project phase suffix if provided).
function feeDescription(s) {
  const ft = FEE_TYPES[s.feeType] || FEE_TYPES.gc;
  if (!ft.isCalculated) {
    // Supervision Fee — flat amount. Just the prefix; the period
    // (month/year) is optional context the user may add via gcMonth/gcYear.
    const month = (s.gcMonth || "").trim();
    const year = (s.gcYear || "").trim();
    let d = ft.descriptionPrefix;
    if (month || year) d += ` ${month} ${year}`.replace(/\s+/g, " ");
    return d.trim();
  }
  // Calculated fees — assemble period + percent + base.
  const month = (s.gcMonth || "").trim();
  const year = (s.gcYear || "").trim();
  const pct = (s.gcPct || "").trim();
  const base = (s.gcBase || "").trim();
  let d = ft.descriptionPrefix;
  if (month || year) d += ` ${month} ${year}`.replace(/\s+/g, " ");
  if (pct) d += ` ${pct}%`;
  if (base) d += ` of $${base}`;
  return d.trim();
}

// Amount for a fee row. Calculated fees: % x base. Flat fees (Supervision):
// just the typed amount.
function feeAmount(s) {
  const ft = FEE_TYPES[s.feeType] || FEE_TYPES.gc;
  if (!ft.isCalculated) {
    const flat = parseFloat(
      String(s.amount || "").replace(/[, $]/g, ""));
    return isNaN(flat) ? NaN : flat;
  }
  const pct = parseFloat(String(s.gcPct || "").replace(/[, %]/g, ""));
  const base = parseFloat(String(s.gcBase || "").replace(/[, $]/g, ""));
  if (isNaN(pct) || isNaN(base)) return NaN;
  return (pct / 100) * base;
}

// Back-compat aliases so old call sites keep working unchanged. Any
// row with kind === "gcfee" had feeType set to "gc" implicitly; we
// preserve that default in addGcFeeSub. New fee types pass feeType
// explicitly.
const gcFeeDescription = feeDescription;
const gcFeeAmount = feeAmount;

/* ---- Trilogy Labor lines ----
   Standing labor line items can appear on a Trilogy Partners draw.
   Each person has a locked hourly rate; the user types hours and the
   amount is hours x rate. People fall into two shapes:

   - Fixed-category people (Michael Rath, Peyton Ladnier, Christiana
     Habermaas): their work always books to one category/cost code
     (Design Modeling). No phase toggle is shown.

   - Phased people (Mark Miller): their category varies per invoice
     between Pre-Construction and Construction Trilogy Labor, set by
     the draw's phase chosen on the Phase step (no per-row toggle).

   The user types hours; rate, description, and cost code are locked. */
const LABOR_PEOPLE = {
  rath: {
    key: "rath",
    fullName: "Michael Rath",
    shortName: "Michael",
    rate: 175,
    fixedCategory: {
      label: "Design Modeling",
      costCode: "01000-03 Design Modeling",
      descriptionTail: "hours for design modeling",
    },
  },
  miller: {
    key: "miller",
    fullName: "Mark Miller",
    shortName: "Mark",
    rate: 125,
    categories: {
      preconstruction: {
        label: "Pre-Construction Trilogy Labor",
        costCode: "01000-05 Pre-Construction Trilogy Labor",
        descriptionTail: "hours for pre-construction labor",
      },
      construction: {
        label: "Construction Trilogy Labor",
        costCode: "01000-05 Construction Trilogy Labor",
        descriptionTail: "hours for construction labor",
      },
    },
  },
  ladnier: {
    key: "ladnier",
    fullName: "Peyton Ladnier",
    shortName: "Peyton",
    rate: 125,
    fixedCategory: {
      label: "Design Modeling",
      costCode: "01000-03 Design Modeling",
      descriptionTail: "hours for design modeling",
    },
  },
  habermaas: {
    key: "habermaas",
    fullName: "Christiana Habermaas",
    shortName: "Christiana",
    rate: 125,
    fixedCategory: {
      label: "Design Modeling",
      costCode: "01000-03 Design Modeling",
      descriptionTail: "hours for design modeling",
    },
  },
};

// Look up the category for a labor row. For fixed-category people
// (Rath, Ladnier, Habermaas), always the fixed category. For phased
// people (Miller), the category follows the draw's phase chosen on
// the Phase step — there is no per-row override.
function laborCategory(s, phase) {
  const person = LABOR_PEOPLE[s.laborPerson];
  if (!person) return null;
  if (person.fixedCategory) return person.fixedCategory;
  const key = phase === "construction" ? "construction" : "preconstruction";
  return person.categories[key] || person.categories.preconstruction;
}

// Description as it appears on the invoice line item: e.g.
// "Michael Rath hours for design modeling".
function laborDescription(s, phase) {
  const person = LABOR_PEOPLE[s.laborPerson];
  const cat = laborCategory(s, phase);
  if (!person || !cat) return "";
  return `${person.fullName} ${cat.descriptionTail}`;
}

// Compute hours × rate. NaN if hours hasn't been entered yet.
function laborAmount(s) {
  const person = LABOR_PEOPLE[s.laborPerson];
  if (!person) return NaN;
  const hours = parseFloat(String(s.laborHours || "").replace(/[, ]/g, ""));
  if (isNaN(hours)) return NaN;
  return hours * person.rate;
}

/* ---- Hours-source PDF parsing ----
   Two real formats we know about today:
   (1) Mark's monthly hours come as a Buildertrend Daily Log export
       with one entry per day; each entry's hours sit on a line of
       the form "Title: 4 hours" (occasionally "Title: 5.5 Hours"
       with a capital H). Verified on a real May 2026 export: the
       20 entries sum to 87 hours, matching the hand-totalled figure.
   (2) Michael sends an email; the summary line reads like
       "46 Total for May@ $175 $8050". As a fallback we sum the
       individual day entries which look like "5/2 1D Jackson Zoom..."
       or "1-12 10D Work on Model..." (D = hours). Verified: both
       paths recover 46 hours on the real May 2026 email.
   Both formats are heuristic. If Buildertrend changes its export or
   Michael changes his email format, the parser may need an update.
   The extracted total always fills an editable field — nothing is
   ever auto-finalized. */
function parseHoursPdf(lines) {
  // (1) Buildertrend Daily Log: one "Title: N hours" line per entry.
  // Buildertrend sometimes splits a decimal like 7.5 into separate
  // text fragments ("7", ".", "5"), which the PDF reader rejoins with
  // spaces as "7 . 5". Requiring an unbroken number silently drops
  // every decimal entry. So instead we grab whatever sits between
  // "Title:" and "hours" and keep only digits and the dot. We also
  // count Title lines independently of whether their hours parsed, so
  // any entry we still can't read surfaces as a mismatch rather than a
  // silent undercount on a billing document.
  const btEntries = [];
  let titleCount = 0;
  for (const line of lines) {
    if (/^\s*Title:/.test(line)) titleCount++;
    const m = line.match(/Title:(.*?)[Hh]ours?\b/);
    if (m) {
      const h = parseFloat(m[1].replace(/[^\d.]/g, ""));
      if (!isNaN(h)) btEntries.push(h);
    }
  }
  if (titleCount > 0 || btEntries.length > 0) {
    const total = btEntries.reduce((s, h) => s + h, 0);
    const missed = titleCount - btEntries.length;
    const reconciles = missed <= 0;
    return {
      total,
      entries: btEntries.map((h, i) =>
        ({ label: `Entry ${i + 1}`, hours: h })),
      basis: reconciles
        ? `${btEntries.length} Buildertrend Daily Log entries`
        : `Read ${btEntries.length} of ${titleCount} Daily Log entries — `
          + `${missed} could not be read. VERIFY the total before billing.`,
      confidence: reconciles ? "high" : "low",
      reconciles,
      entryCount: btEntries.length,
      titleCount,
    };
  }
  // (2) Email summary line: "46 Total for May@ $175 $8050".
  for (const line of lines) {
    const m = line.match(/(\d+(?:\.\d+)?)\s+Total\s+for/i);
    if (m) {
      const total = parseFloat(m[1]);
      if (!isNaN(total)) {
        return {
          total, entries: [],
          basis: "Email summary line",
          confidence: "high",
        };
      }
    }
  }
  // (3) Email per-day entries: "5/2 1D Jackson Zoom..." or "1-12 10D ...".
  const emailEntries = [];
  for (const line of lines) {
    const m = line.match(/^\s*([\d\/.-]+)\s+(\d+(?:\.\d+)?)D\s/);
    if (m) {
      const h = parseFloat(m[2]);
      if (!isNaN(h)) emailEntries.push({ label: m[1], hours: h });
    }
  }
  if (emailEntries.length > 0) {
    return {
      total: emailEntries.reduce((s, e) => s + e.hours, 0),
      entries: emailEntries,
      basis: `Summed ${emailEntries.length} day entries`,
      confidence: "medium",
    };
  }
  return {
    total: 0, entries: [],
    basis: "Couldn't recognize the format",
    confidence: "low",
  };
}

async function parseHoursFromFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext !== "pdf") {
    return {
      ok: false, total: 0, entries: [], rawText: [],
      basis: "Only PDFs are supported for hours import",
      confidence: "low", source: file.name,
    };
  }
  try {
    const { lines } = await extractPdfText(file);
    if (lines.length === 0) {
      return {
        ok: false, total: 0, entries: [], rawText: [],
        basis: "No text layer — likely a scan",
        confidence: "low", source: file.name,
      };
    }
    const result = parseHoursPdf(lines);
    return {
      // A BT log that didn't reconcile (some entries unread) is NOT ok,
      // so the incomplete total won't auto-fill — the row shows the
      // warning and the user enters/verifies the figure deliberately.
      // (reconciles is undefined for the email paths, so they are
      // unaffected.)
      ok: result.total > 0 && result.reconciles !== false,
      ...result,
      rawText: lines,
      source: file.name,
    };
  } catch (err) {
    return {
      ok: false, total: 0, entries: [], rawText: [],
      basis: "Couldn't parse the PDF: " + err.message,
      confidence: "low", source: file.name,
    };
  }
}

/* ============================================================
   PDF GENERATION  —  design-system-correct invoice output
   ============================================================ */

const JSPDF_SRC =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

function loadJsPdf() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
    const s = document.createElement("script");
    s.src = JSPDF_SRC;
    s.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error("jsPDF failed to initialize"));
    };
    s.onerror = () => reject(new Error("jsPDF failed to load"));
    document.head.appendChild(s);
  });
}

const PDF_BRAND = {
  partners:    { logoB64: LOGO_PARTNERS_B64,    logoW: 96, logoH: 79 },
  designworks: { logoB64: LOGO_DESIGNWORKS_B64, logoW: 120, logoH: 70 },
};

function rgb(hex) {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16),
          parseInt(v.slice(4, 6), 16)];
}

async function generateInvoicePdf(opts) {
  const { entity, billTo, number, date, lineItems,
          feeBase, feeAmount, balanceDue, descriptionSummary } = opts;
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "pt", format: "letter" });
  doc.addFileToVFS("EagleLight.ttf", EAGLE_LIGHT_B64);
  doc.addFont("EagleLight.ttf", "EagleLight", "normal");

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const brand = PDF_BRAND[entity.key];
  const fmt = (n) =>
    "$" + (isFinite(n) ? n : 0).toLocaleString("en-US",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // cream page
  doc.setFillColor(...rgb(T.cream50));
  doc.rect(0, 0, W, H, "F");

  // header: logo + INVOICE
  if (entity.key === "partners") {
    doc.addImage("data:image/png;base64," + brand.logoB64, "PNG",
                 W - M - brand.logoW, 40, brand.logoW, brand.logoH);
    doc.setFont("EagleLight", "normal").setFontSize(40);
    doc.setTextColor(...rgb(T.burg700));
    doc.text("INVOICE", M, 88);
  } else {
    doc.addImage("data:image/png;base64," + brand.logoB64, "PNG",
                 M, 40, brand.logoW, brand.logoH);
    doc.setFont("EagleLight", "normal").setFontSize(40);
    doc.setTextColor(...rgb(T.burg700));
    doc.text("INVOICE", W - M, 88, { align: "right" });
  }

  // address block
  const addrY = 144;
  doc.setFont("times", "normal").setFontSize(9.5);
  doc.setTextColor(...rgb(T.burg800));
  entity.address.forEach((ln, i) => doc.text(ln, M, addrY + i * 13));

  // thin gold rule
  let y = addrY + entity.address.length * 13 + 16;
  doc.setDrawColor(...rgb(T.gold500)).setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  y += 24;

  // BILL TO / Number / Date — two-row band
  const colW = (W - 2 * M) / 3;
  const labelStripH = 18;
  const valueStripH = 30;
  const bandH = labelStripH + valueStripH;

  doc.setFillColor(...rgb(T.cream200));
  doc.rect(M, y, W - 2 * M, labelStripH, "F");

  doc.setDrawColor(...rgb(T.cream300)).setLineWidth(0.5);
  doc.rect(M, y, W - 2 * M, bandH);
  doc.line(M + colW, y, M + colW, y + bandH);
  doc.line(M + 2 * colW, y, M + 2 * colW, y + bandH);
  doc.line(M, y + labelStripH, W - M, y + labelStripH);

  doc.setFont("courier", "normal").setFontSize(7.5);
  doc.setTextColor(...rgb(T.gold700));
  doc.text("BILL TO", M + 10, y + 12);
  doc.text(entity.numberShort.toUpperCase(), M + colW + 10, y + 12);
  doc.text("DATE", M + 2 * colW + 10, y + 12);

  doc.setFont("times", "normal").setFontSize(11);
  doc.setTextColor(...rgb(T.burg900));
  doc.text(billTo || "", M + 10, y + labelStripH + 20);
  doc.text(number || "", M + colW + 10, y + labelStripH + 20);
  doc.text(date || "", M + 2 * colW + 10, y + labelStripH + 20);
  y += bandH + 22;

  // line-item table
  const cQty = M, cDesc = M + 54, cRate = W - M - 210, cAmt = W - M - 90;
  const rowH = 24;

  doc.setFillColor(...rgb(T.burg700));
  doc.rect(M, y, W - 2 * M, rowH, "F");
  doc.setFont("courier", "bold").setFontSize(8);
  doc.setTextColor(...rgb(T.cream50));
  doc.text("QTY", cQty + 8, y + 15);
  doc.text("DESCRIPTION", cDesc + 8, y + 15);
  doc.text("RATE", cRate + 8, y + 15);
  doc.text("AMOUNT", W - M - 8, y + 15, { align: "right" });
  y += rowH;

  doc.setFont("times", "normal").setFontSize(10);
  doc.setTextColor(...rgb(T.burg900));
  doc.setDrawColor(...rgb(T.cream300));
  lineItems.forEach((it) => {
    const descLines = doc.splitTextToSize(
      String(it.desc || ""), cRate - cDesc - 14);
    const thisH = Math.max(rowH, descLines.length * 13 + 11);
    doc.line(M, y + thisH, W - M, y + thisH);
    doc.text(String(it.qty || ""), cQty + 8, y + 16);
    descLines.forEach((ln, k) => doc.text(ln, cDesc + 8, y + 16 + k * 13));
    doc.text(String(it.rate || ""), cRate + 8, y + 16);
    doc.text(it.amount ? fmt(it.amount) : "",
             W - M - 8, y + 16, { align: "right" });
    y += thisH;
  });

  if (entity.hasFee) {
    doc.setFillColor(...rgb(T.cream100));
    doc.rect(M, y, W - 2 * M, rowH, "F");
    doc.setDrawColor(...rgb(T.cream300));
    doc.line(M, y + rowH, W - M, y + rowH);
    doc.setFont("times", "italic").setFontSize(10);
    doc.setTextColor(...rgb(T.burg800));
    doc.text(entity.feeLabel, cDesc + 8, y + 16);
    doc.text(`${fmt(feeBase)} \u00d7 ${Math.round(entity.feeRate * 100)}%`,
             cRate + 8, y + 16);
    doc.text(feeAmount ? fmt(feeAmount) : "",
             W - M - 8, y + 16, { align: "right" });
    y += rowH;
  }

  // Balance Due band
  const balH = 38;
  doc.setFillColor(...rgb(T.burg700));
  doc.rect(M, y, W - 2 * M, balH, "F");
  doc.setFont("courier", "bold").setFontSize(9);
  doc.setTextColor(...rgb(T.gold300));
  doc.text("BALANCE DUE", cRate + 8, y + 24);
  doc.setFont("EagleLight", "normal").setFontSize(18);
  doc.setTextColor(...rgb(T.cream50));
  doc.text(fmt(balanceDue), W - M - 8, y + 25, { align: "right" });
  y += balH + 36;

  // Invoice description summary — natural-language sentence the user
  // wrote on the Review step (pre-filled mechanically, then edited).
  // Replaces the old signature/date lines.
  if (descriptionSummary && descriptionSummary.trim().length > 0) {
    doc.setFont("courier", "normal").setFontSize(7.5);
    doc.setTextColor(...rgb(T.gold700));
    doc.text("DESCRIPTION OF INVOICE", M, y);
    y += 6;
    doc.setDrawColor(...rgb(T.gold500)).setLineWidth(0.5);
    doc.line(M, y, M + 180, y);
    y += 14;
    doc.setFont("times", "normal").setFontSize(10.5);
    doc.setTextColor(...rgb(T.burg900));
    const summaryLines = doc.splitTextToSize(
      descriptionSummary.trim(), W - 2 * M);
    summaryLines.forEach((ln, i) => doc.text(ln, M, y + i * 14));
    y += summaryLines.length * 14 + 10;
  }

  // footer
  const footY = H - 48;
  doc.setDrawColor(...rgb(T.cream300)).setLineWidth(0.5);
  doc.line(M, footY - 8, W - M, footY - 8);
  doc.setFont("times", "italic").setFontSize(10);
  doc.setTextColor(...rgb(T.gold700));
  doc.text("Boots on the Ground, Eyes on the Sky.", M, footY + 6);
  doc.setFont("courier", "normal").setFontSize(6.5);
  doc.setTextColor(...rgb(T.cream400));
  doc.text("PMM CONSTRUCT \u00b7 TRILOGY DESIGN INTELLIGENCE",
           W - M, footY + 6, { align: "right" });

  const safe = (s) => String(s || "").replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = (entity.key === "partners" ? "Trilogy_Partners"
    : "Trilogy_DesignWorks") + "_Invoice_"
    + (safe(number) || "draft") + ".pdf";
  doc.save(name);
  return name;
}
/* ============================================================
   SubRow — TOP-LEVEL component (NOT nested inside App).
   Defining it inside App would create a new function on every
   render, causing React to remount inputs and lose focus when
   typing. Keep it here.
   ============================================================ */
/* ============================================================
   LaborSubRow — TOP-LEVEL component for Trilogy Labor lines.
   Lives separately from SubRow because it uses hooks (useRef for
   the per-row hours-PDF file picker, useState for the parsing
   spinner). Splitting it out keeps the rules of hooks happy and
   keeps SubRow's logic readable.
   ============================================================ */
function LaborSubRow({ s, phase, updateSub, removeSub }) {
  const person = LABOR_PEOPLE[s.laborPerson];
  const cat = laborCategory(s, phase);
  const calcAmt = laborAmount(s);
  // Phased people (Miller) book to Pre-Construction or Construction
  // based on the draw's phase; fixed-category people (Rath, Ladnier,
  // Habermaas) don't. The hours-source hint keys off this too.
  const hasCategories = !!(person && person.categories);
  const hoursFileRef = useRef(null);
  const [parsingHours, setParsingHours] = useState(false);

  const onUploadHours = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setParsingHours(true);
    const result = await parseHoursFromFile(file);
    setParsingHours(false);
    updateSub(s.id, {
      laborHours: result.ok ? String(result.total) : s.laborHours,
      laborSource: result.source,
      laborEntries: result.entries,
      laborBasis: result.basis,
      laborSourceOk: result.ok,
      rawText: result.rawText,
    });
    // reset so the same file can be re-picked if needed
    if (hoursFileRef.current) hoursFileRef.current.value = "";
  };

  const clearHoursSource = () =>
    updateSub(s.id, {
      laborSource: "", laborEntries: [], laborBasis: "",
      laborSourceOk: false, rawText: [], showRaw: false,
    });

  return (
    <div style={{
      border: `1px solid ${T.burg500}`,
      background: T.burg100,
      borderRadius: 6, padding: "14px 16px",
      boxShadow: T.shadowSm,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: 12,
      }}>
        <span style={{
          fontFamily: FONT.mono, fontSize: 10,
          letterSpacing: ".14em", textTransform: "uppercase",
          color: T.burg700, fontWeight: 500,
        }}>
          {person ? `${person.fullName} — Trilogy Labor` : "Labor"}
        </span>
        <button onClick={() => removeSub(s.id)} style={{
          border: "none", background: "none", cursor: "pointer",
          color: T.burg500, fontSize: 18, lineHeight: 1, padding: 0,
        }} aria-label="Remove">&times;</button>
      </div>

      {hasCategories && cat && (
        <div style={{
          marginBottom: 10,
          fontFamily: FONT.mono, fontSize: 10,
          letterSpacing: ".08em", textTransform: "uppercase",
          color: T.gold700,
        }}>
          Category: {cat.label}
          <span style={{
            color: T.cream400, textTransform: "none",
            letterSpacing: 0, fontStyle: "italic",
          }}> — set by the draw&rsquo;s phase</span>
        </div>
      )}

      {/* Hours-source PDF upload zone */}
      <div style={{
        border: `1px dashed ${T.cream300}`,
        borderRadius: 4, padding: "10px 12px", marginBottom: 10,
        background: T.cream50,
      }}>
        {!s.laborSource ? (
          <div style={{ display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontFamily: FONT.bodySm, fontSize: 12,
              color: T.burg800, lineHeight: 1.5 }}>
              <strong style={{ fontFamily: FONT.ui, fontSize: 11,
                fontWeight: 700, letterSpacing: ".04em",
                textTransform: "uppercase", color: T.burg700 }}>
                Optional:
              </strong>{" "}
              upload {hasCategories ? "BT Daily Log" : "hours email"} PDF
              and Construct will read the total.
            </div>
            <button
              disabled={parsingHours}
              onClick={() => hoursFileRef.current
                && hoursFileRef.current.click()}
              style={{
                fontFamily: FONT.ui, fontSize: 11, fontWeight: 700,
                letterSpacing: ".06em", textTransform: "uppercase",
                background: "transparent", color: T.burg700,
                border: `1.5px solid ${T.burg700}`,
                borderRadius: 4, padding: "6px 14px",
                cursor: parsingHours ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}>
              {parsingHours ? "Reading…" : "Upload PDF"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex",
              justifyContent: "space-between", alignItems: "baseline",
              gap: 10 }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5,
                color: s.laborSourceOk ? T.successText : T.errorText,
                letterSpacing: ".04em", wordBreak: "break-all" }}>
                {s.laborSourceOk ? "✓ " : "⚠ "}{s.laborSource}
              </div>
              <button onClick={clearHoursSource} style={{
                border: "none", background: "none", padding: 0,
                cursor: "pointer", color: T.burg600,
                fontFamily: FONT.mono, fontSize: 10,
                textDecoration: "underline", whiteSpace: "nowrap",
              }}>change file</button>
            </div>
            <div style={{ marginTop: 4, fontFamily: FONT.bodySm,
              fontSize: 12, color: T.burg800 }}>
              {s.laborBasis}
              {s.laborSourceOk && s.laborEntries
                && s.laborEntries.length > 0 && (
                <>
                  {" — "}
                  <button onClick={() => updateSub(s.id,
                      { showRaw: !s.showRaw })}
                    style={{
                      border: "none", background: "none", padding: 0,
                      cursor: "pointer", color: T.burg700,
                      textDecoration: "underline",
                      fontFamily: FONT.bodySm, fontSize: 12,
                    }}>
                    {s.showRaw ? "hide" : "view"} {s.laborEntries.length}
                    {" "}entries
                  </button>
                </>
              )}
            </div>
            {s.showRaw && s.laborEntries
              && s.laborEntries.length > 0 && (
              <div style={{
                marginTop: 8, padding: "8px 12px",
                background: T.cream100,
                border: `1px solid ${T.cream300}`,
                borderRadius: 3, maxHeight: 200, overflow: "auto",
              }}>
                {s.laborEntries.map((e, i) => (
                  <div key={i} style={{
                    fontFamily: FONT.mono, fontSize: 11,
                    color: T.burg800, display: "flex",
                    justifyContent: "space-between",
                    padding: "2px 0",
                  }}>
                    <span>{e.label}</span>
                    <span>{e.hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <input ref={hoursFileRef} type="file" hidden accept=".pdf"
          onChange={onUploadHours} />
      </div>

      {/* Hours × rate = amount */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "100px 90px 1fr 140px", gap: 8,
        alignItems: "center", marginBottom: 8,
      }}>
        <div style={{
          fontFamily: FONT.mono, fontSize: 10,
          letterSpacing: ".1em", textTransform: "uppercase",
          color: T.gold700,
        }}>Hours</div>
        <input style={{ ...inputStyle(), textAlign: "right",
          fontFamily: FONT.display, fontSize: 15 }}
          value={s.laborHours || ""} placeholder="0"
          onChange={(e) => updateSub(s.id,
            { laborHours: e.target.value })} />
        <div style={{
          fontFamily: FONT.mono, fontSize: 11,
          color: T.burg700, textAlign: "right",
        }}>
          &times; ${person ? person.rate : 0}/hr
        </div>
        <div style={{
          ...inputStyle(),
          background: isNaN(calcAmt) ? T.cream100 : T.cream50,
          border: `1.5px solid ${isNaN(calcAmt) ? T.cream300 : T.burg500}`,
          textAlign: "right",
          color: isNaN(calcAmt) ? T.cream400 : T.burg900,
          fontWeight: isNaN(calcAmt) ? 400 : 700,
          fontFamily: FONT.display, fontSize: 15,
        }}>
          {isNaN(calcAmt) ? "—" : money(calcAmt)}
        </div>
      </div>

      <div style={{
        fontFamily: FONT.body, fontSize: 12, fontStyle: "italic",
        color: T.burg800, lineHeight: 1.5, marginTop: 4,
      }}>
        {laborDescription(s, phase)}
      </div>
      <div style={{
        marginTop: 6, fontFamily: FONT.mono, fontSize: 10,
        letterSpacing: ".06em", color: T.gold700,
      }}>
        {cat ? cat.costCode : ""}
      </div>
    </div>
  );
}

function SubRow({ s, phase, updateSub, removeSub }) {
  const c = CONF[s.confidence];
  const amt = parseFloat(s.amount);
  const reconciles =
    s.detected && s.detected.value > 0 && !isNaN(amt) &&
    Math.abs(amt - s.detected.value) < 0.005;

  /* GC Fee row: structured fields, auto-calculated amount. */
  if (s.kind === "gcfee") {
    const ft = FEE_TYPES[s.feeType] || FEE_TYPES.gc;
    const calcAmt = feeAmount(s);
    return (
      <div style={{
        border: `1px solid ${T.gold400}`,
        background: T.gold100,
        borderRadius: 6, padding: "14px 16px",
        boxShadow: T.shadowSm,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: 12,
        }}>
          <span style={{
            fontFamily: FONT.mono, fontSize: 10,
            letterSpacing: ".14em", textTransform: "uppercase",
            color: T.gold700, fontWeight: 500,
          }}>{ft.label}</span>
          <button onClick={() => removeSub(s.id)} style={{
            border: "none", background: "none", cursor: "pointer",
            color: T.burg500, fontSize: 18, lineHeight: 1, padding: 0,
          }} aria-label="Remove">&times;</button>
        </div>

        {/* Calculated fees (GC, PM): four structured fields. */}
        {ft.isCalculated && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 70px 1fr", gap: 8,
            marginBottom: 10,
          }}>
            <input style={inputStyle()} value={s.gcMonth}
              placeholder="Month"
              onChange={(e) => updateSub(s.id, { gcMonth: e.target.value })} />
            <input style={inputStyle()} value={s.gcYear}
              placeholder="Year"
              onChange={(e) => updateSub(s.id, { gcYear: e.target.value })} />
            <input style={inputStyle()} value={s.gcPct}
              placeholder="%"
              onChange={(e) => updateSub(s.id, { gcPct: e.target.value })} />
            <input style={inputStyle()} value={s.gcBase}
              placeholder="Base $"
              onChange={(e) => updateSub(s.id, { gcBase: e.target.value })} />
          </div>
        )}

        {/* Flat fees (Supervision): the user types the dollar amount
            directly. Period (month/year) is optional context. */}
        {!ft.isCalculated && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px", gap: 8,
            marginBottom: 10,
          }}>
            <input style={inputStyle()} value={s.gcMonth}
              placeholder="Month (optional)"
              onChange={(e) => updateSub(s.id, { gcMonth: e.target.value })} />
            <input style={inputStyle()} value={s.gcYear}
              placeholder="Year"
              onChange={(e) => updateSub(s.id, { gcYear: e.target.value })} />
          </div>
        )}

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 140px", gap: 8,
          alignItems: "center",
        }}>
          <div style={{
            fontFamily: FONT.body, fontSize: 12, fontStyle: "italic",
            color: T.burg800, lineHeight: 1.5,
          }}>
            {feeDescription(s)}
          </div>
          {ft.isCalculated ? (
            <div style={{
              ...inputStyle(),
              background: isNaN(calcAmt) ? T.cream100 : T.cream50,
              border: `1.5px solid ${isNaN(calcAmt) ? T.cream300 : T.gold500}`,
              textAlign: "right",
              color: isNaN(calcAmt) ? T.cream400 : T.burg900,
              fontWeight: isNaN(calcAmt) ? 400 : 700,
              fontFamily: FONT.display, fontSize: 15,
            }}>
              {isNaN(calcAmt) ? "—" : money(calcAmt)}
            </div>
          ) : (
            <input style={{
              ...inputStyle(),
              border: `1.5px solid ${T.gold500}`,
              textAlign: "right",
              fontFamily: FONT.display, fontSize: 15,
              fontWeight: 700, color: T.burg900,
            }} value={s.amount || ""}
              placeholder="0.00"
              onChange={(e) => updateSub(s.id,
                { amount: e.target.value })} />
          )}
        </div>
        <div style={{
          marginTop: 8, fontSize: 10.5, fontFamily: FONT.bodySm,
          color: T.gold700,
        }}>
          {ft.isCalculated
            ? "Amount auto-calculates as % \u00d7 base $."
            : "Flat amount, varies per project. Type the dollar figure."}
        </div>
      </div>
    );
  }

  /* Labor row: locked rate, user types hours. For phased people
     (Mark Miller), the category (Pre-Construction vs. Construction)
     is set by the draw's phase, not a per-row toggle. */
  if (s.kind === "labor") {
    return (
      <LaborSubRow s={s} phase={phase} updateSub={updateSub} removeSub={removeSub} />
    );
  }
  /* Standard sub-invoice row. */
  return (
    <div style={{
      border: `1px solid ${c.border}`,
      background: T.cream50,
      borderRadius: 6, padding: "12px 14px",
      boxShadow: T.shadowSm,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "48px 1fr 64px 96px 24px",
        gap: 8, alignItems: "center",
      }}>
        <input style={inputStyle()} value={s.qty} placeholder="Qty"
          onChange={(e) => updateSub(s.id, { qty: e.target.value })} />
        <input style={inputStyle()} value={s.desc}
          placeholder="Vendor — purpose"
          onChange={(e) => updateSub(s.id, { desc: e.target.value })} />
        <input style={inputStyle()} value={s.rate} placeholder="Rate"
          onChange={(e) => updateSub(s.id, { rate: e.target.value })} />
        <input style={{ ...inputStyle(), textAlign: "right" }}
          value={s.amount} placeholder="Amount"
          onChange={(e) => updateSub(s.id, { amount: e.target.value })} />
        <button onClick={() => removeSub(s.id)} style={{
          border: "none", background: "none", cursor: "pointer",
          color: T.cream400, fontSize: 17, padding: 0,
        }} aria-label="Remove">&times;</button>
      </div>
      <div style={{
        display: "flex", gap: 12, marginTop: 8, paddingLeft: 56,
        fontSize: 10.5, fontFamily: FONT.mono, alignItems: "center",
        flexWrap: "wrap", letterSpacing: ".04em",
      }}>
        <span style={{
          color: c.color, fontWeight: 500,
          textTransform: "uppercase", fontSize: 10,
          letterSpacing: ".1em",
        }}>{c.label}</span>
        <span style={{ color: T.cream400 }}>
          {s.kind === "manual" ? "manual line"
            : `${s.source}${s.pageCount ? ` · ${s.pageCount}p` : ""}`}
        </span>
        {s.detected && s.detected.value > 0 && (
          <span style={{
            color: reconciles ? T.successText : T.warningText,
          }}>
            detected {money(s.detected.value)} ({s.detected.basis})
          </span>
        )}
        {s.note && (
          <span style={{ color: T.errorText, fontFamily: FONT.bodySm }}>
            {s.note}
          </span>
        )}
        {s.rawText.length > 0 && (
          <button onClick={() => updateSub(s.id, { showRaw: !s.showRaw })}
            style={{
              border: "none", background: "none", padding: 0,
              cursor: "pointer", color: T.burg700,
              textDecoration: "underline", fontFamily: FONT.mono,
              fontSize: 10, letterSpacing: ".04em",
            }}>
            {s.showRaw ? "hide" : "view"} extracted text
          </button>
        )}
      </div>
      {s.showRaw && s.rawText.length > 0 && (
        <pre style={{
          marginTop: 8, marginLeft: 56, padding: "10px 12px",
          background: T.cream100, border: `1px solid ${T.cream300}`,
          borderRadius: 4, fontSize: 10.5, lineHeight: 1.5,
          maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap",
          fontFamily: FONT.mono, color: T.burg800,
        }}>
          {s.rawText.join("\n")}
        </pre>
      )}
    </div>
  );
}

/* Shared input style, design-system shape. */
function inputStyle() {
  return {
    width: "100%", boxSizing: "border-box",
    fontFamily: FONT.bodySm, fontSize: 14,
    color: T.burg900,
    background: T.cream50,
    border: `1.5px solid ${T.cream300}`,
    borderRadius: 4,
    padding: "8px 12px",
    outline: "none",
    boxShadow: T.shadowInset,
  };
}

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  useEffect(() => { installWebFonts(); }, []);

  const [step, setStep] = useState(0);
  const [entityKey, setEntityKey] = useState(null);
  // Project phase (Partners draws only): "preconstruction" or
  // "construction". Drives which fees/labor the team is shown, so
  // the wrong-phase options can't be added by mistake.
  const [phase, setPhase] = useState(null);
  const [billTo, setBillTo] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([
    { id: nextId(), qty: "1", desc: "", rate: "", amount: "" },
  ]);
  const [subs, setSubs] = useState([]);
  const [parsing, setParsing] = useState(0);
  const [feeBaseManual, setFeeBaseManual] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  // Invoice description summary — natural-language sentence shown on
  // the Review step and printed on the PDF. Pre-filled mechanically
  // from line items when the user reaches Review, then edited freely.
  const [descriptionSummary, setDescriptionSummary] = useState("");
  const [summaryAutofilled, setSummaryAutofilled] = useState(false);
  const fileRef = useRef(null);

  const entity = entityKey ? ENTITIES[entityKey] : null;

  /* lineItems: derived from items (DesignWorks) or subs (Partners).
     GC Fee rows use the calculated amount; everything else is typed
     or computed from qty x rate. */
  const lineItems = useMemo(() => {
    if (entity && entity.uploadsItems) {
      return subs.map((s) => {
        const q = parseFloat(s.qty), r = parseFloat(s.rate);
        let amt;
        if (s.kind === "gcfee") {
          amt = gcFeeAmount(s);
        } else if (s.kind === "labor") {
          amt = laborAmount(s);
        } else {
          amt = parseFloat(s.amount);
          if (isNaN(amt) && !isNaN(q) && !isNaN(r)) amt = q * r;
        }
        let desc;
        if (s.kind === "gcfee") desc = gcFeeDescription(s);
        else if (s.kind === "labor") desc = laborDescription(s, phase);
        else desc = s.desc;
        return {
          qty: s.qty, desc, rate: s.rate,
          amount: isNaN(amt) ? 0 : amt, confidence: s.confidence,
        };
      });
    }
    return items.map((it) => {
      const q = parseFloat(it.qty), r = parseFloat(it.rate);
      let amt = parseFloat(it.amount);
      if (isNaN(amt) && !isNaN(q) && !isNaN(r)) amt = q * r;
      return { ...it, amount: isNaN(amt) ? 0 : amt };
    });
  }, [entity, items, subs, phase]);

  const itemsTotal = useMemo(
    () => lineItems.reduce((s, it) => s + (it.amount || 0), 0),
    [lineItems]
  );

  const feeBase = useMemo(() => {
    if (!entity || !entity.hasFee) return 0;
    return parseFloat(feeBaseManual) || 0;
  }, [entity, feeBaseManual]);

  // DesignWorks-style standing fee (auto 20%). Distinct from the
  // per-line fee rows (GC/PM/Supervision) which are calculated by
  // the top-level feeAmount() helper. Named entityFeeAmount to avoid
  // shadowing.
  const entityFeeAmount = entity && entity.hasFee
    ? feeBase * entity.feeRate : 0;
  const balanceDue = itemsTotal + entityFeeAmount;

  // Build a mechanical first-draft summary from current line items.
  // Used as the pre-fill for the editable description field on Review.
  const buildSummaryDraft = useCallback(() => {
    // Draws always invoice for the PREVIOUS month, so the summary
    // names the month before the invoice date. Parse the YYYY-MM-DD
    // parts directly to avoid timezone roll-back on the 1st.
    const MONTHS = ["January", "February", "March", "April", "May",
      "June", "July", "August", "September", "October", "November",
      "December"];
    let monthIdx, year;
    const m = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = parseInt(m[1], 10);
      monthIdx = parseInt(m[2], 10) - 1;   // 0-based
    } else {
      const d = new Date();
      year = d.getFullYear();
      monthIdx = d.getMonth();
    }
    // step back one month, wrapping across the year boundary
    monthIdx -= 1;
    if (monthIdx < 0) { monthIdx = 11; year -= 1; }
    const month = MONTHS[monthIdx];

    const items = lineItems
      .map((it) => (it.desc || "").trim())
      .filter((d) => d.length > 0);
    if (items.length === 0) {
      return `Invoice for ${month} ${year}.`;
    }
    return `Invoice for ${month} ${year} for the following items: `
      + items.join("; ") + ".";
  }, [date, lineItems]);

  // When the user lands on the Review step for the first time, pre-fill
  // the summary mechanically. Don't overwrite their edits on revisits.
  useEffect(() => {
    if (steps[step] === "Review" && !summaryAutofilled) {
      setDescriptionSummary(buildSummaryDraft());
      setSummaryAutofilled(true);
    }
  }, [step, summaryAutofilled, buildSummaryDraft]);

  const steps = !entity
    ? ["Type", "Client", "Number", "Date", "Items", "Review"]
    : entity.uploadsItems
      ? ["Type", "Phase", "Client", "Draw #", "Date",
         "Upload subs", "Review"]
      : ["Type", "Client", "Invoice #", "Date", "Line items",
         "Fee", "Review"];

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const canProceed = () => {
    switch (steps[step]) {
      case "Type": return !!entityKey;
      case "Phase": return !!phase;
      case "Client": return billTo.trim().length > 0;
      case "Draw #":
      case "Invoice #": return number.trim().length > 0;
      case "Date": return !!date;
      case "Upload subs":
        return subs.length > 0 && parsing === 0;
      case "Line items":
        return items.some((i) => i.desc.trim());
      default: return true;
    }
  };

  /* manual line items (DesignWorks) */
  const updateItem = (id, field, val) =>
    setItems((arr) =>
      arr.map((it) => (it.id === id ? { ...it, [field]: val } : it)));
  const addItem = () =>
    setItems((arr) => [...arr,
      { id: nextId(), qty: "1", desc: "", rate: "", amount: "" }]);
  const removeItem = (id) =>
    setItems((arr) => arr.length > 1
      ? arr.filter((it) => it.id !== id) : arr);

  /* sub invoices (Partners uploads) */
  const onFiles = useCallback((fileList) => {
    const files = Array.from(fileList);
    setParsing((p) => p + files.length);
    files.forEach(async (file) => {
      const row = await parseSubInvoice(file);
      setSubs((arr) => [...arr, row]);
      setParsing((p) => Math.max(0, p - 1));
    });
  }, []);

  const updateSub = (id, patch) =>
    setSubs((arr) => arr.map((s) =>
      (s.id === id ? { ...s, ...patch } : s)));
  const removeSub = (id) =>
    setSubs((arr) => arr.filter((s) => s.id !== id));
  const addManualSub = () =>
    setSubs((arr) => [...arr, {
      id: nextId(), source: "manual entry", kind: "manual",
      confidence: "high", qty: "1", rate: "", desc: "", amount: "",
      rawText: [], showRaw: false, pageCount: 0,
      detected: { value: 0, basis: "manual" }, note: null,
    }]);
  const addFeeSub = (feeTypeKey) =>
    setSubs((arr) => [...arr, {
      id: nextId(),
      source: FEE_TYPES[feeTypeKey].label,
      kind: "gcfee", feeType: feeTypeKey,
      confidence: "high", qty: "1", rate: "", desc: "", amount: "",
      gcMonth: "", gcYear: "", gcPct: "", gcBase: "",
      rawText: [], showRaw: false, pageCount: 0,
      detected: { value: 0, basis: "manual" }, note: null,
    }]);
  // Back-compat alias (the existing GC Fee button calls this name).
  const addGcFeeSub = () => addFeeSub("gc");

  const addLaborSub = (laborPerson) =>
    setSubs((arr) => [...arr, {
      id: nextId(), source: LABOR_PEOPLE[laborPerson].fullName,
      kind: "labor", confidence: "high",
      qty: "1", rate: "", desc: "", amount: "",
      laborPerson,
      laborHours: "",
      // No per-row category is stored. Phased people (Miller) take
      // their category live from the draw's phase via
      // laborCategory(s, phase); fixed-category people (Rath, Ladnier,
      // Habermaas) ignore phase entirely.
      // Optional hours-source PDF (BT Daily Log for phased crew,
      // email for design). Empty until the user uploads one.
      laborSource: "", laborEntries: [], laborBasis: "",
      laborSourceOk: false,
      rawText: [], showRaw: false, pageCount: 0,
      detected: { value: 0, basis: "manual" }, note: null,
    }]);

  /* ============================================================
     STYLES — design-system tokens applied to layout
     ============================================================ */
  const S = {
    shell: {
      minHeight: "100vh", background: T.cream50,
      fontFamily: FONT.body, color: T.burg900,
      padding: "0 0 60px",
    },
    masthead: {
      borderBottom: `2px solid ${T.burg700}`,
      padding: "20px 32px 16px",
      display: "flex", alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 24, background: T.cream100,
    },
    brand: { display: "flex", alignItems: "center", gap: 14 },
    brandMark: {
      width: 44, height: 44, borderRadius: "50%",
      background: T.burg700, color: T.gold300,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT.display, fontSize: 22, fontWeight: 400,
      letterSpacing: ".02em",
    },
    brandName: {
      fontFamily: FONT.ui, fontSize: 22, fontWeight: 800,
      letterSpacing: ".08em", textTransform: "uppercase",
      color: T.burg800, lineHeight: 1,
    },
    brandSub: {
      fontFamily: FONT.mono, fontSize: 10, color: T.gold700,
      letterSpacing: ".14em", textTransform: "uppercase",
      marginTop: 3,
    },
    suiteLabel: {
      fontFamily: FONT.display, fontStyle: "italic",
      fontSize: 16, color: T.cream400, letterSpacing: ".02em",
    },
    grid: {
      maxWidth: 1200, margin: "32px auto", padding: "0 28px",
      display: "grid", gridTemplateColumns: "minmax(0, 1fr) 480px",
      gap: 32, alignItems: "start",
    },
    card: {
      background: T.cream100,
      border: `1px solid ${T.cream300}`,
      borderRadius: 6, overflow: "hidden",
      boxShadow: T.shadowMd,
    },
    cardHead: {
      padding: "16px 24px",
      background: T.cream200,
      borderBottom: `1px solid ${T.cream300}`,
      display: "flex", alignItems: "center", gap: 12,
    },
    cardTitle: {
      fontFamily: FONT.ui, fontSize: 14, fontWeight: 700,
      letterSpacing: ".08em", textTransform: "uppercase",
      color: T.burg800,
    },
    cardBody: { padding: "28px 30px" },
    sectionTitle: {
      fontFamily: FONT.ui, fontSize: 11, fontWeight: 700,
      letterSpacing: ".2em", textTransform: "uppercase",
      color: T.gold500,
      borderBottom: `1px solid ${T.cream300}`,
      paddingBottom: 8, marginBottom: 18,
    },
    h: {
      fontFamily: FONT.display, fontSize: 32, fontWeight: 600,
      color: T.burg800, lineHeight: 1.15, margin: "0 0 8px",
    },
    sub: {
      fontFamily: FONT.body, fontSize: 14, color: T.burg800,
      margin: "0 0 24px", lineHeight: 1.6, fontStyle: "italic",
    },
    label: {
      display: "block",
      fontFamily: FONT.mono, fontSize: 10.5,
      letterSpacing: ".12em", textTransform: "uppercase",
      color: T.gold700, marginBottom: 6, fontWeight: 500,
    },
    btn: (variant, disabled) => {
      const base = {
        fontFamily: FONT.ui, fontWeight: 700,
        letterSpacing: ".06em", textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        border: "none", borderRadius: 4,
        padding: "10px 24px", fontSize: 12.5,
        transition: "all .15s ease",
        boxShadow: variant === "ghost" ? "none" : T.shadowSm,
      };
      if (disabled) return { ...base, background: T.cream300,
        color: T.cream400 };
      if (variant === "primary")
        return { ...base, background: T.burg700, color: T.cream50 };
      if (variant === "gold")
        return { ...base, background: T.gold500, color: T.burg900 };
      if (variant === "secondary") return {
        ...base, background: "transparent",
        color: T.burg700,
        border: `1.5px solid ${T.burg700}`,
        padding: "8.5px 22.5px",
      };
      return { ...base, background: "transparent",
        color: T.burg600, boxShadow: "none",
        padding: "8px 16px" };
    },
    nav: {
      display: "flex", justifyContent: "space-between",
      marginTop: 32, paddingTop: 22,
      borderTop: `1px solid ${T.cream300}`,
    },
  };

  /* ---- step indicator: gold underline under active, mono labels ---- */
  function StepDots() {
    return (
      <div style={{
        display: "flex", gap: 0, flexWrap: "wrap",
        marginBottom: 24, borderBottom: `1px solid ${T.cream300}`,
      }}>
        {steps.map((label, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <span key={label} style={{
              padding: "10px 14px 10px 0",
              marginRight: 12,
              fontFamily: FONT.mono, fontSize: 10.5,
              fontWeight: 500, letterSpacing: ".12em",
              textTransform: "uppercase",
              color: active ? T.burg700
                : done ? T.gold700 : T.cream400,
              borderBottom: active
                ? `2px solid ${T.gold500}`
                : "2px solid transparent",
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}>{String(i + 1).padStart(2, "0")} {label}</span>
          );
        })}
      </div>
    );
  }

  /* ============================================================
     STEP RENDERERS
     ============================================================ */

  function renderTypeStep() {
    return (
      <>
        <h2 style={S.h}>Which invoice are you creating?</h2>
        <p style={S.sub}>
          This sets the branding, the fee handling, and how line items
          are gathered.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          {Object.values(ENTITIES).map((e) => {
            const sel = entityKey === e.key;
            return (
              <button key={e.key} onClick={() => {
                  setEntityKey(e.key);
                  setPhase(null);   // phase only applies to Partners;
                                    // clear any stale choice on switch
                }}
                style={{
                  textAlign: "left", padding: "20px 22px",
                  border: `1.5px solid ${sel ? T.burg700 : T.cream300}`,
                  background: sel ? T.cream50 : T.cream50,
                  borderRadius: 6, cursor: "pointer",
                  boxShadow: sel ? T.shadowMd : T.shadowSm,
                  display: "block", width: "100%",
                }}>
                <div style={{
                  fontFamily: FONT.display, fontSize: 22,
                  color: T.burg800, marginBottom: 6, lineHeight: 1.1,
                }}>{e.name}</div>
                <div style={{
                  fontFamily: FONT.mono, fontSize: 10.5,
                  color: T.gold700, letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}>
                  {e.numberLabel} &nbsp;·&nbsp;{" "}
                  {e.hasFee
                    ? `${Math.round(e.feeRate * 100)}% ${e.feeLabel}`
                    : "GC Fee as line item"}
                  {" "}&nbsp;·&nbsp;{" "}
                  {e.uploadsItems
                    ? "one line per uploaded sub invoice"
                    : "line items entered manually"}
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function renderPhaseStep() {
    const PHASES = [
      {
        key: "preconstruction",
        name: "Pre-Construction",
        detail: "Project Management Fee · Mark Miller bills as "
          + "Pre-Construction Trilogy Labor",
      },
      {
        key: "construction",
        name: "Construction",
        detail: "GC Fee + Trilogy Supervision Fee · Mark Miller "
          + "bills as Construction Trilogy Labor",
      },
    ];
    return (
      <>
        <h2 style={S.h}>What phase is this draw?</h2>
        <p style={S.sub}>
          This sets which fees and labor categories you&rsquo;ll see
          on the next steps, so nothing gets missed or mixed up.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          {PHASES.map((p) => {
            const sel = phase === p.key;
            return (
              <button key={p.key} onClick={() => setPhase(p.key)}
                style={{
                  textAlign: "left", padding: "20px 22px",
                  border: `1.5px solid ${sel ? T.burg700 : T.cream300}`,
                  background: T.cream50,
                  borderRadius: 6, cursor: "pointer",
                  boxShadow: sel ? T.shadowMd : T.shadowSm,
                  display: "block", width: "100%",
                }}>
                <div style={{
                  fontFamily: FONT.display, fontSize: 22,
                  color: T.burg800, marginBottom: 6, lineHeight: 1.1,
                }}>{p.name}</div>
                <div style={{
                  fontFamily: FONT.mono, fontSize: 10.5,
                  color: T.gold700, letterSpacing: ".08em",
                  textTransform: "uppercase", lineHeight: 1.5,
                }}>{p.detail}</div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function renderItemsStep() {
    return (
      <>
        <h2 style={S.h}>Add the line items.</h2>
        <p style={S.sub}>
          Amount auto-fills as Quantity &times; Rate, but you can type
          it directly on rows where Rate isn&rsquo;t a true unit price.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((it) => {
            const q = parseFloat(it.qty), r = parseFloat(it.rate);
            let amt = parseFloat(it.amount);
            if (isNaN(amt) && !isNaN(q) && !isNaN(r)) amt = q * r;
            return (
              <div key={it.id} style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 64px 96px 24px",
                gap: 8, alignItems: "center",
              }}>
                <input style={inputStyle()} value={it.qty} placeholder="Qty"
                  onChange={(e) => updateItem(it.id, "qty", e.target.value)} />
                <input style={inputStyle()} value={it.desc}
                  placeholder="Description"
                  onChange={(e) => updateItem(it.id, "desc", e.target.value)} />
                <input style={inputStyle()} value={it.rate} placeholder="Rate"
                  onChange={(e) => updateItem(it.id, "rate", e.target.value)} />
                <input style={{ ...inputStyle(), textAlign: "right" }}
                  value={it.amount}
                  placeholder={!isNaN(amt) ? amt.toFixed(2) : "Amount"}
                  onChange={(e) =>
                    updateItem(it.id, "amount", e.target.value)} />
                <button onClick={() => removeItem(it.id)} style={{
                  border: "none", background: "none",
                  cursor: "pointer", color: T.cream400,
                  fontSize: 17, padding: 0,
                }}>&times;</button>
              </div>
            );
          })}
        </div>
        <button onClick={addItem} style={{
          ...S.btn("secondary", false), marginTop: 16,
        }}>+ Add line</button>
      </>
    );
  }

  function renderUploadStep() {
    return (
      <>
        <h2 style={S.h}>Upload the subcontractor invoices.</h2>
        <p style={S.sub}>
          Each PDF becomes one line on the Trilogy invoice. Construct
          reads the total and vendor; you confirm. The original PDFs
          are kept and appended to the final invoice packet as backup.
        </p>
        <div
          onClick={() => fileRef.current && fileRef.current.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) onFiles(e.dataTransfer.files);
          }}
          style={{
            border: `1.5px dashed ${T.burg500}`, borderRadius: 6,
            padding: "32px 20px", textAlign: "center",
            cursor: "pointer",
            background: T.burg100,
            color: T.burg700, fontFamily: FONT.bodySm, fontSize: 14,
          }}>
          <div style={{ fontSize: 26, marginBottom: 6,
            color: T.burg600 }}>&#8682;</div>
          <span style={{ fontFamily: FONT.ui, fontWeight: 700,
            letterSpacing: ".06em", textTransform: "uppercase",
            fontSize: 13 }}>
            Drop subcontractor invoice PDFs here
          </span>
          <div style={{ marginTop: 4, fontSize: 12, color: T.burg600,
            fontStyle: "italic" }}>
            or click to browse
          </div>
          <input ref={fileRef} type="file" multiple hidden
            accept=".pdf,image/*"
            onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </div>

        {parsing > 0 && (
          <div style={{
            marginTop: 14, fontFamily: FONT.mono, fontSize: 12,
            color: T.burg700, letterSpacing: ".06em",
          }}>
            READING {parsing} FILE{parsing > 1 ? "S" : ""}…
          </div>
        )}

        {subs.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{
              fontFamily: FONT.mono, fontSize: 10.5, fontWeight: 500,
              letterSpacing: ".12em", textTransform: "uppercase",
              color: T.gold700, marginBottom: 10,
            }}>
              One line per sub invoice — review &amp; confirm
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[...subs]
                .map((s, i) => ({ s, i }))
                .sort((a, b) => {
                  const o = { low: 0, medium: 1, high: 2 };
                  return o[a.s.confidence] - o[b.s.confidence];
                })
                .map(({ s }) => (
                  <SubRow key={s.id} s={s} phase={phase}
                    updateSub={updateSub} removeSub={removeSub} />
                ))}
            </div>
          </div>
        )}

        {phase && (
          <div style={{
            marginTop: 16, marginBottom: 4,
            fontFamily: FONT.mono, fontSize: 10,
            letterSpacing: ".1em", textTransform: "uppercase",
            color: T.gold700,
          }}>
            {phase === "preconstruction"
              ? "Pre-Construction phase — fees for this phase shown below"
              : "Construction phase — fees for this phase shown below"}
          </div>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 8,
          flexWrap: "wrap" }}>
          <button onClick={addManualSub}
            style={S.btn("secondary", false)}>
            + Add line with no document
          </button>
          {/* Pre-construction: Project Management Fee only. */}
          {phase === "preconstruction" && (
            <button onClick={() => addFeeSub("projectmgmt")}
              style={S.btn("secondary", false)}>
              + Project Management Fee
            </button>
          )}
          {/* Construction: GC Fee + Trilogy Supervision Fee. */}
          {phase === "construction" && (
            <button onClick={() => addFeeSub("gc")}
              style={S.btn("secondary", false)}>
              + GC Fee
            </button>
          )}
          {phase === "construction" && (
            <button onClick={() => addFeeSub("supervision")}
              style={S.btn("secondary", false)}>
              + Trilogy Supervision Fee
            </button>
          )}
          {/* If no phase was set (older drafts), show all fees so
              nothing is unreachable. */}
          {!phase && (
            <>
              <button onClick={() => addFeeSub("gc")}
                style={S.btn("secondary", false)}>
                + GC Fee
              </button>
              <button onClick={() => addFeeSub("projectmgmt")}
                style={S.btn("secondary", false)}>
                + Project Management Fee
              </button>
              <button onClick={() => addFeeSub("supervision")}
                style={S.btn("secondary", false)}>
                + Trilogy Supervision Fee
              </button>
            </>
          )}
          <button onClick={() => addLaborSub("rath")}
            style={S.btn("secondary", false)}>
            + Michael Rath hours
          </button>
          <button onClick={() => addLaborSub("miller")}
            style={S.btn("secondary", false)}>
            + Mark Miller hours
          </button>
          <button onClick={() => addLaborSub("ladnier")}
            style={S.btn("secondary", false)}>
            + Peyton Ladnier hours
          </button>
          <button onClick={() => addLaborSub("habermaas")}
            style={S.btn("secondary", false)}>
            + Christiana Habermaas hours
          </button>
        </div>
      </>
    );
  }

  function renderFeeStep() {
    return (
      <>
        <h2 style={S.h}>{entity.feeLabel}</h2>
        <p style={S.sub}>
          This fee is always {Math.round(entity.feeRate * 100)}% for
          Trilogy DesignWorks, calculated from this invoice&rsquo;s
          line items.
        </p>
        <label style={S.label}>
          Fee base — amount the {Math.round(entity.feeRate * 100)}%
          applies to
        </label>
        <div style={{ display: "flex", gap: 12,
          alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...inputStyle(), maxWidth: 260 }}
            value={feeBaseManual}
            onChange={(e) => setFeeBaseManual(e.target.value)}
            placeholder="0.00" />
          <button
            onClick={() => setFeeBaseManual(itemsTotal.toFixed(2))}
            style={S.btn("ghost", false)}>
            Use line-item total ({money(itemsTotal)})
          </button>
        </div>
        <div style={{
          marginTop: 28, padding: "18px 22px",
          background: T.gold100,
          border: `1px solid ${T.gold400}`,
          borderRadius: 6, fontFamily: FONT.body, fontSize: 14,
          color: T.burg900,
        }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 11,
            color: T.gold700, letterSpacing: ".12em",
            textTransform: "uppercase" }}>
            Calculated Fee
          </span>
          <div style={{ marginTop: 6, display: "flex",
            justifyContent: "space-between", alignItems: "baseline" }}>
            <span>{money(feeBase)} &times;{" "}
              {Math.round(entity.feeRate * 100)}%</span>
            <span style={{ fontFamily: FONT.display, fontSize: 28,
              color: T.burg700 }}>{money(entityFeeAmount)}</span>
          </div>
        </div>
      </>
    );
  }

  function renderReview() {
    return (
      <>
        <h2 style={S.h}>Review &amp; generate.</h2>
        <p style={S.sub}>
          The preview on the right is the finished invoice. Step back
          to fix anything, then generate.
        </p>
        <div style={{ display: "grid", gap: 0,
          border: `1px solid ${T.cream300}`,
          borderRadius: 6, overflow: "hidden",
          background: T.cream50 }}>
          {[
            ["Invoice type", entity.name],
            ["Bill To", billTo || "—"],
            [entity.numberLabel, number || "—"],
            ["Date", date],
            ["Line items", `${lineItems.length} · ${money(itemsTotal)}`],
            ...(entity.hasFee
              ? [[entity.feeLabel,
                  `${money(feeBase)} × ${Math.round(entity.feeRate*100)}% = ${money(entityFeeAmount)}`]]
              : []),
            ["Balance Due", money(balanceDue)],
          ].map(([k, v], i, arr) => {
            const last = i === arr.length - 1;
            return (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "12px 18px",
                background: last ? T.burg700 : "transparent",
                color: last ? T.cream50 : T.burg900,
                borderTop: i > 0 && !last
                  ? `1px solid ${T.cream200}` : "none",
                alignItems: "baseline",
              }}>
                <span style={{
                  fontFamily: FONT.mono, fontSize: 10.5,
                  letterSpacing: ".1em", textTransform: "uppercase",
                  color: last ? T.gold300 : T.gold700,
                }}>{k}</span>
                <span style={{
                  fontFamily: last ? FONT.display : FONT.body,
                  fontSize: last ? 22 : 14,
                  fontWeight: last ? 400 : 400,
                }}>{v}</span>
              </div>
            );
          })}
        </div>

        {/* Editable invoice description summary. Pre-filled mechanically
            from line items; user rewrites it into prose before generating. */}
        <div style={{
          marginTop: 22, padding: "16px 20px",
          background: T.cream100,
          border: `1px solid ${T.cream300}`, borderRadius: 6,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 6,
          }}>
            <div style={{
              fontFamily: FONT.mono, fontSize: 10.5,
              letterSpacing: ".12em", textTransform: "uppercase",
              color: T.gold700,
            }}>
              Invoice Description Summary
            </div>
            <button
              onClick={() => setDescriptionSummary(buildSummaryDraft())}
              style={{
                border: "none", background: "none", padding: 0,
                cursor: "pointer", color: T.burg700,
                textDecoration: "underline",
                fontFamily: FONT.mono, fontSize: 10,
              }}>regenerate from items</button>
          </div>
          <div style={{
            fontFamily: FONT.bodySm, fontSize: 11.5,
            color: T.burg800, fontStyle: "italic",
            marginBottom: 8, lineHeight: 1.5,
          }}>
            Pre-filled from your line items. Rewrite it in your own
            voice — this prints at the bottom of the invoice as the
            "Description of Invoice."
          </div>
          <textarea
            value={descriptionSummary}
            onChange={(e) => setDescriptionSummary(e.target.value)}
            rows={4}
            style={{
              ...inputStyle(),
              minHeight: 80, resize: "vertical",
              fontFamily: FONT.body, fontSize: 13,
              lineHeight: 1.55,
            }} />
        </div>

        {entity.uploadsItems && (
          <div style={{
            marginTop: 22, padding: "18px 22px",
            background: T.cream200,
            border: `1px solid ${T.cream300}`, borderRadius: 6,
          }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10.5,
              letterSpacing: ".12em", textTransform: "uppercase",
              color: T.gold700, marginBottom: 4 }}>
              Invoice Packet — what goes in it
            </div>
            <div style={{ fontFamily: FONT.bodySm, fontSize: 12,
              color: T.cream400, fontStyle: "italic", marginBottom: 12,
              lineHeight: 1.5 }}>
              The finished packet is the invoice page plus every
              subcontractor invoice stapled behind it as backup, in
              this order:
            </div>
            <div style={{ fontFamily: FONT.bodySm, fontSize: 13,
              color: T.burg800, lineHeight: 1.7 }}>
              <div>1. Trilogy {entity.key === "partners"
                ? "Partners" : "DesignWorks"} invoice page
                <span style={{ color: T.cream400 }}> (the PDF you
                download below)</span></div>
              {subs.filter((s) => s.pageCount > 0).map((s, i) => (
                <div key={s.id}>
                  {i + 2}. {s.desc.replace(/\s*—\s*$/, "")
                    || "Sub invoice"} — {s.source}{" "}
                  <span style={{ color: T.cream400 }}>
                    ({s.pageCount}p, stamped)</span>
                </div>
              ))}
              {subs.some((s) => s.kind === "manual" ||
                                  s.kind === "gcfee" ||
                                  (s.kind === "labor" && !s.laborSource)) && (
                <div style={{ marginTop: 6, fontStyle: "italic",
                  color: T.cream400 }}>
                  Manual, GC Fee, and Trilogy Labor lines without an
                  uploaded source PDF have no backup page — they don't
                  appear in the list above.
                </div>
              )}
            </div>

            {/* Step-by-step for assembling the packet with the
                drag-and-drop app. */}
            <div style={{
              marginTop: 16, paddingTop: 14,
              borderTop: `1px solid ${T.cream300}`,
            }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 10.5,
                letterSpacing: ".12em", textTransform: "uppercase",
                color: T.gold700, marginBottom: 10 }}>
                How to build the packet
              </div>
              <ol style={{ margin: 0, paddingLeft: 20,
                fontFamily: FONT.bodySm, fontSize: 13,
                color: T.burg800, lineHeight: 1.6 }}>
                <li style={{ marginBottom: 8 }}>
                  Click <strong>Generate invoice PDF</strong> below and
                  save it.
                </li>
                <li style={{ marginBottom: 8 }}>
                  Make a folder for this draw (the Desktop is fine).
                  Put the invoice and each subcontractor PDF in it,
                  named with a number in front so they sort in invoice
                  order:
                  <div style={{
                    marginTop: 6, padding: "10px 12px",
                    background: T.cream50,
                    border: `1px solid ${T.cream300}`,
                    borderRadius: 4, fontFamily: FONT.mono,
                    fontSize: 11, color: T.burg800, lineHeight: 1.8,
                  }}>
                    <div>00_invoice.pdf</div>
                    {subs.filter((s) => s.pageCount > 0).map((s, i) => {
                      const slug = (s.desc.replace(/\s*—\s*$/, "")
                        || "sub")
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "_")
                        .replace(/^_+|_+$/g, "")
                        .slice(0, 28);
                      const num = String(i + 1).padStart(2, "0");
                      return (
                        <div key={s.id}>{num}_{slug}.pdf</div>
                      );
                    })}
                    {subs.filter((s) => s.pageCount > 0).length === 0 && (
                      <div style={{ color: T.cream400 }}>
                        01_first_sub.pdf, 02_second_sub.pdf, …
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11.5,
                    color: T.cream400, fontStyle: "italic" }}>
                    A photo instead of a PDF? Open it in Preview →
                    File → Export as PDF first.
                  </div>
                </li>
                <li style={{ marginBottom: 8 }}>
                  Drag the <strong>folder</strong> onto the{" "}
                  <strong>PacketAssembler</strong> app icon.
                </li>
                <li>
                  Click <strong>Open Folder</strong> in the message —
                  your finished <strong>PACKET.pdf</strong> is inside,
                  with a contents page and every sub stamped by line.
                </li>
              </ol>
              <div style={{ marginTop: 10, fontFamily: FONT.bodySm,
                fontSize: 11.5, color: T.cream400, fontStyle: "italic",
                lineHeight: 1.5 }}>
                First time on this Mac? See MAC_APP_SETUP.txt for the
                one-time setup. The browser downloads the invoice page;
                stapling the subs behind it happens in the app.
              </div>
            </div>
          </div>
        )}

        <button
          disabled={genBusy}
          onClick={async () => {
            setGenBusy(true);
            try {
              const name = await generateInvoicePdf({
                entity, billTo, number, date, lineItems,
                itemsTotal, feeBase,
                feeAmount: entityFeeAmount,
                balanceDue,
                descriptionSummary,
              });
              setGenMsg(`Downloaded ${name}`);
            } catch (err) {
              setGenMsg("Couldn't generate the PDF: " + err.message);
            } finally {
              setGenBusy(false);
            }
          }}
          style={{ ...S.btn("primary", genBusy),
            marginTop: 24, width: "100%", padding: "14px 24px",
            fontSize: 13.5 }}>
          {genBusy ? "Generating…" : "Generate invoice PDF"}
        </button>
        {genMsg && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            fontFamily: FONT.bodySm, fontSize: 13,
            background: genMsg.startsWith("Couldn't")
              ? T.errorBg : T.successBg,
            color: genMsg.startsWith("Couldn't")
              ? T.errorText : T.successText,
            border: `1px solid ${genMsg.startsWith("Couldn't")
              ? T.burg500 : "#90C890"}`,
            borderRadius: 4, textAlign: "center",
          }}>
            {genMsg}
          </div>
        )}
      </>
    );
  }

  function renderStep() {
    switch (steps[step]) {
      case "Type": return renderTypeStep();
      case "Phase": return renderPhaseStep();
      case "Client": return (
        <>
          <h2 style={S.h}>Who is this billed to?</h2>
          <p style={S.sub}>
            The client or project name for the Bill To field.
          </p>
          <label style={S.label}>Bill To</label>
          <input style={inputStyle()} value={billTo} autoFocus
            onChange={(e) => setBillTo(e.target.value)}
            placeholder="e.g. Wint Luknic Project" />
        </>
      );
      case "Draw #":
      case "Invoice #": return (
        <>
          <h2 style={S.h}>{entity.numberLabel}?</h2>
          <p style={S.sub}>
            {entity.uploadsItems
              ? "The draw number for this billing cycle."
              : "Your invoice number for this job."}
          </p>
          <label style={S.label}>{entity.numberLabel}</label>
          <input style={inputStyle()} value={number} autoFocus
            onChange={(e) => setNumber(e.target.value)}
            placeholder={entity.uploadsItems
              ? "e.g. 17" : "e.g. WL120124"} />
        </>
      );
      case "Date": return (
        <>
          <h2 style={S.h}>Invoice date?</h2>
          <p style={S.sub}>Defaults to today — change it if needed.</p>
          <label style={S.label}>Date</label>
          <input style={{ ...inputStyle(), maxWidth: 240 }}
            type="date" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </>
      );
      case "Upload subs": return renderUploadStep();
      case "Line items": return renderItemsStep();
      case "Fee": return renderFeeStep();
      case "Review": return renderReview();
      default: return null;
    }
  }

  /* ---- Live preview, mirroring the generated PDF's layout ---- */
  function Preview() {
    if (!entity) {
      return (
        <div style={{
          ...S.card, padding: "60px 30px", textAlign: "center",
          color: T.cream400, fontStyle: "italic",
          fontFamily: FONT.body, fontSize: 14,
        }}>
          Choose an invoice type to see the live preview.
        </div>
      );
    }
    const rows = lineItems.length ? lineItems
      : [{ qty: "", desc: "", rate: "", amount: 0 }];
    return (
      <div style={S.card}>
        <div style={{ ...S.cardHead,
          background: T.cream200 }}>
          <span style={{ ...S.cardTitle }}>Live Preview</span>
          <span style={{ marginLeft: "auto",
            fontFamily: FONT.mono, fontSize: 10,
            letterSpacing: ".12em", textTransform: "uppercase",
            color: T.gold700 }}>
            {entity.key.toUpperCase()}
          </span>
        </div>
        <div style={{ padding: "26px 28px 30px",
          background: T.cream50 }}>
          <div style={{ display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{
              fontFamily: FONT.display, fontSize: 28,
              color: T.burg700, lineHeight: 1, letterSpacing: ".01em",
            }}>INVOICE</div>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              border: `2px solid ${T.burg700}`,
              display: "flex", alignItems: "center",
              justifyContent: "center",
              color: T.burg700, fontSize: 8, textAlign: "center",
              lineHeight: 1.1, padding: 5,
              fontFamily: FONT.ui, fontWeight: 700,
              letterSpacing: ".06em",
            }}>
              {entity.key === "designworks"
                ? "TRILOGY DESIGNWORKS"
                : "TRILOGY PARTNERS"}
            </div>
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 10.5,
            color: T.burg800, lineHeight: 1.55, marginBottom: 14 }}>
            {entity.address.map((l) => <div key={l}>{l}</div>)}
          </div>
          <div style={{ height: 1, background: T.gold500,
            margin: "0 0 14px" }} />
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            border: `1px solid ${T.cream300}`, marginBottom: 14,
          }}>
            {["BILL TO", entity.numberShort.toUpperCase(), "DATE"]
              .map((h) => (
                <div key={h} style={{
                  background: T.cream200,
                  padding: "5px 8px",
                  borderBottom: `1px solid ${T.cream300}`,
                  fontFamily: FONT.mono, fontSize: 9,
                  letterSpacing: ".1em",
                  color: T.gold700,
                }}>{h}</div>
              ))}
            <div style={{ padding: "8px 8px", fontFamily: FONT.body,
              fontSize: 11, color: T.burg900 }}>{billTo || "\u00a0"}</div>
            <div style={{ padding: "8px 8px", fontFamily: FONT.body,
              fontSize: 11, color: T.burg900 }}>{number || "\u00a0"}</div>
            <div style={{ padding: "8px 8px", fontFamily: FONT.body,
              fontSize: 11, color: T.burg900 }}>{date || "\u00a0"}</div>
          </div>
          <div style={{ border: `1px solid ${T.cream300}` }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 60px 90px",
              background: T.burg700,
              color: T.cream50,
              fontFamily: FONT.mono, fontSize: 9,
              letterSpacing: ".1em",
            }}>
              {["QTY", "DESCRIPTION", "RATE", "AMOUNT"].map((h, i) => (
                <div key={h} style={{ padding: "6px 7px",
                  textAlign: i === 3 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            {rows.map((it, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 60px 90px",
                borderBottom: `1px solid ${T.cream200}`,
                fontFamily: FONT.body, fontSize: 10.5,
                color: T.burg900,
              }}>
                <div style={{ padding: "6px 7px",
                  textAlign: "center" }}>{it.qty}</div>
                <div style={{ padding: "6px 7px" }}>
                  {it.desc}
                  {it.confidence && it.confidence !== "high" && (
                    <span style={{ marginLeft: 5, fontSize: 8.5,
                      fontFamily: FONT.mono,
                      color: CONF[it.confidence].color }}>
                      ({CONF[it.confidence].label})
                    </span>
                  )}
                </div>
                <div style={{ padding: "6px 7px" }}>{it.rate}</div>
                <div style={{ padding: "6px 7px",
                  textAlign: "right" }}>
                  {it.amount ? money(it.amount) : "\u00a0"}
                </div>
              </div>
            ))}
            {entity.hasFee && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px",
                background: T.cream100,
                borderBottom: `1px solid ${T.cream200}`,
                fontFamily: FONT.body, fontSize: 10.5,
                color: T.burg800, fontStyle: "italic",
              }}>
                <div style={{ padding: "6px 7px" }}>
                  {entity.feeLabel} — {money(feeBase)} &times;{" "}
                  {Math.round(entity.feeRate * 100)}%
                </div>
                <div style={{ padding: "6px 7px", textAlign: "right",
                  fontStyle: "normal" }}>
                  {entityFeeAmount ? money(entityFeeAmount) : "\u00a0"}
                </div>
              </div>
            )}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 110px",
              background: T.burg700, color: T.cream50,
              alignItems: "baseline",
            }}>
              <div style={{ padding: "10px 8px",
                fontFamily: FONT.mono, fontSize: 9.5,
                letterSpacing: ".12em", textAlign: "right",
                color: T.gold300 }}>BALANCE DUE</div>
              <div style={{ padding: "8px 8px",
                fontFamily: FONT.display, fontSize: 16,
                textAlign: "right" }}>
                {money(balanceDue)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.shell}>
      <div style={S.masthead}>
        <div style={S.brand}>
          <div style={S.brandMark}>C</div>
          <div>
            <div style={S.brandName}>PMM Construct</div>
            <div style={S.brandSub}>Invoice Management</div>
          </div>
        </div>
        <div style={S.suiteLabel}>PMM Tools Suite</div>
      </div>
      <div style={S.grid}>
        <div style={S.card}>
          <div style={S.cardBody}>
            <StepDots />
            {renderStep()}
            <div style={S.nav}>
              <button onClick={back} disabled={step === 0}
                style={S.btn("ghost", step === 0)}>← Back</button>
              {step < steps.length - 1 && (
                <button onClick={next} disabled={!canProceed()}
                  style={S.btn("primary", !canProceed())}>
                  Continue →
                </button>
              )}
            </div>
          </div>
        </div>
        <Preview />
      </div>
      <div style={{
        maxWidth: 1200, margin: "20px auto 0", padding: "20px 28px",
        borderTop: `1px solid ${T.cream300}`,
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", gap: 24,
      }}>
        <div style={{ fontFamily: FONT.display, fontStyle: "italic",
          fontSize: 15, color: T.gold700 }}>
          Boots on the Ground, Eyes on the Sky.
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10,
          color: T.cream400, letterSpacing: ".1em" }}>
          PMM TOOLS SUITE · TRILOGY DESIGN INTELLIGENCE
        </div>
      </div>
    </div>
  );
}
