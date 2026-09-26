# Ezro

Portfolio, shop, secure video delivery and a full admin panel for **Ezro**.

- **Χρώματα:** `#905abd`, `#b491dc`
- **Γραμματοσειρά:** Helvetica (αλλάζει από Admin → Texts)
- **Θέμα:** Dark και Light

## Τι περιέχει

| Σελίδα | Τι κάνει |
|---|---|
| `/` | Logo, socials, portfolio ανά κατηγορία (COVER ART, 3D ART, BRANDING, PRODUCTS), shop, καλάθι και checkout |
| `/watch` | **Video Review**: ο πελάτης βάζει το key του και βλέπει το video με προστασία |
| `/admin` | Admin Panel |
| `/invoice/EZR-1001` | Online invoice (μόνο για τον αγοραστή ή admin) |

**Αγορά, βήμα προς βήμα:**
1. Ο πελάτης κάνει login με Google.
2. Πληρώνει με PayPal ή με δική σου μέθοδο πληρωμής.
3. Ο server επιβεβαιώνει στο PayPal ότι μπήκε το **ακριβές ποσό**.
4. Δημιουργείται προσωπικό key (`EZRO-XXXX-XXXX-XXXX-XXXX`).
5. Στέλνεται αναλυτικό invoice email.
6. Ο πελάτης βλέπει το video στο `/watch`.

**Admin Panel:**
- **Dashboard:** επισκέπτες, παραγγελίες, έσοδα, γραφήματα, πρόσφατη δραστηριότητα.
- **Orders:** επιβεβαίωση πληρωμής, αποστολή invoice ξανά, refund, ανάκληση keys.
- **Products:** όλα τα πεδία, Live / Coming soon (με countdown και «Notify me») / Hidden, απόθεμα, gallery, preview video, Google Drive ή upload για το προστατευμένο video.
- **Discounts:** κωδικοί σε ποσοστό ή σταθερό ποσό, όριο χρήσεων, ημερομηνίες, συγκεκριμένα προϊόντα.
- **Payments & Checkout:** PayPal, δικές σου μέθοδοι πληρωμής με οδηγίες και εικονίδιο, νόμισμα, ΦΠΑ, όροι, κείμενα.
- **Invoice:** logo, banner, στοιχεία, κείμενα, χρώμα, αρίθμηση, live preview, test email.
- **Categories & Media:** προσθήκη, αλλαγή και αφαίρεση κατηγοριών, upload εικόνων και video, σειρά με drag.
- **Social media:** προσθήκη και αλλαγή, εικονίδια ή δικό σου εικονίδιο, σειρά με drag.
- **Texts:** γραμματοσειρά, αλλαγή ή διαγραφή **οποιουδήποτε** κειμένου (και με κλικ πάνω στη σελίδα).
- **Appearance:** χρώματα, θέμα, στρογγυλάδα, logo, favicon, με live preview.
- **Tasks:** board με drag & drop, προτεραιότητες, deadlines, ανάθεση, ορατότητα.
- **Customers**, **Admins & Security**.
- **Logs:** κάθε αλλαγή, πληρωμή, login και προβολή video.

## Εκκίνηση

Χρειάζεται **Node.js 22.5+**.

```bash
npm install
cp .env.example .env     # συμπλήρωσε τα στοιχεία
npm start                # http://localhost:3000
```

**Γρήγορη δοκιμή χωρίς λογαριασμούς Google και PayPal:** βάλε `DEV_LOGIN=1` και `ADMIN_EMAILS=you@test.com` στο `.env`. Έτσι κάνεις login μόνο με email και εμφανίζεται κουμπί «Test payment». Τα emails αποθηκεύονται στο `data/outbox/`. **Ποτέ σε production.**

Τα δεδομένα (βάση SQLite, uploads, private videos) μένουν στο φάκελο `data/`. Κράτα backup του.

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
- **Watermark:** το email του αγοραστή μετακινείται πάνω στο video. Αν διαρρεύσει, ξέρεις ποιος το έκανε.
- **Μαύρη οθόνη όταν:**
  - αλλάζει παράθυρο ή καρτέλα,
  - πατάει PrintScreen ή τα shortcuts για screenshot,
  - ανοίγει τα DevTools,
  - πάει να εκτυπώσει.
- **Χωρίς κατέβασμα:** χωρίς κουμπί download, δεξί κλικ, Picture-in-Picture ή AirPlay.
- **Όριο προβολών:** προαιρετικό, ανά key.

**Τι ΔΕΝ μπορεί να γίνει μόνο με κώδικα:** κανένα site δεν μπορεί να κάνει 100% μαύρη την οθόνη σε **κάθε** πρόγραμμα καταγραφής, ή να κάνει ένα αρχείο που κατέβηκε «να μην παίζει πουθενά». Αυτό το πετυχαίνει μόνο το **DRM** (Widevine και FairPlay), όπως στο Netflix. Αν το θέλεις σε αυτό το επίπεδο, το επόμενο βήμα είναι να φιλοξενούνται τα videos σε υπηρεσία με DRM (π.χ. VdoCipher ή Bunny Stream DRM) και να αντικατασταθεί ο player στο `/watch`. Όλα τα υπόλοιπα (keys, login, πληρωμές) μένουν ίδια.

## Δομή

```
server/   Express API (auth, shop/PayPal, watch/stream, admin, mailer, SQLite)
public/   index.html, watch.html, admin.html, css/, js/, assets/
data/     database, uploads, private videos, outbox (not in git)
```
