// Adds demo listings so the site can be previewed. Usage: npm run seed
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./db');
const { insertCar, addImages } = require('./cars');
const { UPLOAD_DIR } = require('./upload');

const demo = [
  ['Volkswagen', 'Golf', '1.5 eTSI DSG Style', 'Αυτοκίνητο', 'Hatchback', 24900, 2022, 3, 38000, 'Υβριδικό βενζίνη', 'Αυτόματο', 1498, 150, 'Γκρι', '#6b7280'],
  ['Toyota', 'Yaris', '1.5 Hybrid Active', 'Αυτοκίνητο', 'Hatchback', 17500, 2021, 6, 52000, 'Υβριδικό βενζίνη', 'Αυτόματο', 1490, 116, 'Λευκό', '#e5e7eb'],
  ['BMW', 'X1', 'sDrive18d M Sport', 'SUV / Off-road', 'SUV', 33900, 2020, 9, 71000, 'Πετρέλαιο', 'Αυτόματο', 1995, 150, 'Μαύρο', '#111827'],
  ['Peugeot', '208', '1.2 PureTech Allure', 'Αυτοκίνητο', 'Hatchback', 15800, 2021, 1, 44000, 'Βενζίνη', 'Χειροκίνητο', 1199, 100, 'Μπλε', '#1d4ed8'],
  ['Mercedes-Benz', 'A 180', 'd AMG Line', 'Αυτοκίνητο', 'Hatchback', 27500, 2020, 4, 63000, 'Πετρέλαιο', 'Αυτόματο', 1461, 116, 'Ασημί', '#9ca3af'],
  ['Hyundai', 'Tucson', '1.6 T-GDi Hybrid Premium', 'SUV / Off-road', 'SUV', 34900, 2023, 2, 12000, 'Υβριδικό βενζίνη', 'Αυτόματο', 1598, 230, 'Κόκκινο', '#b91c1c'],
  ['Fiat', '500', '1.0 Hybrid Dolcevita', 'Αυτοκίνητο', 'Hatchback', 12900, 2022, 5, 21000, 'Υβριδικό βενζίνη', 'Χειροκίνητο', 999, 70, 'Λευκό', '#f3f4f6'],
  ['Audi', 'A4 Avant', '35 TDI S tronic S line', 'Αυτοκίνητο', 'Station Wagon', 31500, 2019, 11, 98000, 'Πετρέλαιο', 'Αυτόματο', 1968, 163, 'Μπλε', '#1e3a8a'],
  ['Tesla', 'Model 3', 'Long Range AWD', 'Αυτοκίνητο', 'Sedan', 36900, 2022, 7, 41000, 'Ηλεκτρικό', 'Αυτόματο', null, 440, 'Λευκό', '#f9fafb'],
  ['Kia', 'Sportage', '1.6 CRDi GT Line', 'SUV / Off-road', 'SUV', 26900, 2021, 8, 58000, 'Πετρέλαιο', 'Αυτόματο', 1598, 136, 'Γκρι', '#4b5563'],
  ['Opel', 'Corsa', '1.2 Edition', 'Αυτοκίνητο', 'Hatchback', 11900, 2020, 3, 67000, 'Βενζίνη', 'Χειροκίνητο', 1199, 75, 'Κόκκινο', '#dc2626'],
  ['Ford', 'Ranger', '2.0 EcoBlue Wildtrak 4x4', 'Επαγγελματικό', 'Pickup', 38500, 2021, 10, 49000, 'Πετρέλαιο', 'Αυτόματο', 1996, 213, 'Πορτοκαλί', '#ea580c'],
];

function photoSvg(title, color, variant) {
  const bg = ['#dbeafe', '#fef3c7', '#e0e7ff', '#dcfce7'][variant % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#9ca3af"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#g)"/><rect y="430" width="800" height="170" fill="#4b5563"/>
<g transform="translate(${130 + variant * 10} 250)">
<path d="M40 180 L60 110 Q80 60 150 55 L380 50 Q450 50 500 110 L560 130 Q600 140 600 180 L600 210 L40 210 Z" fill="${color}" stroke="#111" stroke-width="4"/>
<path d="M170 70 L370 66 Q420 68 460 115 L140 118 Z" fill="#cbd5e1" stroke="#111" stroke-width="3"/>
<circle cx="150" cy="215" r="48" fill="#111"/><circle cx="150" cy="215" r="22" fill="#9ca3af"/>
<circle cx="470" cy="215" r="48" fill="#111"/><circle cx="470" cy="215" r="22" fill="#9ca3af"/></g>
<text x="400" y="90" font-family="Arial" font-size="44" font-weight="700" text-anchor="middle" fill="#1f2937">${title}</text>
<text x="400" y="560" font-family="Arial" font-size="24" text-anchor="middle" fill="#e5e7eb">Φωτογραφία ${variant + 1} (demo)</text></svg>`;
}

const features = ['A/C', 'Climate control', 'Navigation', 'Bluetooth', 'Κάμερα οπισθοπορείας', 'Cruise control', 'LED φώτα', 'ABS', 'ESP', 'Αερόσακοι', 'Ζάντες αλουμινίου', 'Apple CarPlay / Android Auto'];

let n = 0;
for (const [make, model, version, category, body, price, year, month, km, fuel, gearbox, cc, hp, colorName, hex] of demo) {
  const id = insertCar({
    make, model, version, category, body_type: body, price, year, month, mileage: km, fuel, gearbox,
    engine_cc: cc, power_hp: hp, color: colorName, condition: 'Μεταχειρισμένο', doors: body === 'Pickup' ? 4 : 5, seats: 5,
    drivetrain: /4x4|AWD/.test(version) ? 'Τετρακίνητο (4x4)' : 'Προσθιοκίνητο', emission_class: 'Euro 6',
    previous_owners: 1, service_book: 1, no_accident: 1, price_negotiable: n % 3 === 0 ? 1 : 0,
    featured: n < 4 ? 1 : 0, status: n === 10 ? 'reserved' : 'active',
    features: JSON.stringify(features.slice(0, 6 + (n % 6))),
    description: `Άψογο ${make} ${model} ${version}, ελληνικό, με βιβλίο service από την αντιπροσωπεία.\nΠλήρως ελεγμένο, με εγγύηση 12 μηνών.\nΔυνατότητα χρηματοδότησης και ανταλλαγής.`,
  });
  const files = [0, 1, 2].map((v) => {
    const f = `demo-${id}-${v}.svg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, f), photoSvg(`${make} ${model}`, hex, v));
    return f;
  });
  addImages(id, files);
  n++;
}
db.prepare('UPDATE cars SET views = abs(random() % 400)').run();
console.log(`Προστέθηκαν ${n} demo αγγελίες.`);
