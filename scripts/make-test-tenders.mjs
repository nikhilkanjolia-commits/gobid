// Generates the test inputs in public/test-tenders/: two realistic (made-up) text tenders,
// one "scanned" PDF with no text, and one broken price list. Page numbers of every clause are
// fixed so the expected answers in expected.json can be checked by hand.
// Run: node scripts/make-test-tenders.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/test-tenders";
mkdirSync(OUT, { recursive: true });

// ---------- minimal PDF writer (Helvetica, one text block per page) ----------
function wrap(line, width = 105) {
  const out = [];
  let rest = line;
  while (rest.length > width) {
    const cut = rest.lastIndexOf(" ", width);
    const at = cut > 40 ? cut : width;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  out.push(rest);
  return out;
}

function pdf(pages, { scanned = false } = {}) {
  const objs = [];
  const add = (s) => objs.push(s) && objs.length;
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const parent = pages.length * 2 + 2;
  const kids = [];
  pages.forEach((lines, i) => {
    let stream;
    if (scanned) {
      // Looks like a scan: only grey boxes, no text operators at all.
      stream = "0.8 g 50 700 495 80 re f 50 560 495 120 re f 50 120 495 400 re f";
    } else {
      const body = lines.flatMap((l) => wrap(l)).slice(0, 62);
      const esc = (s) => s.replace(/[\\()]/g, "\\$&");
      stream =
        "BT /F1 9 Tf 40 800 Td 12 TL " +
        body.map((l) => `(${esc(l)}) '`).join(" ") +
        ` ET BT /F1 8 Tf 280 25 Td (Page ${i + 1} of ${pages.length}) Tj ET`;
    }
    const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  });
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  const root = add(`<< /Type /Catalog /Pages ${parent} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${root} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ---------- boilerplate that fills real tenders ----------
const GCC = [
  "The Contractor shall comply with all applicable laws, statutory rules and regulations in force, including the Indian Electricity Rules and the Central Electricity Authority (Measures relating to Safety and Electric Supply) Regulations.",
  "All materials shall be new, of the best quality, and shall conform to the latest relevant Indian Standard Specifications, with BIS marking wherever applicable.",
  "The Engineer-in-Charge shall have full powers to reject any material or work that does not conform to the specifications, and the Contractor shall remove such material from site at his own cost.",
  "Payment shall be made within 30 days of receipt of the bill duly certified by the Engineer-in-Charge, subject to deduction of statutory taxes at source.",
  "The defect liability period shall be twelve months from the date of completion. Any defect noticed during this period shall be rectified by the Contractor free of cost.",
  "Liquidated damages at the rate of 0.5% of the contract value per week of delay, subject to a maximum of 10%, shall be levied for delay attributable to the Contractor.",
  "The Contractor shall provide all tools, tackles, testing instruments and skilled manpower required for installation, testing and commissioning.",
  "Insulation resistance, earth resistance and continuity tests shall be carried out in the presence of the Engineer-in-Charge and results recorded.",
  "The Contractor shall maintain a site order book and comply with instructions recorded therein within the time specified.",
  "Disputes, if any, shall be settled by arbitration under the Arbitration and Conciliation Act, 1996, and the seat of arbitration shall be the city of the Buyer.",
];
const SPEC = [
  "Miniature Circuit Breakers shall conform to IS/IEC 60898-1, with a breaking capacity not less than 10 kA, C-curve characteristics, and shall be DIN rail mounted.",
  "Residual Current Circuit Breakers shall conform to IS 12640 (Part 1), with a sensitivity of 30 mA for final circuits and 100 mA for sub-main circuits.",
  "Moulded Case Circuit Breakers shall conform to IS/IEC 60947-2, with thermal-magnetic release, rated service breaking capacity Ics = 100% Icu.",
  "LT XLPE armoured cables shall conform to IS 7098 (Part 1), with aluminium conductors, 1.1 kV grade, galvanised steel strip armour and PVC outer sheath.",
  "FRLS PVC insulated copper wires shall conform to IS 694, 1.1 kV grade, multi-strand, with flame retardant low smoke sheathing.",
  "Distribution boards shall be double door, powder coated, with IP 42 protection, complete with busbar, neutral link and earth bar.",
  "LED luminaires shall conform to IS 10322, with power factor above 0.95, THD below 10%, and a minimum efficacy of 100 lumens per watt.",
  "Earthing shall be carried out as per IS 3043 using copper plate or GI pipe electrodes with charcoal and salt, and earth resistance shall not exceed 1 ohm.",
];
function filler(title, paras, start, count) {
  const pages = [];
  for (let p = 0; p < count; p++) {
    const lines = [`${title} (continued)`, ""];
    for (let k = 0; k < 9; k++) {
      const n = start + p * 9 + k;
      lines.push(`${n}. ${paras[(p * 9 + k) % paras.length]}`, "");
    }
    pages.push(lines);
  }
  return pages;
}

// ---------- Tender A: GeM-style, 150 pages, BOQ quantities only ----------
function tenderA() {
  const pages = [];
  pages.push([
    "GeM Bid Document - SAMPLE FOR TESTING (made-up, not a real tender)",
    "Bid Number: GEM/2026/B/5531902",
    "Dated: 14-10-2026",
    "Bid End Date/Time: 05-11-2026 15:00:00",
    "Ministry/State Name: Rajasthan",
    "Department Name: Public Works Department",
    "Office Name: Executive Engineer, Electrical Division-II, Jaipur",
    "Item Category: Supply, Installation, Testing and Commissioning of Internal Electrification and LT Distribution for Government Hospital Block",
    "Estimated Bid Value: 48,60,000",
    "Evaluation Method: Total value wise evaluation",
  ]);
  pages.push([
    "Bid Details",
    "Contract Period: 4 Month(s)",
    "Minimum Average Annual Turnover of the bidder (For 3 Years): 60 Lakh(s)",
    "Years of Past Experience Required for same/similar service: 3 Year(s)",
    "MSE Exemption for Years Of Experience and Turnover: Yes",
    "Startup Exemption for Years Of Experience and Turnover: No",
    "Document required from seller: Experience Criteria, Bidder Turnover, Certificate (Requested in ATC), OEM Authorization Certificate, Additional Doc 1 (Requested in ATC)",
    "Bid to RA enabled: Yes",
    "Type of Bid: Two Packet Bid",
    "Time allowed for Technical Clarifications during technical evaluation: 2 Days",
  ]);
  pages.push([
    "EMD Detail",
    "Advisory Bank: State Bank of India",
    "EMD Amount: 97,200",
    "ePBG Detail",
    "ePBG Percentage(%): 5.00",
    "Duration of ePBG required (Months): 16",
    "Bidders seeking exemption from EMD: Micro and Small Enterprises (MSEs) registered with Udyam are exempted from submission of EMD, subject to uploading valid Udyam certificate with the bid.",
    "The EMD of unsuccessful bidders shall be returned after award of contract.",
  ]);
  pages.push(...filler("General Terms and Conditions on GeM", GCC, 1, 7)); // p4-10
  pages.push(...filler("Technical Specifications", SPEC, 1, 75)); // p11-85
  pages.push([
    "Additional Terms and Conditions (ATC)",
    "1. The bidder shall furnish Manufacturer's Authorization Form (MAF) from the OEM (Havells / Legrand / Schneider) for all switchgear items offered, specific to this bid.",
    "2. The bidder must possess a valid ISO 9001:2015 certificate on the date of bid opening.",
    "3. The bidder shall possess a valid Electrical Contractor Licence (Class A) issued by the Electrical Inspectorate of the State.",
    "4. The successful bidder shall submit as-built drawings and test certificates before final payment.",
    "5. Material shall be supplied only from the approved makes listed in Annexure-III.",
  ]); // p86
  pages.push(...filler("General Conditions of Contract", GCC, 101, 44)); // p87-130
  pages.push([
    "Annexure-III: List of Approved Makes",
    "MCB / RCCB / Distribution Boards: Havells, Legrand, Schneider",
    "MCCB: Havells, Schneider, L&T",
    "LT Cables and FRLS Wires: Polycab, Havells, KEI",
    "LED Luminaires: Havells, Philips",
    "Conduits and accessories: Polycab, Precision, AKG",
    "Any item of a make not listed above shall be rejected.",
  ]); // p131
  pages.push(...filler("Installation Guidelines", SPEC, 601, 8)); // p132-139

  const boq = [
    ["MCB 6A SP C-curve 10kA", "Nos", 120], ["MCB 16A SP C-curve 10kA", "Nos", 180], ["MCB 32A SP C-curve 10kA", "Nos", 60],
    ["MCB 32A DP C-curve 10kA", "Nos", 24], ["MCB 63A FP C-curve 10kA", "Nos", 12], ["RCCB 40A DP 30mA", "Nos", 30],
    ["RCCB 63A FP 100mA", "Nos", 8], ["MCB distribution board 8 way TPN double door", "Nos", 10],
    ["MCB distribution board 12 way SPN double door", "Nos", 18], ["MCCB 100A TP 36kA thermal magnetic release", "Nos", 4],
    ["MCCB 250A TP 36kA thermal magnetic release", "Nos", 2], ["MCCB 100A TP 50kA thermal magnetic release", "Nos", 2],
    ["LED panel light 36W 2x2 ft recessed", "Nos", 140], ["LED batten 20W 4 ft", "Nos", 220],
    ["LT XLPE armoured aluminium cable 4 core 16 sq mm 1.1 kV", "Mtr", 600], ["LT XLPE armoured aluminium cable 4 core 25 sq mm 1.1 kV", "Mtr", 450],
    ["LT XLPE armoured aluminium cable 3.5 core 95 sq mm 1.1 kV", "Mtr", 180], ["LT XLPE armoured aluminium cable 3.5 core 185 sq mm 1.1 kV", "Mtr", 120],
    ["FRLS PVC insulated copper wire 1.5 sq mm single core", "Mtr", 6000], ["FRLS PVC insulated copper wire 2.5 sq mm single core", "Mtr", 4500],
    ["FRLS PVC insulated copper wire 4 sq mm single core", "Mtr", 2000], ["FRLS PVC insulated copper wire 6 sq mm single core", "Mtr", 1200],
    ["PVC rigid conduit 25 mm medium gauge with accessories", "Mtr", 3500], ["GI earthing strip 25x3 mm", "Mtr", 400],
    ["Copper plate earth pit 600x600x3 mm with charcoal and salt complete", "Nos", 6], ["Perforated GI cable tray 300 mm wide", "Mtr", 150],
    ["Street light pole 9 m octagonal with LED fitting 90W", "Nos", 12], ["LT armoured copper cable 4 core 6 sq mm 1.1 kV", "Mtr", 250],
  ];
  const boqPages = [];
  for (let i = 0; i < boq.length; i += 5) {
    const lines = [i === 0 ? "Bill of Quantities (BOQ)" : "Bill of Quantities (BOQ) (continued)", "S.No. | Item Description | Unit | Quantity", ""];
    boq.slice(i, i + 5).forEach(([d, u, q], k) => lines.push(`${i + k + 1} | Supply, installation, testing and commissioning of ${d} | ${u} | ${q}`, ""));
    boqPages.push(lines);
  }
  pages.push(...boqPages); // p140-145
  while (pages.length < 150) pages.push(["Bidder's Undertaking and Declarations", "", ...GCC.slice(0, 6).map((g, k) => `${k + 1}. ${g}`)]);
  return { pages, boqCount: boq.length };
}

// ---------- Tender B: CPWD-style NIT, 64 pages, BOQ with estimated rates ----------
function tenderB() {
  const pages = [];
  pages.push([
    "NOTICE INVITING e-TENDER - SAMPLE FOR TESTING (made-up, not a real tender)",
    "NIT No. 18/EE/ED-IV/2026-27",
    "Name of Work: Electrical installation including LT panel, cabling and lighting for the new Academic Block, Government Polytechnic College, Kota.",
    "Estimated Cost put to tender: Rs. 31,40,000",
    "Period of Completion: 3 (Three) Months",
    "Last date of submission of bids: 12-11-2026 up to 15:00 hrs",
  ]);
  pages.push([
    "Eligibility Criteria",
    "1. The bidder should have satisfactorily completed during the last seven years: three similar works each of value not less than Rs. 20.00 Lakh, or two similar works each of value not less than Rs. 30.00 Lakh, or one similar work of value not less than Rs. 40.00 Lakh.",
    "2. Average annual financial turnover during the last 3 years ending 31st March 2026 should be at least Rs. 1.20 Crore.",
    "3. The bidder must hold a valid ISO 14001 certificate (Environmental Management System) on the date of submission of bid.",
    "4. The bidder must hold a valid Electrical Contractor Licence issued by the competent authority of the State Government.",
    "5. Similar work shall mean electrical installation works including LT panels and cabling in a building.",
  ]);
  pages.push([
    "Earnest Money Deposit",
    "Earnest Money: Rs. 62,800 to be deposited online through the e-procurement portal.",
    "No exemption from Earnest Money shall be granted to any category of bidder, including MSEs.",
    "Relaxation in turnover and experience criteria shall not be available to any category of bidder.",
  ]);
  pages.push(...filler("General Conditions", GCC, 1, 20)); // p4-23
  pages.push([
    "Special Conditions",
    "1. The LT panel shall be manufactured by an L&T authorised panel builder, and the bidder shall submit authorisation from L&T for the panel and MCCBs.",
    "2. All cables shall be of Polycab or KEI make only.",
    "3. Work shall be executed during non-working hours where required by the Principal.",
  ]); // p24
  pages.push(...filler("Technical Specifications", SPEC, 1, 30)); // p25-54
  const rows = [
    ["MCB 16A SP C-curve 10kA", "Nos", 90, 165], ["MCB 32A DP C-curve 10kA", "Nos", 20, 470], ["RCCB 40A DP 30mA", "Nos", 14, 1350],
    ["MCB distribution board 12 way SPN double door", "Nos", 9, 1800], ["MCCB 250A TP 36kA thermal magnetic release", "Nos", 2, 18500],
    ["MCCB 100A TP 25kA thermal magnetic release", "Nos", 3, 7200], ["LED panel light 36W 2x2 ft recessed", "Nos", 85, 2050],
    ["LT XLPE armoured aluminium cable 3.5 core 95 sq mm 1.1 kV", "Mtr", 140, 520], ["LT XLPE armoured aluminium cable 4 core 25 sq mm 1.1 kV", "Mtr", 320, 190],
    ["FRLS PVC insulated copper wire 2.5 sq mm single core", "Mtr", 3800, 22], ["FRLS PVC insulated copper wire 4 sq mm single core", "Mtr", 1500, 35],
    ["PVC rigid conduit 25 mm medium gauge", "Mtr", 2400, 38], ["GI earthing strip 25x3 mm", "Mtr", 250, 85],
    ["Cubicle type LT panel 400A with ACB incomer", "Set", 1, 385000],
  ];
  const lines = ["Schedule of Quantities (BOQ) with estimated rates", "Item | Description | Unit | Qty | Rate (Rs.) | Amount (Rs.)", ""];
  rows.forEach(([d, u, q, r], k) => {
    const amount = k === 6 ? q * r + 10000 : q * r; // item 7 has a deliberate arithmetic error
    lines.push(`${k + 1} | Providing and fixing ${d} | ${u} | ${q} | ${r.toFixed(2)} | ${amount.toFixed(2)}`);
  });
  pages.push(lines.slice(0, 11)); // p55
  pages.push(["Schedule of Quantities (BOQ) (continued)", ...lines.slice(11)]); // p56
  pages.push(...filler("Annexures and Forms", GCC, 501, 8)); // p57-64
  return { pages, boqCount: rows.length };
}

const a = tenderA();
const b = tenderB();
writeFileSync(`${OUT}/tender-A-gem-hospital-150p.pdf`, pdf(a.pages));
writeFileSync(`${OUT}/tender-B-cpwd-polytechnic-64p.pdf`, pdf(b.pages));
writeFileSync(`${OUT}/bad-scanned-tender.pdf`, pdf(Array.from({ length: 12 }, () => []), { scanned: true }));
writeFileSync(
  `${OUT}/bad-price-list.csv`,
  "sku,description,brand,unit,list_price\n" +
    "HV-MCB-C16-1P,MCB 16A SP C-curve 10kA,Havells,Nos,240\n" +
    "HV-MCB-C32-2P,MCB 32A DP C-curve 10kA,Havells,Nos,on request\n",
);
console.log(`Tender A: ${a.pages.length} pages, ${a.boqCount} BOQ lines; Tender B: ${b.pages.length} pages, ${b.boqCount} BOQ lines`);
