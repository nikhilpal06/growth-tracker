# Growth Tracker

A small self-hosted web app that tracks a child's growth on the CDC 2000 **"2 to 20 years: Stature-for-age and Weight-for-age percentiles"** charts.

- Log stature and weight by date, with notes. Edit or delete any entry. Export the record as CSV.
- Every measurement is plotted on the chart with the 5th, 10th, 25th, 50th, 75th, 90th and 95th percentile curves, exactly as printed on the CDC chart (girls or boys).
- Each measurement gets its percentile and z-score; BMI is shown whenever both values were taken on the same date.
- Optional parents' heights give a mid-parental target height, the purpose of the "Mother's / Father's stature" boxes on the paper chart.
- Metric (cm/kg) or imperial (in/lb) display.
- Several children can be tracked; each has their own record.

The curves are computed from the CDC's published LMS tables (`statage.csv` and `wtage.csv`, embedded in `src/lib/growth-data.ts`) using the CDC formulas, so they match the printed chart. Ages are computed with the CDC convention of 30.4375 days per month. Measurements taken before age 2 are kept but marked "off chart".

Percentiles describe where a measurement sits among U.S. children of the same age and sex. They are not medical advice; talk to a pediatrician about anything that worries you.

## Run it on your computer

Requires Node.js 22.13 or newer (it uses the built-in `node:sqlite`, no native build step).

```bash
npm install
npm run dev
```

Open http://localhost:3000. Data is stored in `data/growth.db`.

## Host it on Railway

The app ships with a `Dockerfile` and `railway.json`. It needs a persistent volume for the database.

1. Push this folder to a GitHub repository.
2. In Railway, **New Project → Deploy from GitHub repo** and pick that repository. Railway detects the Dockerfile.
3. Open the service, go to **Settings → Networking** and click **Generate Domain**. Note the URL.
4. Go to **Variables** and add:
   - `APP_PASSWORD` – the password for the login screen (required, otherwise anyone with the URL can see the data).
   - `SESSION_SECRET` – any long random string.
   - `APP_URL` – the public URL from step 3, e.g. `https://growth-tracker-production.up.railway.app`.
   - `DATA_DIR` – `/data`.
5. Add a **Volume** to the service (right-click the service → Attach Volume, or **Settings → Volumes**) and mount it at `/data`. This keeps the database across deploys.
6. Deploy. Open the URL, sign in with `APP_PASSWORD`, add your child, and start logging.

Later pushes to the repository redeploy automatically.

## Environment variables

See `.env.example`. Nothing is required on your own machine; `APP_PASSWORD` is required when hosted.

## Backups

Everything lives in one SQLite file, `growth.db`, inside `DATA_DIR`. Copy that file to back up. The **Export CSV** button on the page downloads the full record for one child.
