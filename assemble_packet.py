#!/usr/bin/env python3
"""
PMM Construct — Invoice Packet Assembler
Part of the PMM Tools Suite (Trilogy Design Intelligence).

Takes a generated Trilogy invoice PDF and a set of subcontractor
invoice PDFs, and merges them into ONE multi-page packet:

    [ Trilogy invoice page ]
    [ index / divider page — contents of the packet ]
    [ sub invoice #1 pages, stamped ]
    [ sub invoice #2 pages, stamped ]
    ...

The index page lists every sub invoice with its line number,
vendor, source filename, and the packet page it starts on, so it
works as a table of contents for the backup.

Sub invoices are appended in INVOICE LINE-ITEM ORDER (not upload
order), so reviewers can move line-by-line to the matching backup.

Each appended sub page is lightly STAMPED in the top margin with
its line number and vendor (e.g. "Line 3 - Timberline Porta Potty")
and the whole packet gets a footer page number. The stamp is an
overlay; the subcontractor's original document is not modified.

Usage:
    python assemble_packet.py <manifest.json> <output.pdf>

manifest.json format:
    {
      "invoice_pdf": "Trilogy_Partners_Invoice.pdf",
      "invoice_label": "Trilogy Partners LLC",
      "draw_label": "Draw #17 - Wint Luknic",
      "subs": [
        {"line": 1, "vendor": "Supervision Fee November",
         "pdf": "subs/supervision_nov.pdf"},
        {"line": 2, "vendor": "Timberline Porta Potty",
         "pdf": "subs/timberline.pdf"}
      ]
    }

invoice_label and draw_label are optional (shown on the index
page header). A sub entry with no "pdf" (manual line, no document)
is skipped — it has no backup page and is not listed on the index.
"""

import io
import json
import sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

NAVY = HexColor("#1F3A5F")
GREY = HexColor("#7a7770")


def make_stamp(width, height, header_text, page_label):
    """Build a one-page transparent overlay sized to the target page."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))

    # --- top-margin header band ---
    band_h = 20
    c.setFillColor(HexColor("#EEF2F8"))
    c.rect(0, height - band_h, width, band_h, stroke=0, fill=1)
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.8)
    c.line(0, height - band_h, width, height - band_h)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(14, height - band_h + 6.5, header_text)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(width - 14, height - band_h + 6.5,
                      "Trilogy invoice packet — supporting document")

    # --- footer page number ---
    c.setFillColor(GREY)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(width / 2, 12, page_label)

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def stamp_page(page, header_text, page_label):
    """Overlay a stamp onto an existing page (mutates a copy)."""
    w = float(page.mediabox.width)
    h = float(page.mediabox.height)
    overlay = make_stamp(w, h, header_text, page_label)
    page.merge_page(overlay)
    return page


def build_index_page(width, height, invoice_label, draw_label,
                     entries, total_pages):
    """Build the divider/index page that sits between the invoice and
    the appended sub invoices. `entries` is a list of dicts:
    {line, vendor, source, start_page, page_count}.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    margin = 54

    # title
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin, height - 78, "Invoice Packet — Contents")
    c.setFillColor(GREY)
    c.setFont("Helvetica", 10)
    c.drawString(margin, height - 96, invoice_label + "   ·   " + draw_label)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1)
    c.line(margin, height - 106, width - margin, height - 106)

    # column headers
    y = height - 130
    c.setFillColor(GREY)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(margin, y, "LINE")
    c.drawString(margin + 52, y, "SUBCONTRACTOR INVOICE")
    c.drawRightString(width - margin, y, "PACKET PAGE")
    y -= 6
    c.setStrokeColor(HexColor("#CCCCCC"))
    c.setLineWidth(0.6)
    c.line(margin, y, width - margin, y)
    y -= 18

    # the invoice itself, listed first
    c.setFillColor(HexColor("#23211e"))
    c.setFont("Helvetica", 10)
    c.drawString(margin, y, "—")
    c.drawString(margin + 52, y, "Trilogy invoice")
    c.drawRightString(width - margin, y, "1")
    y -= 20

    # each sub invoice
    for e in entries:
        c.setFillColor(HexColor("#23211e"))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(margin, y, str(e["line"]))
        c.setFont("Helvetica", 10)
        vendor = e["vendor"]
        if len(vendor) > 58:
            vendor = vendor[:57] + "…"
        c.drawString(margin + 52, y, vendor)
        span = (str(e["start_page"]) if e["page_count"] == 1
                else f'{e["start_page"]}–'
                     f'{e["start_page"] + e["page_count"] - 1}')
        c.drawRightString(width - margin, y, span)
        # source filename, small, under the vendor
        c.setFillColor(GREY)
        c.setFont("Helvetica-Oblique", 7.5)
        c.drawString(margin + 52, y - 10, e["source"])
        y -= 26
        if y < 90:   # simple overflow guard for very long packets
            c.setFont("Helvetica-Oblique", 8)
            c.setFillColor(GREY)
            c.drawString(margin, y, "… continued")
            break

    # footer
    c.setFillColor(GREY)
    c.setFont("Helvetica", 7.5)
    c.drawString(margin, 40,
                 "Subcontractor invoices follow, in the order listed above. "
                 "Each is stamped with its line number and vendor.")
    c.drawCentredString(width / 2, 24, f"Packet page 2 of {total_pages}")
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def assemble(manifest_path, out_path):
    with open(manifest_path) as fh:
        manifest = json.load(fh)

    invoice_pdf = manifest["invoice_pdf"]
    invoice_label = manifest.get("invoice_label", "Trilogy Partners LLC")
    draw_label = manifest.get("draw_label", "")
    subs = sorted(manifest.get("subs", []), key=lambda s: s.get("line", 0))

    inv_reader = PdfReader(invoice_pdf)
    invoice_page_count = len(inv_reader.pages)

    # ---- page-count math (index page counts as one slot) ----
    sub_page_counts = []
    docs_with_pdf = []
    for sub in subs:
        pdf_path = sub.get("pdf")
        if not pdf_path:
            sub_page_counts.append(0)
            continue
        n = len(PdfReader(pdf_path).pages)
        sub_page_counts.append(n)
        docs_with_pdf.append(sub)
    sub_pages_total = sum(sub_page_counts)
    INDEX_PAGES = 1 if docs_with_pdf else 0
    total_pages = invoice_page_count + INDEX_PAGES + sub_pages_total

    # where each sub invoice will start in the final packet
    entries = []
    cursor = invoice_page_count + INDEX_PAGES + 1   # 1-based start page
    for sub, n in zip(subs, sub_page_counts):
        if n == 0:
            continue
        entries.append({
            "line": sub.get("line", "?"),
            "vendor": sub.get("vendor", "Subcontractor"),
            "source": sub.get("pdf", ""),
            "start_page": cursor,
            "page_count": n,
        })
        cursor += n

    writer = PdfWriter()

    # ---- 1. Trilogy invoice page(s), unstamped ----
    for pg in inv_reader.pages:
        writer.add_page(pg)

    # ---- 2. divider / index page (only if there are sub invoices) ----
    if INDEX_PAGES:
        w = float(inv_reader.pages[0].mediabox.width)
        h = float(inv_reader.pages[0].mediabox.height)
        writer.add_page(build_index_page(
            w, h, invoice_label, draw_label, entries, total_pages))

    # ---- 3. append each sub invoice, in line order, stamped ----
    running = invoice_page_count + INDEX_PAGES
    appended = 0
    for sub, n in zip(subs, sub_page_counts):
        if n == 0:
            continue
        sub_reader = PdfReader(sub["pdf"])
        line = sub.get("line", "?")
        vendor = sub.get("vendor", "Subcontractor")
        for i, pg in enumerate(sub_reader.pages):
            running += 1
            header = f"Line {line} - {vendor}"
            if n > 1:
                header += f"  (doc page {i + 1} of {n})"
            label = f"Packet page {running} of {total_pages}"
            writer.add_page(stamp_page(pg, header, label))
            appended += 1

    with open(out_path, "wb") as fh:
        writer.write(fh)

    skipped = sum(1 for s, n in zip(subs, sub_page_counts) if n == 0)
    print(f"Packet written: {out_path}")
    print(f"  Trilogy invoice pages : {invoice_page_count}")
    if INDEX_PAGES:
        print(f"  Index / divider page  : 1")
    print(f"  Sub invoices appended : {appended} page(s) "
          f"from {len(docs_with_pdf)} document(s)")
    if skipped:
        print(f"  Manual lines w/o PDF  : {skipped} (no backup page)")
    print(f"  Total packet pages    : {total_pages}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    assemble(sys.argv[1], sys.argv[2])
