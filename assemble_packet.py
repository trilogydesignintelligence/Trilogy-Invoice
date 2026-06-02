#!/usr/bin/env python3
"""
PMM Construct — Invoice Packet Assembler (folder edition)
Part of the PMM Tools Suite (Trilogy Design Intelligence).

WHAT IT DOES
    Takes a FOLDER of PDFs — your generated Trilogy invoice plus the
    subcontractor invoice PDFs — and merges them into ONE packet:

        [ Trilogy invoice page(s) ]
        [ index / contents page ]
        [ sub invoice #1, stamped ]
        [ sub invoice #2, stamped ]
        ...

    No JSON to write. You control the order with a number prefix on
    each filename, and the vendor names are derived from the filenames
    (editable — see below).

HOW TO USE IT (the whole workflow)

    1. Make a folder for the draw, e.g.  ~/Desktop/Draw6/
    2. Put the generated Trilogy invoice in it, named to sort FIRST:
           00_invoice.pdf      (anything starting with 00)
    3. Put each subcontractor invoice in it, numbered in the SAME
       ORDER they appear on the Trilogy invoice:
           01_ferguson_bath.pdf
           02_timberline_porta_potty.pdf
           03_lowes_shelf.pdf
       (Photos? Convert to PDF first — Preview on Mac: File > Export as PDF.)
    4. Run:
           python3 assemble_packet.py ~/Desktop/Draw6
    5. Out comes:
           ~/Desktop/Draw6/PACKET.pdf

FIXING BAD VENDOR NAMES
    The first run also writes  packet_labels.txt  into the folder —
    one line per sub, like:

           01_ferguson_bath.pdf  =  Ferguson Bath
           02_timberline_porta_potty.pdf  =  Timberline Porta Potty

    If a name came out ugly, open that file in TextEdit, fix the text
    on the RIGHT side of the "=", save, and run the command again.
    The script reads packet_labels.txt if it's present and uses your
    names. Delete the file to go back to auto-derived names.

REQUIREMENTS (one-time setup — see SETUP.txt)
    Python 3 and two libraries: pypdf and reportlab.
"""

import io
import os
import re
import sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

# ---- PMM design system palette (burgundy / cream / gold) ----
BURG_700 = HexColor("#7A2818")
BURG_900 = HexColor("#3A0C08")
GOLD_500 = HexColor("#C8922A")
GOLD_700 = HexColor("#8B6020")
CREAM_50 = HexColor("#FDFAF5")
CREAM_200 = HexColor("#EDE5D5")
CREAM_300 = HexColor("#D8CAAA")
CREAM_400 = HexColor("#C4B088")
INK = HexColor("#23211e")

LABELS_FILE = "packet_labels.txt"
OUTPUT_NAME = "PACKET.pdf"


def derive_vendor(filename):
    """Turn '02_timberline_porta_potty.pdf' into 'Timberline Porta Potty'."""
    stem = os.path.splitext(os.path.basename(filename))[0]
    # strip a leading number prefix like "02_" or "02-" or "02 "
    stem = re.sub(r"^\s*\d+\s*[_\-.\s]+", "", stem)
    # underscores / hyphens to spaces
    stem = re.sub(r"[_\-]+", " ", stem).strip()
    # title-case, but keep all-caps tokens (LLC, HVAC) as-is
    words = []
    for w in stem.split():
        words.append(w if (w.isupper() and len(w) > 1) else w.capitalize())
    return " ".join(words) or "Subcontractor"


def sort_key(filename):
    """Sort by the leading number prefix; files without one sort last."""
    m = re.match(r"^\s*(\d+)", os.path.basename(filename))
    return (0, int(m.group(1))) if m else (1, filename.lower())


def collect_pdfs(folder):
    """Return (invoice_name, [sub_names]) ordered by filename number.
    The lowest-numbered PDF (or one whose name contains 'invoice') is
    treated as the Trilogy invoice; the rest are subs in number order.
    """
    pdfs = [f for f in os.listdir(folder)
            if f.lower().endswith(".pdf")
            and f != OUTPUT_NAME
            and not f.startswith(".")]
    if not pdfs:
        return None, []
    pdfs.sort(key=sort_key)

    # Prefer an explicit "invoice" in the name; else the first by sort.
    invoice = None
    for f in pdfs:
        if "invoice" in f.lower() or re.match(r"^\s*0+\D", f):
            invoice = f
            break
    if invoice is None:
        invoice = pdfs[0]

    subs = [f for f in pdfs if f != invoice]
    return invoice, subs


def load_label_overrides(folder):
    """Read packet_labels.txt if present: 'filename = Vendor Name'."""
    path = os.path.join(folder, LABELS_FILE)
    overrides = {}
    if not os.path.exists(path):
        return overrides
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            fname, label = line.split("=", 1)
            overrides[fname.strip()] = label.strip()
    return overrides


def write_label_template(folder, subs, vendors):
    """Write packet_labels.txt so the user can fix bad names and re-run."""
    path = os.path.join(folder, LABELS_FILE)
    with open(path, "w") as fh:
        fh.write("# PMM Construct — packet vendor labels\n")
        fh.write("# Edit the text to the RIGHT of '=' to fix a name,\n")
        fh.write("# then run assemble_packet.py again. Delete this file\n")
        fh.write("# to go back to names derived from the filenames.\n\n")
        for f, v in zip(subs, vendors):
            fh.write(f"{f}  =  {v}\n")


def make_stamp(width, height, header_text, page_label):
    """Transparent overlay: top-margin header band + footer page number."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    band_h = 20
    c.setFillColor(CREAM_200)
    c.rect(0, height - band_h, width, band_h, stroke=0, fill=1)
    c.setStrokeColor(BURG_700)
    c.setLineWidth(0.8)
    c.line(0, height - band_h, width, height - band_h)
    c.setFillColor(BURG_700)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(14, height - band_h + 6.5, header_text)
    c.setFillColor(GOLD_700)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(width - 14, height - band_h + 6.5,
                      "Trilogy invoice packet — supporting document")
    c.setFillColor(CREAM_400)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(width / 2, 12, page_label)
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def stamp_page(page, header_text, page_label):
    w = float(page.mediabox.width)
    h = float(page.mediabox.height)
    page.merge_page(make_stamp(w, h, header_text, page_label))
    return page


def build_index_page(width, height, draw_label, entries, total_pages):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    margin = 54

    c.setFillColor(CREAM_50)
    c.rect(0, 0, width, height, stroke=0, fill=1)

    c.setFillColor(BURG_700)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin, height - 78, "Invoice Packet — Contents")
    if draw_label:
        c.setFillColor(GOLD_700)
        c.setFont("Helvetica", 10)
        c.drawString(margin, height - 96, draw_label)
    c.setStrokeColor(GOLD_500)
    c.setLineWidth(1)
    c.line(margin, height - 106, width - margin, height - 106)

    y = height - 132
    c.setFillColor(GOLD_700)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(margin, y, "LINE")
    c.drawString(margin + 52, y, "SUBCONTRACTOR INVOICE")
    c.drawRightString(width - margin, y, "PACKET PAGE")
    y -= 6
    c.setStrokeColor(CREAM_300)
    c.setLineWidth(0.6)
    c.line(margin, y, width - margin, y)
    y -= 18

    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    c.drawString(margin, y, "—")
    c.drawString(margin + 52, y, "Trilogy invoice")
    c.drawRightString(width - margin, y, "1")
    y -= 20

    for e in entries:
        c.setFillColor(BURG_700)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(margin, y, str(e["line"]))
        c.setFillColor(INK)
        c.setFont("Helvetica", 10)
        vendor = e["vendor"]
        if len(vendor) > 58:
            vendor = vendor[:57] + "…"
        c.drawString(margin + 52, y, vendor)
        span = (str(e["start_page"]) if e["page_count"] == 1
                else f'{e["start_page"]}–'
                     f'{e["start_page"] + e["page_count"] - 1}')
        c.drawRightString(width - margin, y, span)
        c.setFillColor(CREAM_400)
        c.setFont("Helvetica-Oblique", 7.5)
        c.drawString(margin + 52, y - 10, e["source"])
        y -= 26
        if y < 90:
            c.setFont("Helvetica-Oblique", 8)
            c.setFillColor(CREAM_400)
            c.drawString(margin, y, "… continued")
            break

    c.setFillColor(GOLD_700)
    c.setFont("Helvetica", 7.5)
    c.drawString(margin, 40,
                 "Subcontractor invoices follow, in the order listed above. "
                 "Each is stamped with its line number and vendor.")
    c.setFillColor(CREAM_400)
    c.drawCentredString(width / 2, 24, f"Packet page 2 of {total_pages}")
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def assemble(folder):
    folder = os.path.abspath(os.path.expanduser(folder))
    if not os.path.isdir(folder):
        print(f"Not a folder: {folder}")
        sys.exit(1)

    invoice, subs = collect_pdfs(folder)
    if invoice is None:
        print(f"No PDF files found in {folder}")
        print("Put your invoice (named 00_invoice.pdf) and the sub")
        print("invoices (01_..., 02_...) in the folder, then re-run.")
        sys.exit(1)

    overrides = load_label_overrides(folder)
    vendors = [overrides.get(f, derive_vendor(f)) for f in subs]

    # (Re)write the label template so names can be corrected and re-run.
    if subs:
        write_label_template(folder, subs, vendors)

    invoice_path = os.path.join(folder, invoice)
    inv_reader = PdfReader(invoice_path)
    invoice_page_count = len(inv_reader.pages)

    sub_paths = [os.path.join(folder, f) for f in subs]
    sub_page_counts = [len(PdfReader(p).pages) for p in sub_paths]
    sub_pages_total = sum(sub_page_counts)
    INDEX_PAGES = 1 if subs else 0
    total_pages = invoice_page_count + INDEX_PAGES + sub_pages_total

    entries = []
    cursor = invoice_page_count + INDEX_PAGES + 1
    for i, (f, n) in enumerate(zip(subs, sub_page_counts)):
        entries.append({
            "line": i + 1,
            "vendor": vendors[i],
            "source": f,
            "start_page": cursor,
            "page_count": n,
        })
        cursor += n

    writer = PdfWriter()
    for pg in inv_reader.pages:
        writer.add_page(pg)

    if INDEX_PAGES:
        w = float(inv_reader.pages[0].mediabox.width)
        h = float(inv_reader.pages[0].mediabox.height)
        draw_label = os.path.basename(folder)
        writer.add_page(build_index_page(
            w, h, draw_label, entries, total_pages))

    running = invoice_page_count + INDEX_PAGES
    appended = 0
    for i, (p, n) in enumerate(zip(sub_paths, sub_page_counts)):
        sub_reader = PdfReader(p)
        line = i + 1
        vendor = vendors[i]
        for j, pg in enumerate(sub_reader.pages):
            running += 1
            header = f"Line {line} - {vendor}"
            if n > 1:
                header += f"  (doc page {j + 1} of {n})"
            label = f"Packet page {running} of {total_pages}"
            writer.add_page(stamp_page(pg, header, label))
            appended += 1

    out_path = os.path.join(folder, OUTPUT_NAME)
    with open(out_path, "wb") as fh:
        writer.write(fh)

    print(f"\n[ok] Packet written: {out_path}\n")
    print(f"  Trilogy invoice       : {invoice}  ({invoice_page_count} page"
          f"{'s' if invoice_page_count != 1 else ''})")
    if INDEX_PAGES:
        print(f"  Index / contents page : 1")
    print(f"  Sub invoices appended : {appended} page(s) "
          f"from {len(subs)} document(s)")
    for i, (f, n) in enumerate(zip(subs, sub_page_counts)):
        print(f"      {i + 1}. {vendors[i]}  ({f}, {n}p)")
    print(f"  Total packet pages    : {total_pages}")
    if subs:
        print(f"\n  Vendor names came from the filenames. To fix any,")
        print(f"  edit  {LABELS_FILE}  in the folder and run this again.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    assemble(sys.argv[1])
