# AttendEase — Cloud-Based Student Attendance Management System

Express + Firestore + Firebase Auth backend (Google Cloud Run), vanilla JS / Bootstrap 5 / Chart.js frontend (Firebase Hosting).

> **Status honesty:** the code was written and syntax-checked, and the pure logic (attendance %, validation) has passing unit tests.
> The API, the emulator test suite, the frontend pages and the deployment commands have **not** been executed by the author of this code.
> Work through section 3 (local run) and 4 (tests) before deploying, and fix anything that breaks. Nothing here claims a live deployment exists.

## 1. Architecture

```
Browser ──► Firebase Hosting (frontend/)  ──/api/**──►  Cloud Run (backend/, Express)  ──► Firestore
   │                                                           │
   └── Firebase Auth (email/password) ── ID token ─────────────┘  (Admin SDK verifies token,
                                                                   role read from Firestore)
```

* Roles (`admin`, `teacher`, `student`) live in Firestore `users/{uid}.role` and are read server-side on every request. The frontend never supplies a role.
* `firestore.rules` denies all direct browser access; the Express API is the only data path and enforces permissions itself (the Admin SDK bypasses rules).
* Attendance session id = `{subjectId}_{date}` → one session per subject per day (no duplicates). Record id = `{sessionId}_{studentUid}`.
* Cancelled sessions are excluded from every percentage. Percentage = attended / conducted × 100, rounded to 2 decimals, 0 when no classes.

### Folder layout
```
backend/   app.js server.js config/ middleware/ routes/ controllers/ services/ utils/ tests/ Dockerfile
frontend/  12 pages (index, admin, students, teachers, classes, teacher, mark-attendance, attendance-history,
           student, student-attendance, unauthorized, 404), css/style.css, js/*.js
scripts/   create-admin.js (first admin)  seed.js (sample data)
firebase.json  firestore.rules  firestore.indexes.json  .env.example  .firebaserc.example
```

### REST API (all under `/api`, `Authorization: Bearer <Firebase ID token>`; `/health` is public)
| Method & path | Who | Purpose |
|---|---|---|
| GET `/me` | any | Own profile + role |
| POST/GET `/users`, GET/PATCH `/users/:uid`, PATCH `/users/:uid/status` | admin (GET one: self too) | Manage students/teachers |
| GET/POST `/classes`, PATCH `/classes/:id` | read: any (scoped) / write: admin | Classes |
| GET/POST `/subjects`, PATCH `/subjects/:id` | read: any (scoped) / write: admin | Subjects + teacher assignment |
| GET `/subjects/:id/students` | admin, assigned teacher | Enrolled roster |
| GET/POST `/enrollments`, DELETE `/enrollments/:id` | admin | Enrollment |
| POST `/attendance` (create), PUT `/attendance` (edit) | admin, assigned teacher | Save attendance (409 on duplicate) |
| GET `/attendance/sessions`, `/attendance/sessions/:id` | admin, assigned teacher | History |
| GET `/attendance/subject/:id/summary` | admin, assigned teacher | Per-student % for a subject |
| GET `/attendance/student/:uid` | student (self only), admin, teacher (own subjects) | Student history + summary |
| GET `/dashboard/admin` \| `/teacher` \| `/student` | matching role | Dashboard statistics |

## 2. Prerequisites (macOS)

```bash
# Homebrew: https://brew.sh
brew install node                 # Node 20+ (22 recommended)
brew install --cask google-cloud-sdk
brew install openjdk              # Firestore emulator needs Java
npm install -g firebase-tools
node -v && gcloud --version && firebase --version
```
(If `java -version` fails after installing openjdk, follow the `brew info openjdk` instructions to link it.)

### Billing prerequisites and costs
* Cloud Run source deploys, Cloud Build, Artifact Registry and Firebase Hosting→Cloud Run rewrites require the Firebase project to be on the **Blaze (pay-as-you-go)** plan, which needs a billing account with a payment method (Indian cards/mandates can need extra verification).
* Cloud Run scales to zero by default, and Firestore, Auth and Hosting have free quotas, so a small college demo is normally very cheap or free. **Quotas and prices change — check the current figures** on the Cloud Run, Firestore, Cloud Build and Firebase pricing pages before relying on "free".
* Things that can cost money: Cloud Run requests/CPU/memory, Firestore reads/writes/storage (the admin dashboard runs several count queries per load), container images stored in Artifact Registry, Cloud Build minutes, network egress.
* Cost controls used here: `--max-instances 3` on Cloud Run (caps runaway scaling), no minimum instances.
* **Budget alerts** (alerts only — they do *not* stop spending):
  1. Console → Billing → *Budgets & alerts* → *Create budget* → scope to your project → set an amount in your billing currency → add alert thresholds (e.g. 50%, 90%, 100%) → enable email notifications.
  2. Optional CLI (currency must match the billing account; run with `--help` if flags differ in your SDK version):
     ```bash
     gcloud billing accounts list
     gcloud billing budgets create --billing-account=BILLING_ACCOUNT_ID --display-name="attendance-budget" \
       --budget-amount=500INR --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
     ```
* When finished with the project: delete the Cloud Run service, or the whole project (Console → IAM & Admin → Settings → Shut down).

## 3. Cloud project setup (one time)

1. **Create a Firebase project** at https://console.firebase.google.com (this also creates the Google Cloud project). Note the **Project ID**. Upgrade to **Blaze**.
2. **Authentication** → Get started → Sign-in method → enable **Email/Password**. (Leave self-signup off in your app — there is no signup page; only the admin API creates accounts.)
3. **Firestore Database** → Create database → **Native mode** → location **asia-south1 (Mumbai)** (closest to Delhi; keep Cloud Run in the same region) → start in *production mode* (rules are deployed from this repo).
4. **Project settings → Your apps → Add app → Web**. Copy the config values into `frontend/js/firebase-config.js` (`apiKey`, `authDomain`, `projectId`, `appId`). These are public identifiers, not secrets.
5. Terminal setup:
   ```bash
   export PROJECT_ID=your-project-id
   export REGION=asia-south1
   gcloud auth login
   gcloud config set project $PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
       firestore.googleapis.com identitytoolkit.googleapis.com
   firebase login
   cp .firebaserc.example .firebaserc      # then edit YOUR_PROJECT_ID  (.firebaserc is git-ignored)
   ```

## 4. Run and test locally

```bash
cd backend && npm install
```

**a) Automated tests (no cloud needed, uses emulators):**
```bash
npm test                 # unit tests (attendance %, validation) — integration test shows as "skipped"
npm run test:emulator    # starts Auth+Firestore emulators, seeds data, runs the API access-control tests
```
The emulator suite covers: missing/invalid token → 401; student blocked from admin endpoints and from other students' data; teacher blocked on unassigned subject; duplicate session → 409; edit recalculates % without a new session; cancelled sessions excluded; admin totals; role injection rejected.

**b) Run against your real project (uses your own gcloud login — no key files):**
```bash
gcloud auth application-default login
cd backend
export GOOGLE_CLOUD_PROJECT=$PROJECT_ID
export FRONTEND_ORIGINS=http://localhost:5000
npm start                                  # → http://localhost:8080/health

# In another terminal: create the first admin (once), then optionally sample data
cd cloud-attendance-system
export GOOGLE_CLOUD_PROJECT=$PROJECT_ID
ADMIN_EMAIL=you@yourcollege.edu ADMIN_PASSWORD='use-a-strong-password' node scripts/create-admin.js
SEED_PASSWORD='demo-password-8+' node scripts/seed.js --allow-production    # optional; creates REAL demo accounts

# Frontend (any static server on port 5000; API_BASE auto-points to localhost:8080 on localhost)
npx serve frontend -l 5000
```
Open http://localhost:5000 and sign in. Seed logins: `student01@example.edu … student10@example.edu`, `meera.iyer@example.edu`, `arjun.menon@example.edu` (password = your `SEED_PASSWORD`). Delete seeded accounts from Firebase Console when done.

Manual test checklist: wrong password shows an error · admin adds a teacher, class, subject, assigns the teacher, enrolls a student · teacher marks attendance, saves, reloads same date (shows "Editing saved attendance"), changes a mark, saves · student sees updated % and a red warning when < 75% · student URL-hopping to `admin.html` lands on "Access denied" · a deactivated user cannot log in.

## 5. Deploy

### 5.1 Backend → Cloud Run
Use a dedicated service account with least privilege:
```bash
gcloud iam service-accounts create attendance-api-sa --display-name="Attendance API"
SA=attendance-api-sa@$PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role="roles/firebaseauth.admin"
```
(`datastore.user` = Firestore read/write; `firebaseauth.admin` = create/disable users. No key file is ever created; Cloud Run supplies Application Default Credentials.)

Deploy (the `^@^` prefix changes gcloud's list delimiter so the commas inside the origins value survive):
```bash
gcloud run deploy attendance-api --source backend --region $REGION \
  --service-account $SA --allow-unauthenticated --max-instances 3 \
  --set-env-vars "^@^FRONTEND_ORIGINS=https://$PROJECT_ID.web.app,https://$PROJECT_ID.firebaseapp.com"
```
* Answer **Y** if asked to create an Artifact Registry repository.
* `--allow-unauthenticated` is required because browsers and Hosting call the API directly; every `/api` route verifies the Firebase ID token itself.
* The server listens on `process.env.PORT`, which Cloud Run sets.

Verify:
```bash
URL=$(gcloud run services describe attendance-api --region $REGION --format='value(status.url)')
curl -s $URL/health               # {"status":"ok"}
curl -i $URL/api/me               # 401 Missing bearer token
```
If you change the service name or region, update `serviceId`/`region` in `firebase.json` to match.

### 5.2 Firestore rules/indexes and frontend → Firebase Hosting
```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only hosting
```
Hosting serves `frontend/` over HTTPS and forwards `/api/**` to the Cloud Run service, so the browser sees one origin. Verify the rewrite:
```bash
curl -i https://$PROJECT_ID.web.app/api/me      # expect 401 JSON from the API (not an HTML 404)
```
If you prefer to bypass the rewrite, set `API_BASE` in `frontend/js/firebase-config.js` to `$URL/api` and make sure that exact Hosting origin is in `FRONTEND_ORIGINS`.

### 5.3 First admin in production
```bash
export GOOGLE_CLOUD_PROJECT=$PROJECT_ID
ADMIN_EMAIL=you@yourcollege.edu ADMIN_PASSWORD='use-a-strong-password' node scripts/create-admin.js
```
Then sign in at `https://YOUR_PROJECT_ID.web.app`, and create teachers/students from the UI. Do not commit passwords; do not share the admin account.

### 5.4 Verify the live system
Run the manual checklist from section 4 on the live URL. Only after it passes can you say it is deployed and working.

## 6. Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| Browser console: CORS error | Your page origin is missing from `FRONTEND_ORIGINS` (redeploy Cloud Run with the right list). |
| `403` HTML page from Cloud Run | Service isn't public: `gcloud run services add-iam-policy-binding attendance-api --region $REGION --member=allUsers --role=roles/run.invoker`. |
| `/api/...` on Hosting returns Hosting's 404 | `serviceId`/`region` in `firebase.json` don't match the deployed service; redeploy hosting. |
| `auth/invalid-api-key` / blank login | `firebase-config.js` still has placeholders. |
| Admin creation fails with permission error | Run `gcloud auth application-default login` with an account that is Owner/Editor on the project. |
| Creating users fails on Cloud Run (500) | Service account lacks `roles/firebaseauth.admin`. |
| Firestore "requires an index" error | Open the link in the error message to create it, then add it to `firestore.indexes.json`. |
| Login works but "no active profile" | The Auth user exists without a `users/{uid}` Firestore document (or it's inactive). Use the admin UI or scripts to create users. |

## 7. Known limitations (explicit)
* Not executed end-to-end by the author: API, emulator tests, frontend pages, deployment (see status note).
* Student/teacher search is in-memory (fine for college scale, not for tens of thousands of users).
* One attendance save writes one record per enrolled student in a single transaction → up to ~480 students per subject.
* Admin dashboard cost grows with the number of subjects (two count queries each).
* Admin cannot reset another user's password from the UI (use Firebase Console → Authentication) and admins cannot be edited via the API.
* No date-range filter on the attendance records page (single date filter only); no CSV export.
* No rate limiting beyond Cloud Run's `--max-instances`; consider Cloud Armor/App Check for public production use.
