const MAKES = [
  'Abarth', 'Alfa Romeo', 'Audi', 'BMW', 'BYD', 'Citroen', 'Cupra', 'Dacia', 'DS', 'Fiat', 'Ford',
  'Honda', 'Hyundai', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Mazda', 'Mercedes-Benz',
  'MG', 'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Renault', 'Seat', 'Skoda',
  'Smart', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
];

const CATEGORIES = ['Αυτοκίνητο', 'SUV / Off-road', 'Επαγγελματικό', 'Μοτοσυκλέτα'];

const BODY_TYPES = [
  'Sedan', 'Hatchback', 'Station Wagon', 'SUV', 'Coupe', 'Cabrio', 'MPV / Van', 'Pickup',
];

const FUELS = ['Βενζίνη', 'Πετρέλαιο', 'Υβριδικό βενζίνη', 'Υβριδικό πετρέλαιο', 'Plug-in υβριδικό', 'Ηλεκτρικό', 'Υγραέριο (LPG)', 'Φυσικό αέριο (CNG)'];

const GEARBOXES = ['Χειροκίνητο', 'Αυτόματο', 'Ημιαυτόματο'];

const DRIVETRAINS = ['Προσθιοκίνητο', 'Πισωκίνητο', 'Τετρακίνητο (4x4)'];

const CONDITIONS = ['Μεταχειρισμένο', 'Καινούργιο', 'Μεταχειρισμένο εισαγωγής', 'Επίδειξης'];

const EMISSION_CLASSES = ['Euro 6', 'Euro 5', 'Euro 4', 'Euro 3', 'Ηλεκτρικό (μηδενικές)'];

const COLORS = ['Λευκό', 'Μαύρο', 'Γκρι', 'Ασημί', 'Μπλε', 'Κόκκινο', 'Πράσινο', 'Καφέ', 'Μπεζ', 'Κίτρινο', 'Πορτοκαλί', 'Μωβ'];

const FEATURES = [
  'A/C', 'Climate control', 'Ζάντες αλουμινίου', 'Navigation', 'Apple CarPlay / Android Auto',
  'Bluetooth', 'Κάμερα οπισθοπορείας', 'Αισθητήρες παρκαρίσματος', 'Cruise control',
  'Adaptive cruise control', 'Δερμάτινο σαλόνι', 'Θερμαινόμενα καθίσματα', 'Ηλιοροφή / Πανοραμική οροφή',
  'LED φώτα', 'Xenon φώτα', 'Keyless', 'Start/Stop', 'Ηλεκτρικά παράθυρα', 'Ηλεκτρικοί καθρέπτες',
  'ABS', 'ESP', 'Αερόσακοι', 'Lane assist', 'Blind spot', 'Ψηφιακός πίνακας οργάνων', 'Κοτσαδόρος', 'ISOFIX',
];

const STATUSES = {
  active: 'Ενεργή',
  reserved: 'Κρατημένο',
  sold: 'Πωλήθηκε',
  draft: 'Πρόχειρο',
};

const INQUIRY_TYPES = {
  car: 'Αγγελία',
  contact: 'Επικοινωνία',
  sell: 'Πώληση αυτοκινήτου',
  finance: 'Χρηματοδότηση',
};

const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

module.exports = {
  MAKES, CATEGORIES, BODY_TYPES, FUELS, GEARBOXES, DRIVETRAINS, CONDITIONS,
  EMISSION_CLASSES, COLORS, FEATURES, STATUSES, MONTHS, INQUIRY_TYPES,
};
