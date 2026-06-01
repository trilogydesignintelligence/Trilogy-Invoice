#!/usr/bin/env python3
"""
PMM Construct — Subcontractor Invoice OCR (Phase C)
Part of the PMM Tools Suite (Trilogy Design Intelligence).

Phase B reads TEXT-BASED PDFs. Phase C handles the rest: photos
and scanned invoices, where there is no text layer — only pixels.
This tool runs OCR (Tesseract) to recover the text, then applies
the SAME extraction heuristics as Phase B to guess the vendor and
the invoice total.

HONEST SCOPE — read this:
  OCR output is never trusted. A clean flat scan reads well; a
  phone photo of a creased invoice in poor light will have errors
  (misread digits, dropped lines, scrambled layout). Every result
  from this tool is therefore flagged LOW confidence and MUST be
  reviewed by a person before the invoice is finalized. This tool
  produces a head start, not a final answer.

Supported input:
  - Image files: JPG, JPEG, PNG, HEIC, TIFF, BMP
  - Scanned PDFs (no text layer): each page is rasterized + OCR'd

Usage:
  python ocr_sub_invoice.py <image-or-pdf> [output.json]

Output (JSON): the same shape Phase B produces, so a scan flows
into the identical one-line-per-sub review UI.
  {
    "source": "mountain_drywall_scan.png",
    "kind": "scan",
    "confidence": "low",
    "vendor": "Mountain Drywall LLC",
    "detected": {"value": 4300.50, "basis": "labeled total"},
    "amount": "4300.50",
    "raw_text": ["line 1", "line 2", ...],
    "note": "OCR result — verify every figure against the image."
  }

Dependencies: pytesseract, Pillow, pypdfium2 (PDF rasterizing).
Requires the Tesseract binary (apt-get install tesseract-ocr).
"""

import json
import re
import sys

import pytesseract
from PIL import Image, ImageOps, ImageFilter

# ---- shared extraction heuristics (identical logic to Phase B) ----
MONEY_RE = re.compile(
    r"\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})")
TOTAL_WORDS = re.compile(
    r"(balance due|amount due|total due|grand total|invoice total|total)",
    re.I)


def parse_amount(s):
    try:
        return float(s.replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


def detect_total(lines):
    """Labeled-total-first, largest-amount fallback.

    OCR often splits a label and its amount onto separate lines
    (rotation/skew breaks row grouping). So when a 'total' word
    appears on a line with no amount, this also checks the very
    next line for an amount.
    """
    labeled = None
    largest = 0.0
    for idx, ln in enumerate(lines):
        amounts = [parse_amount(m) for m in MONEY_RE.findall(ln)]
        amounts = [a for a in amounts if a is not None]
        for a in amounts:
            if a > largest:
                largest = a
        if TOTAL_WORDS.search(ln) and not re.search(r"subtotal", ln, re.I):
            v = None
            if amounts:
                v = amounts[-1]
            else:
                # OCR split the label from its amount. Scan the next
                # few lines and take the LARGEST amount found — the
                # balance due is almost always the biggest figure
                # near a total label. (A naive "next line" rule can
                # grab a line-item amount instead.)
                near = []
                for j in range(idx + 1, min(idx + 4, len(lines))):
                    near += [parse_amount(m)
                             for m in MONEY_RE.findall(lines[j])]
                near = [a for a in near if a is not None]
                if near:
                    v = max(near)
            if v is not None and (labeled is None or v >= labeled):
                labeled = v
    if labeled is not None:
        return {"value": labeled, "basis": "labeled total"}
    if largest > 0:
        return {"value": largest, "basis": "largest amount"}
    return {"value": 0, "basis": "no amount found"}


def guess_vendor(lines, fallback):
    for ln in lines[:6]:
        if (not MONEY_RE.search(ln) and 2 < len(ln) < 60
                and not re.search(r"invoice", ln, re.I)):
            return ln
    return fallback


# ---- image pre-processing: genuinely improves OCR on photos ----
def preprocess(img):
    """Grayscale, autocontrast, mild sharpen — helps Tesseract on
    uneven phone photos. Upscale small images so text is legible."""
    img = img.convert("L")              # grayscale
    img = ImageOps.autocontrast(img)    # stretch contrast
    w, h = img.size
    if max(w, h) < 1600:                # upscale small captures
        scale = 1600 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def ocr_image(img):
    """Run Tesseract on a PIL image, return cleaned text lines."""
    processed = preprocess(img)
    text = pytesseract.image_to_string(processed)
    lines = [re.sub(r"\s+", " ", ln).strip()
             for ln in text.splitlines()]
    return [ln for ln in lines if ln]


def ocr_pdf_pages(path):
    """Rasterize a scanned PDF and OCR each page."""
    try:
        import pypdfium2 as pdfium
    except ImportError:
        raise RuntimeError(
            "pypdfium2 needed to OCR scanned PDFs "
            "(pip install pypdfium2)")
    pdf = pdfium.PdfDocument(path)
    all_lines = []
    for i in range(len(pdf)):
        page = pdf[i]
        bitmap = page.render(scale=2.5)   # 2.5x for OCR-grade resolution
        img = bitmap.to_pil()
        all_lines.extend(ocr_image(img))
    return all_lines, len(pdf)


def process(path):
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    fallback = re.sub(r"[_\-]+", " ",
                      path.rsplit("/", 1)[-1].rsplit(".", 1)[0])
    fallback = fallback.strip().title() or "Subcontractor"

    page_count = 1
    if ext == "pdf":
        lines, page_count = ocr_pdf_pages(path)
    elif ext in ("jpg", "jpeg", "png", "heic", "tif", "tiff", "bmp"):
        lines = ocr_image(Image.open(path))
    else:
        return {
            "source": path, "kind": "other", "confidence": "low",
            "vendor": fallback, "detected": {"value": 0,
            "basis": "unsupported"}, "amount": "", "raw_text": [],
            "page_count": 0,
            "note": "Unsupported file type for OCR.",
        }

    if not lines:
        return {
            "source": path, "kind": "scan", "confidence": "low",
            "vendor": fallback, "detected": {"value": 0,
            "basis": "OCR found no text"}, "amount": "", "raw_text": [],
            "page_count": page_count,
            "note": "OCR recovered no readable text — enter manually.",
        }

    vendor = guess_vendor(lines, fallback)
    detected = detect_total(lines)

    # Phase C output is ALWAYS low confidence — OCR is never trusted.
    return {
        "source": path,
        "kind": "scan",
        "confidence": "low",
        "vendor": vendor,
        "detected": detected,
        "amount": (str(detected["value"]) if detected["value"] else ""),
        "raw_text": lines,
        "page_count": page_count,
        "note": ("OCR result — verify every figure against the original "
                 "image. OCR can misread digits."),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    result = process(src)

    if out:
        with open(out, "w") as fh:
            json.dump(result, fh, indent=2)
        print(f"OCR result written to {out}")

    # human-readable summary
    print("\n--- OCR extraction summary ---")
    print(f"  Source       : {result['source']}")
    print(f"  Vendor guess : {result['vendor']}")
    d = result["detected"]
    print(f"  Detected total: {d['value']}  ({d['basis']})")
    print(f"  Confidence   : {result['confidence'].upper()}  "
          f"— review required")
    print(f"  Lines of text: {len(result['raw_text'])}")
    if result["raw_text"]:
        print("  First lines  :")
        for ln in result["raw_text"][:6]:
            print(f"     {ln}")
    print(f"  Note         : {result['note']}")
