# AppleFX — Apple-style motion για Premiere Pro

Panel (CEP extension) για **Adobe Premiere Pro 2021+** (Windows & macOS) που φέρνει καθαρό, “Apple / Keynote” motion με ένα κλικ:
**65 presets** σε 6 κατηγορίες, live preview και ρυθμίσεις για κάθε preset.

Το panel έχει: εικονίδια κατηγοριών πάνω, λίστα presets αριστερά (με αστεράκι για αγαπημένα), graph καμπύλης με handles που σέρνεις (ή sliders Bounces/Settle για springs), κουμπί Apply κάτω, status bar και light/dark mode.

| Κατηγορία | Presets | Τι κάνει |
|---|---|---|
| **Easing** | 15 | Apple Standard, Emphasized, Decelerated, Accelerated, Spring · Soft, Spring · Bouncy, Snap, Anticipate, Bouncy, Keynote Smooth, iOS Sheet κ.ά. Κάθε καμπύλη αλλάζει: σέρνεις τα μπλε handles ή γράφεις `cubic-bezier(...)`, και στα springs ρυθμίζεις Bounces/Settle (EDITED / Reset). Εφαρμόζονται **στα keyframes που ήδη έχεις** (Position, Scale, Opacity, και σε οποιοδήποτε effect). |
| **Text** | 12 | Keynote-style reveals: Fade Up, Blur In, Keynote Rise, Scale Pop, Zoom Blur, Slide, Drop In, Wipe Reveal, Wipe Up, Tilt In, Soft Focus. Εφαρμόζονται ως In, Out ή In + Out. |
| **Transitions** | 11 | Push (4 κατευθύνσεις), Whip Pan, Zoom Through, Blur Cut, Spin, Keynote Dissolve, Stack Slide, Dip To Black, με πραγματικό motion blur. |
| **Glass** | 9 | Frosted glass: Frosted, Dark, Glass Card, Bottom Bar, Sidebar, Menu Bar, Card Pop, Notification, Blur In. |
| **Styles** | 10 | Soft/Deep Shadow, Floating Card, Picture-in-Picture (4 γωνίες), Cinematic Bars, Mono, Dim. |
| **Loops** | 9 | Κίνηση τύπου “expressions” σε όλο το clip: Float, Breathe, Sway, Orbit, Handheld, Ken Burns In/Out, Drift Pan, Pulse. |

## Εγκατάσταση

1. Κλείσε το Premiere Pro.
2. **Windows:** διπλό κλικ στο `install/install_windows.bat`
   **macOS:** στο Terminal: `bash install/install_mac.sh`
3. Άνοιξε το Premiere Pro → **Window → Extensions → AppleFX**.

Το installer ενεργοποιεί το `PlayerDebugMode` (απαιτείται για extensions που δεν είναι υπογεγραμμένα ως `.zxp`) και αντιγράφει τον φάκελο `AppleFX/` στο:
- Windows: `%APPDATA%\Adobe\CEP\extensions\AppleFX`
- macOS: `~/Library/Application Support/Adobe/CEP/extensions/AppleFX`

## Χρήση

1. Επίλεξε ένα ή περισσότερα clips στο timeline.
2. Διάλεξε κατηγορία και preset: το preview δείχνει ακριβώς τι θα εφαρμοστεί.
3. Ρύθμισε Curve / Duration / Intensity / In-Out / Motion blur.
4. Πάτα **Apply**. Το **Clear** αφαιρεί τα keyframes από Motion, Opacity και Transform των επιλεγμένων clips.

Συμβουλές:
- **Easing:** βάλε πρώτα 2+ keyframes (π.χ. Position) και μετά εφάρμοσε μια curve. Κάθε ζεύγος keyframes παίρνει την καμπύλη.
- **Transitions:** επίλεξε 2+ διαδοχικά clips στο ίδιο track. Το πρώτο κάνει “έξοδο”, το επόμενο “είσοδο”. Αν επιλέξεις ένα μόνο clip, παίρνει είσοδο και έξοδο.
- **Glass:** κάνε Alt-drag για να αντιγράψεις το footage στο track από πάνω, επίλεξε το αντίγραφο και εφάρμοσε. Το αντίγραφο γίνεται frosted glass.
- **Text σε Essential Graphics:** αν ο τίτλος δεν είναι στο κέντρο, το scale γίνεται γύρω από το κέντρο του frame. Για τέλειο αποτέλεσμα, κάνε nest τον τίτλο ή βάλε το anchor στο κέντρο του κειμένου.
- Το **Ctrl/Cmd+Z** αναιρεί τις αλλαγές.

## Πώς δουλεύει

- Το Premiere scripting API δεν επιτρέπει custom bezier handles στα keyframes, οπότε το AppleFX **“ψήνει” (bakes)** κάθε curve και spring: τη δειγματοληπτεί ανά frame και μετά κρατά μόνο τα keyframes που χρειάζονται (Ramer–Douglas–Peucker, ακρίβεια κάτω από 1 pixel). Η επιλογή **Keyframes → Every frame** κρατά όλα τα keyframes.
- Τα animations γράφονται **σχετικά** με την τρέχουσα θέση, κλίμακα και διαφάνεια του clip, οπότε σέβονται το δικό σου layout.
- Όταν το **Motion blur** είναι ενεργό (ή όταν το preset έχει σκιά), η κίνηση γίνεται μέσω του effect **Transform** με shutter angle 180°, οπότε έχεις πραγματικό motion blur και σκιά που ακολουθεί την κίνηση.
- Effects που χρησιμοποιούνται (όλα built-in): Gaussian Blur, Crop, Transform, Brightness & Contrast, Drop Shadow, Black & White. Αν το effect υπάρχει ήδη στο clip, ξαναχρησιμοποιείται.

## Δομή

```
AppleFX/                 το extension (αυτός ο φάκελος εγκαθίσταται)
  CSXS/manifest.xml      CEP manifest (PPRO 15.0+)
  index.html, css/       UI του panel
  js/easing.js           bezier curves + springs
  js/presets.js          όλα τα presets (δηλωτικά)
  js/engine.js           presets → keyframes (baking + simplification)
  js/preview.js          live preview σε canvas
  js/cep.js              γέφυρα panel ↔ Premiere (με mock εκτός Premiere)
  js/main.js             UI λογική
  jsx/host.jsx           ExtendScript: γράφει keyframes/effects στο Premiere
install/                 installers Windows / macOS
tests/                   unit tests (node --test)
```

Development: άνοιξε το `AppleFX/index.html` σε browser για να δεις το panel σε “Preview mode” (το Apply προσομοιώνεται). Με ανοιχτό το Premiere, το debugging γίνεται στο `http://localhost:8098`. Tests: `npm test`.

Για διανομή ως `.zxp` χρειάζεται υπογραφή με το `ZXPSignCmd` της Adobe.
