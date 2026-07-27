# Hotel Management System Desktop Client (Tauri + SQLite + Firebase)

A complete, production-ready, offline-first Hotel Property Management System (PMS) desktop application tailored for hotels with small room counts (13 rooms). 

This client operates with **absolute offline autonomy** to guarantee zero downtime for hotel front desk agents. Receptions can continually issue key tags, register check-ins, close check-outs, and log bill receipts completely offline. When internet becomes active, database mutations are automatically flushed and synced with full background security to the Firebase Cloud database.

---

## 📂 Project Directory Structure

```text
/
├── .env.example                  # Environment configuration blueprints
├── package.json                  # Client NPM dependencies & execution scripts
├── tsconfig.json                 # TypeScript build constraints
├── vite.config.ts                # Vite asset compiler configuration
├── metadata.json                 # Google AI Studio cloud capabilities
├── src/                          # Shared Front-End Source Code
│   ├── main.tsx                  # Web entrance bootstrap
│   ├── index.css                 # Global styles and tailwind imports
│   ├── App.tsx                   # Main layout container and tab Router shell
│   ├── types.ts                  # Shared database models (Guests, Bookings, Payments)
│   ├── db/
│   │   └── localDb.ts            # Local Relational SQLite / IndexedDB Service Store
│   └── services/
│       └── firebaseSync.ts       # Cloud sync listener engine (Auto sync poller)
│   └── components/
│       ├── Dashboard.tsx         # Bento-grid operations counters & notifications queue
│       ├── BookingCalendar.tsx   # Interactive PMS Date-Room reservations grid
│       ├── BookingModal.tsx      # Multi-mode booking creation & pay detail sheets
│       ├── CurrentGuests.tsx     # Checked-in onsite active guest accounts
│       └── GuestManagement.tsx   # CRM customer directory index
└── src-tauri/                    # Tauri Desktop Core Module Configs
    ├── tauri.conf.json           # App permissions, assets directory & window parameters
    ├── Cargo.toml                # Rust crate dependency list
    └── src/
        └── main.rs               # Rust native startup loop & database driver bindings
```

---

## ⚡ Key Technical Architectures

### 1. Database Relational Engine (`/src/db/localDb.ts`)
The storage is engineered around a hybrid strategy:
- **Tauri Native Execution**: Maps directly to SQLite tables `rooms`, `guests`, `bookings`, and `payments` utilizing Tauri's native SQL bridge features.
- **Vite Web Preview Sandbox Mode**: Automatically falls back to high-velocity browser **IndexedDB** backings to allow seamless operation in the AI Studio live preview container.
- **Relational Integrity**: Integrates indexing on search dimensions (`name`, `phone`, `roomNumber`, `bookingId`) for sub-millisecond search speeds.

### 2. Cloud Sync Poller Engine (`/src/services/firebaseSync.ts`)
- Registers live listeners for `online` and `offline` browser/os networking signals.
- Spawns background worker pollers that periodically check for local database edits containing `_synced === false` flags.
- Safely processes and flushes mutations in serial queues to Firestore collections (`guests`, `bookings`, `payments`) with robust merge locks to prevent double-booking.

### 3. Smart Live Grid PMS (`/src/components/BookingCalendar.tsx`)
- Renders an interactive room matrix (y-axis) against sequential dates (x-axis).
- Prevents room overlapping and double bookings utilizing checkdate validations.
- Clicking any unoccupied cell immediately pre-populates the booking form, and clicking any booking block launches contextual guest/check-in operations sheets.

---

## 🚀 Installation Instructions (Local Workstation)

Follow these instructions to set up the software environment on your developer machine:

### Prerequisites:
1. **Node.js** (v18.0 or newer)
2. **Rust & Cargo** (Required for Tauri desktop builds)
   - Windows: [Rustup Installer](https://rustup.rs/) (Ensure C++ Build Tools are selected).
   - macOS: Run `xcode-select --install` and curl rustup.
   - Linux: Ensure `webkit2gtk`, `build-essential`, and `libsoup` libraries are installed via apt.

### Setup Commands:

```bash
# 1. Clone or extract the project directory and enter the root
cd hotel-management-system

# 2. Install NPM packages
npm install

# 3. Complete Cloud Sync Setup (Firebase credentials)
# Ensure your firebase-applet-config.json file contains valid firebase SDK elements.
```

---

## 🛠️ Build and Development Commands

### 🌟 Run Developer Preview Mode (Hot-Reloading)
Launch the development server on-host:
```bash
# Start frontend preview
npm run dev
```

### 💻 Launch Native Tauri Desktop Window
Launch the Native Desktop frame (running completely offline, reading/writing local databases):
```bash
# Start tauri development loop
npx tauri dev
```

### 📦 Compile Production Executable Bundles
Compile optimized native system binaries (`Hotel.exe` on Windows or `Hotel.app` on macOS):
```bash
# Build desktop native installers
npx tauri build
```
The output installers will be compiled and nested under: `src-tauri/target/release/bundle/`.

---

## 📊 Operations Manual (For Hotel Front Desk Staff)

1. **Dashboard**: Live counters display actual stay conditions in real time. Pay attention to the **Front-Desk Operations Queue** which surfaces check-ins and check-outs due today requiring immediate operator action.
2. **Booking Calendar**: Scroll or paginate to see history or future bookings. Rooms are colored dynamically:
   - **Green**: Available. Click to open reservation form.
   - **Blue**: Reserved. Confirmed booking for a future date.
   - **Red**: Checked In. Onsite guest is inside. Click to add secondary payments or trigger Checkout.
   - **Gray**: Historical checkout.
3. **Payments**: Add advance payments when booking is made. If the guest registers extra receipts or requires partial settlements later, open the active reservation sheet and click **Log Extra Payment** to register receipts.
4. **CRM Guest Ledger**: Type a phone, room number, or name to find guest history instantly. Expand any customer profile card to view all their historic bills, nights, and rooms.
