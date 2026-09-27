# Ezro

Portfolio, shop, secure video delivery and a full admin panel for **Ezro**.

- **Χρώματα:** `#905abd`, `#b491dc`
- **Γραμματοσειρά:** Helvetica (αλλάζει από Admin → Texts)
- **Θέμα:** Dark και Light

## Τι περιέχει

| Σελίδα | Τι κάνει |
|---|---|
| `/` | Logo, socials, portfolio ανά κατηγορία (COVER ART, 3D ART, BRANDING, PRODUCTS), shop, καλάθι και checkout |
| `/watch` | **Profile**: φωτογραφία και όνομα, τα προϊόντα του πελάτη, video και Download panel |
| `/admin` | Admin Panel — μπαίνεις **μόνο** με κρυφό username και password |

**Αγορά, βήμα προς βήμα:**
1. Ο πελάτης κάνει login με Google.
2. Πληρώνει με PayPal ή με δική σου μέθοδο πληρωμής.
3. Ο server επιβεβαιώνει στο PayPal ότι μπήκε το **ακριβές ποσό**.
4. Δημιουργείται redeem code (`EZRO-XXXX-XXXX-XXXX-XXXX`) που μπαίνει στο profile του.
5. Ο πελάτης βλέπει το video και κατεβάζει τα αρχεία από το `/watch`.

Κάθε προϊόν αγοράζεται **μία φορά** ανά λογαριασμό, και κάθε code γίνεται redeem **μία φορά**.

**Admin Panel:**
- **Dashboard:** επισκέπτες, παραγγελίες, έσοδα, γραφήματα, πρόσφατη δραστηριότητα.
- **Orders:** επιβεβαίωση πληρωμής, refund, ανάκληση keys.
- **Products:** όλα τα πεδία, Live / Coming soon (με countdown και «Notify me») / Hidden, απόθεμα, gallery, preview video, Google Drive ή upload για το προστατευμένο video, Download panel με αρχεία, redeem codes για δώρα.
- **Discounts:** κωδικοί σε ποσοστό ή σταθερό ποσό, όριο χρήσεων, ημερομηνίες, συγκεκριμένα προϊόντα.
- **Payments & Checkout:** PayPal, δικές σου μέθοδοι πληρωμής με οδηγίες και εικονίδιο, νόμισμα, ΦΠΑ, όροι, κείμενα.
- **Categories & Media:** προσθήκη, αλλαγή και αφαίρεση κατηγοριών, upload εικόνων και video, σειρά με drag.
- **Social media:** προσθήκη και αλλαγή, εικονίδια ή upload δικού σου (256×256), σειρά με drag.
- **Texts:** γραμματοσειρά, αλλαγή ή διαγραφή **οποιουδήποτε** κειμένου (και με κλικ πάνω στη σελίδα).
- **Appearance:** χρώματα, θέμα, στρογγυλάδα, logo, favicon, με live preview.
- **Tasks:** board με drag & drop, προτεραιότητες, deadlines, ανάθεση, ορατότητα.
- **Customers**, **Admins & Security**: αλλαγή του username και password σου, admin λογαριασμοί, οι συσκευές σου.
- **Logs:** κάθε αλλαγή, πληρωμή, login και προβολή video.
- **Reset data:** καθαρισμός logs, στατιστικών, παραγγελιών, ή **Reset User** με email.

## Εκκίνηση

**Αυτόματες ενημερώσεις:** το `start-windows.bat` συνδέει τον φάκελο με το GitHub και κατεβάζει μόνο του κάθε νέα αλλαγή (κάθε ~20 δευτερόλεπτα) όσο τρέχει. Δεν χρειάζεται ξανά zip.

**Ο πιο εύκολος τρόπος:** διπλό κλικ στο `start-windows.bat` (Windows) ή στο `start-mac.command` (Mac). Εγκαθιστά ό,τι χρειάζεται, σε ρωτάει το email σου για admin και ανοίγει το http://localhost:3000.

Χειροκίνητα:

Χρειάζεται **Node.js 22.5+**.

```bash
npm install
cp .env.example .env     # συμπλήρωσε τα στοιχεία
npm start                # http://localhost:3000
```

**Γρήγορη δοκιμή χωρίς λογαριασμούς Google και PayPal:** βάλε `DEV_LOGIN=1` στο `.env`. Έτσι κάνεις login μόνο με email και εμφανίζεται κουμπί «Test payment». Τα emails αποθηκεύονται στο `data/outbox/`. **Ποτέ σε production.**

Τα δεδομένα (βάση SQLite, uploads, private videos) μένουν στο φάκελο `data/`. Κράτα backup του.

## Admin login

Το Admin Panel **δεν** ανοίγει με email ή Google. Ανοίγει μόνο με **username** και **password**.

- **Owner:** ο λογαριασμός του ιδιοκτήτη υπάρχει ήδη μέσα στο site. Τα στοιχεία του τα έχει μόνο ο ιδιοκτήτης και δεν υπάρχουν πουθενά σε αυτό το repo. Υπάρχει μόνο το κρυπτογραφημένο hash του κωδικού.
- **Logins για άλλους:** Admin → Admins & Security → «Create a login for someone». Γράφεις username, πατάς «Generate password» και μετά «Create login». Με το «Copy login details» τα στέλνεις στο άτομο.
- **Αλλαγή δικού σου username / password:** Admins & Security → «Your login».

Ασφάλεια:
- Οι κωδικοί αποθηκεύονται μόνο ως scrypt hash.
- Μετά από 5 λάθος προσπάθειες η σύνδεση κλειδώνει για 5 λεπτά, και ο χρόνος διπλασιάζεται κάθε φορά.
- Κάθε προσπάθεια γράφεται στα Logs.
- Το session είναι σε httpOnly/SameSite cookie.

**2FA (δεύτερο βήμα):** Admins & Security → «Turn on 2FA».
- Σκανάρεις το QR με Google Authenticator, Microsoft Authenticator ή Authy.
- Μετά τον κωδικό, το login ζητάει και 6ψήφιο κωδικό από το κινητό.
- Παίρνεις και 10 recovery codes, για την περίπτωση που χάσεις το κινητό. Κάθε κωδικός δουλεύει μία φορά.
- Αν κάποιος admin χάσει το κινητό του, ο Owner του κλείνει το 2FA από τη λίστα των λογαριασμών.

## Backups

- **Κάθε μέρα** γίνεται αυτόματα αντίγραφο της βάσης στο `data/backups/` και κρατιέται 30 μέρες.
- Admin → **Backups**:
  - «Back up now» για αντίγραφο τώρα.
  - Κατέβασμα ενός αντιγράφου.
  - **«Download everything (.zip)»:** βάση, εικόνες, videos και αρχεία, όλα μαζί.
  - **Restore:** γυρνάει το site σε ένα αντίγραφο. Η τωρινή κατάσταση σώζεται πρώτα, για να μπορείς να το αναιρέσεις.
- Με `BACKUP_COPY_DIR` στο `.env`, κάθε αντίγραφο πηγαίνει και σε δεύτερο φάκελο (π.χ. OneDrive).

## Share

- Κάθε cover έχει κουμπί Share (και στη μεγάλη προβολή), το ίδιο και τα albums και τα προϊόντα.
- Κάθε cover έχει δικό του link (`/cover/12`). Όταν το link μπαίνει σε Instagram, Discord, Viber, WhatsApp ή Messenger, φαίνεται με μεγάλη εικόνα, τίτλο και καλλιτέχνη.
- Η προεπισκόπηση δουλεύει μόνο όταν το site είναι online. Από το `localhost` οι εφαρμογές δεν μπορούν να το δουν.

## PayPal Webhooks & IPN

Το PayPal ειδοποιεί μόνο του το site για κάθε ολοκλήρωση, επιστροφή χρημάτων ή αντιστροφή πληρωμής, ακόμα κι αν ο πελάτης έκλεισε τη σελίδα.
- **Webhook** (προτείνεται): `https://το-site-σου/api/paypal/webhook`.
  1. Στο developer.paypal.com → η εφαρμογή σου → Webhooks → Add webhook → «All events».
  2. Βάλε το **Webhook ID** στο `.env` ως `PAYPAL_WEBHOOK_ID`.
- **IPN** (προαιρετικό): `https://το-site-σου/api/paypal/ipn`.
  - Στο paypal.com → Settings → Website payments → Instant payment notifications.
- Κάθε μήνυμα **επιβεβαιώνεται με το PayPal** πριν αλλάξει οτιδήποτε. Εφαρμόζεται μία φορά και ελέγχεται το ακριβές ποσό.
- Τα τελευταία μηνύματα φαίνονται στο Admin → Payments & Checkout.
- Δουλεύει μόνο όταν το site είναι online. Το PayPal δεν μπορεί να φτάσει το `localhost`.

## Ρυθμίσεις (.env)

- **Google login:** `GOOGLE_CLIENT_ID`. Φτιάξε OAuth Client ID τύπου *Web* και πρόσθεσε το domain σου στα *Authorized JavaScript origins*.
- **PayPal:**
  - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
  - `PAYPAL_ENV=sandbox` για δοκιμές, `live` για πραγματικά χρήματα.
- **Email:** `SMTP_*` και `MAIL_FROM`. Χωρίς αυτά τα emails αποθηκεύονται στο `data/outbox/`.
- **Google Drive:**
  1. Βάλε στο `GOOGLE_SERVICE_ACCOUNT_JSON` το JSON του service account.
  2. Κάνε **share** κάθε video στο email του service account (Viewer).
  3. Στο προϊόν επίλεξε «Google Drive» και βάλε το link.
  4. Το video περνάει μέσα από τον server σου. Ο πελάτης **δεν βλέπει ποτέ** το link του Drive.

## Ασφάλεια του video

Τι κάνει ήδη:
- **Key δεμένο στον λογαριασμό:** δουλεύει **μόνο** με τον Google λογαριασμό του αγοραστή. Αν το δώσει σε άλλον, δεν ανοίγει και γράφεται στα Logs.
- **Προσωρινό stream link:** λήγει και είναι δεμένο στο συγκεκριμένο login. Αν το ανοίξεις απευθείας σε νέα καρτέλα, δίνει 403.
- **Κρυφή πηγή:** δεν υπάρχει δημόσιο link του Drive, και τα uploads μένουν έξω από τον δημόσιο φάκελο.
- **Μαύρη οθόνη όταν:**
  - αλλάζει παράθυρο ή καρτέλα,
  - πατάει PrintScreen ή τα shortcuts για screenshot,
  - ανοίγει τα DevTools,
  - πάει να εκτυπώσει.
- **Κατέβασμα μόνο από το Download panel:** τα αρχεία δίνονται μόνο στον αγοραστή (και το video, αν το επιτρέψεις στο προϊόν).
- **Όριο προβολών:** προαιρετικό, ανά key.

**Τι ΔΕΝ μπορεί να γίνει μόνο με κώδικα:** κανένα site δεν μπορεί να κάνει 100% μαύρη την οθόνη σε **κάθε** πρόγραμμα καταγραφής, ή να κάνει ένα αρχείο που κατέβηκε «να μην παίζει πουθενά». Αυτό το πετυχαίνει μόνο το **DRM** (Widevine και FairPlay), όπως στο Netflix. Αν το θέλεις σε αυτό το επίπεδο, το επόμενο βήμα είναι να φιλοξενούνται τα videos σε υπηρεσία με DRM (π.χ. VdoCipher ή Bunny Stream DRM) και να αντικατασταθεί ο player στο `/watch`. Όλα τα υπόλοιπα (keys, login, πληρωμές) μένουν ίδια.

## Δομή

```
server/   Express API (auth, shop/PayPal, watch/stream, admin, mailer, SQLite)
public/   index.html, watch.html, admin.html, css/, js/, assets/
data/     database, uploads, private videos, outbox (not in git)
```

## Online (Render)

1. https://dashboard.render.com → **New → Blueprint** → διάλεξε το repo `giannis2009/Test`.
2. Συμπλήρωσε `PUBLIC_URL`, `GOOGLE_CLIENT_ID` (και PayPal / SMTP όταν τα έχεις) → **Apply**.
3. Στο Google Cloud (OAuth client) πρόσθεσε το `PUBLIC_URL` στα *Authorized JavaScript origins*.

Η βάση και τα uploads μένουν στον δίσκο `/var/data` (δεν χάνονται σε κάθε ενημέρωση).
