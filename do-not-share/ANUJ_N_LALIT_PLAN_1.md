# Anuj n Lalit Plan -1

## JADS Platform -- Complete Laptop Setup Guide (Zero Coding Experience Required)

**Date:** 5 March 2026
**Platform version:** 4.0.0
**Goal:** Run the complete JADS platform on your laptop -- backend API (with 6-layer security architecture auto-configured), admin portal, audit portal, 4 agent microservices, and Android app -- for both manned aircraft flight plan filing and drone forensic audit.

**Who this guide is for:** You have a laptop, you use a phone, and you know how to install apps. That's it. Every single step is written out in full.

---

## What You Are About to Build

You are going to start **9 separate programs** on your laptop that together form the JADS platform. Think of it like starting 9 different apps -- each does one job and they all talk to each other.

| # | What It Is | What It Does | How You'll See It |
|---|-----------|-------------|-------------------|
| 1 | **Database** (PostgreSQL) | Stores all the data (users, missions, flight plans) | Runs silently in background -- no window |
| 2 | **Backend API** | The brain -- handles all logic, security, verification | Runs in a terminal window -- shows log messages |
| 3 | **Admin Portal** | Website for DGCA admins to manage airspace, issue clearances | Opens in your web browser at `localhost:5173` |
| 4 | **Audit Portal** | Website for auditors to view forensic mission reports | Opens in your web browser at `localhost:5174` |
| 5-8 | **4 Agent Services** | Small helper programs (NOTAM, Forensics, AFTN, Anomaly) | Run in terminal windows (optional) |
| 9 | **Android App** | The phone app that records drone missions | Runs on your Android phone or emulator |
**Goal:** Run the complete JADS platform on your laptop and phone. This guide assumes you have NEVER done this before. Every single step is described — what to click, what to type, what you should see on your screen, and what to do if something goes wrong.

**Time required:** About 1–2 hours (first time setup). Most of the time is downloading things.

---

## What You Are Setting Up

You are going to run 9 things on your laptop. Think of them like 9 different apps that all talk to each other:

| # | What | What it does (in plain English) | Where you see it |
|---|------|---------------------------------|------------------|
| 1 | **Database** (PostgreSQL) | Stores all the data — like a giant Excel spreadsheet that lives on your laptop | Runs silently in the background (you won't see a window for it) |
| 2 | **Backend Server** | The brain — talks to the database, processes missions, verifies everything | Runs in a terminal window (black screen with text) |
| 3 | **Admin Portal** | A website for government admins to manage airspace, flight plans, clearances | Opens in your web browser (Chrome/Firefox/Edge) |
| 4 | **Audit Portal** | A website for auditors to inspect drone missions and forensic data | Opens in your web browser |
| 5–8 | **4 Agent Services** | Small helper programs that interpret NOTAMs, write reports, draft messages, detect anomalies | Run in terminal windows (optional — everything works without them) |
| 9 | **Android App** | The phone app that drone pilots use to record flights | Runs on your Android phone or a simulated phone on your laptop |

## Before You Start -- What Is a Terminal?

A **terminal** (also called "command line" or "command prompt") is a text-based way to give instructions to your computer. Instead of clicking buttons, you type commands and press Enter.

### How to Open a Terminal

**On Windows:**
1. Press the **Windows key** on your keyboard (the key with the Windows logo, bottom-left)
2. Type `cmd` or `powershell`
3. Click on **"Windows PowerShell"** or **"Command Prompt"** that appears
4. A black (or blue) window will open with a blinking cursor -- this is your terminal

**On Mac:**
1. Press **Cmd + Space** (opens Spotlight search)
2. Type `Terminal`
3. Press **Enter**
4. A white window will open with a blinking cursor -- this is your terminal

**On Linux (Ubuntu):**
1. Press **Ctrl + Alt + T**
2. A terminal window opens

### How to Open Multiple Terminal Tabs/Windows

You will need **4-8 terminal windows open at the same time** (one for each program). Here's how:

**On Windows (PowerShell):**
- Right-click the PowerShell icon in the taskbar > click "Windows PowerShell" again
- OR inside PowerShell, press **Ctrl + Shift + T** (if using Windows Terminal app)

**On Mac (Terminal):**
- Press **Cmd + T** to open a new tab inside the same Terminal window
- OR press **Cmd + N** to open a brand new Terminal window

**On Linux:**
- Press **Ctrl + Shift + T** for a new tab
- OR press **Ctrl + Shift + N** for a new window

### How Terminal Commands Work

When this guide says:
```
cd ~/Jads-2
```

It means:
1. Click inside your terminal window so it's active
2. Type exactly `cd ~/Jads-2` (no extra spaces)
3. Press **Enter**
4. Wait until the blinking cursor comes back (means the command is done)

**Important rules:**
- Copy-paste is your friend. Select the command text in this document, copy it (Ctrl+C on Windows/Linux, Cmd+C on Mac), then paste it into the terminal (right-click in the terminal window, or Ctrl+Shift+V on Linux, or Cmd+V on Mac)
- If a command shows an error (red text or the word "error"), STOP and read the error message
- If nothing seems to happen and the cursor doesn't come back for more than 5 minutes, something is wrong

---

## PHASE 1: Install Required Software

You need to install 4 programs on your laptop. This is like installing apps on your phone -- you download them, run the installer, and click Next a few times.

### 1A. Install Node.js (the engine that runs the backend)

1. Open your web browser (Chrome, Edge, Safari, Firefox -- any will work)
2. Go to: **https://nodejs.org**
3. You will see a big green button that says **"XX.XX.X LTS"** (the numbers may vary -- that's okay)
4. Click that green **LTS** button -- a file will download
5. **On Windows:**
   - Find the downloaded file (usually in your Downloads folder) -- it's called something like `node-v20.xx.x-x64.msi`
   - Double-click it
   - Click **Next** > **Next** > **Next** > **Install** > **Finish**
   - That's it. Node.js is installed.
6. **On Mac:**
   - Find the downloaded `.pkg` file in Downloads
   - Double-click it
   - Click **Continue** > **Continue** > **Agree** > **Install** (enter your Mac password when asked) > **Close**
7. **On Linux (Ubuntu):**
   - Open a terminal and type these two commands, pressing Enter after each:
   ```
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   ```
   - It will ask for your password -- type it (you won't see any characters appear, that's normal) and press Enter
   ```
   sudo apt-get install -y nodejs
   ```

**Verify it worked:** Open a NEW terminal window (close the old one and open a fresh one) and type:
```
node --version
```
Press Enter. You should see something like `v20.11.1` (the exact numbers don't matter, as long as it starts with `v20` or higher).

If you see `'node' is not recognized` or `command not found`, close the terminal, reopen it, and try again. If it still doesn't work, restart your laptop and try once more.

### 1B. Install Docker Desktop (runs the database)

Docker is a program that runs other programs inside little isolated boxes called "containers". You need it to run the PostgreSQL database.

1. Go to: **https://www.docker.com/products/docker-desktop/**
2. Click the big **"Download for Windows"** (or Mac, or Linux) button
3. **On Windows:**
   - Run the downloaded `Docker Desktop Installer.exe`
   - Click **OK** on all prompts. If it asks about "WSL 2", say **Yes**
   - It may ask you to restart your computer -- do it
   - After restart, Docker Desktop will start automatically. You'll see a small whale icon in your system tray (bottom-right corner of your screen near the clock)
   - **IMPORTANT:** The first time Docker starts, it takes 1-2 minutes to fully load. Wait until the whale icon stops animating
4. **On Mac:**
   - Open the downloaded `.dmg` file
   - Drag the Docker icon into the Applications folder
   - Open Docker from your Applications (or Spotlight: Cmd+Space, type "Docker", Enter)
   - It will ask for your password -- enter it
   - Wait for the whale icon to appear in the top menu bar and stop animating
5. **On Linux (Ubuntu):**
   - Follow the instructions at: https://docs.docker.com/desktop/install/linux/ubuntu/
   - OR install Docker Engine directly:
   ```
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose
   sudo usermod -aG docker $USER
   ```
   - Log out and log back in (or restart) for the group change to take effect

**CRITICAL: Docker must be RUNNING before you continue.** Look for:
- **Windows/Mac:** The whale icon in your system tray / menu bar. If it's not there, find Docker Desktop in your Start Menu (Windows) or Applications (Mac) and open it
- **Linux:** Type `docker ps` in terminal. If it doesn't give an error, Docker is running

**Verify it worked:**
```
docker --version
```
You should see something like `Docker version 25.0.3`. If you see an error, make sure Docker Desktop is open and running.

### 1C. Install Git (downloads the code)

Git is a program that downloads code from the internet and tracks changes to it.

**On Windows:**
1. Go to: **https://git-scm.com/download/win**
2. The download starts automatically
3. Run the installer
4. Click **Next** on EVERY screen (the default settings are fine)
5. Click **Install** > **Finish**

**On Mac:**
- Git is already installed on most Macs. Open Terminal and type `git --version`. If it shows a version number, you're done.
- If it says "xcode-select: note: no developer tools were found", a popup will appear asking to install Command Line Tools. Click **Install** and wait.

**On Linux:**
```
sudo apt-get install -y git
```

**Verify it worked:**
```
git --version
```
You should see something like `git version 2.43.0`.

### 1D. Install Android Studio (builds the phone app)

This is only needed if you want to run the Android app. You can skip this for now and come back later.

1. Go to: **https://developer.android.com/studio**
2. Click **"Download Android Studio"**
3. Accept the terms and click **Download**
4. **On Windows:** Run the `.exe` installer. Click **Next** > **Next** > **Next** > **Install**. It will download additional files (~1GB) -- this takes a while on slow internet
5. **On Mac:** Open the `.dmg` and drag Android Studio to Applications
6. When Android Studio opens for the first time, choose **"Standard"** setup and click through all the prompts. It will download SDK components (~2GB) -- let it finish

**Verify it worked:** Open Android Studio. If you see a "Welcome to Android Studio" screen, it's working.

---

## PHASE 2: Download the JADS Code

Now you will download the entire JADS project onto your laptop.

### Step 2.1: Open a terminal

Open a terminal (see "How to Open a Terminal" section above).

### Step 2.2: Navigate to your home folder

Type this and press Enter:

**On Windows (PowerShell):**
```
cd $HOME
```

**On Mac or Linux:**
```
cd ~
```

(`~` is a shortcut that means "my home folder" -- like My Documents but one level up)

### Step 2.3: Download (clone) the project

Type this and press Enter:
```
git clone https://github.com/ysjubb/Jads-2.git
```

**What this does:** It downloads the entire JADS project from GitHub (a code-sharing website) and creates a folder called `Jads-2` on your laptop.

**What you should see:** Lines of text scrolling by, ending with something like "Resolving deltas: 100% ... done."

**If you see "fatal: repository not found":** The repository might be private. Contact the project owner for access. You may need to:
1. Create a GitHub account at https://github.com
2. Share your username with the project owner
3. Accept the repository invitation via email
4. Try the clone command again

**How long this takes:** 30 seconds to 5 minutes depending on internet speed.

### Step 2.4: Enter the project folder

```
cd Jads-2
```

### Step 2.5: Switch to the correct branch

```
git checkout claude/add-claude-documentation-YA3Eb
```

**What this does:** The project has different versions (called "branches"). This command switches to the version that has all the latest setup files.

**What you should see:** Either "Switched to branch 'claude/add-claude-documentation-YA3Eb'" or "Already on 'claude/add-claude-documentation-YA3Eb'".

---

## PHASE 3: Start the Database

The database is where all information is stored -- users, missions, flight plans, everything. We use a program called PostgreSQL, running inside Docker.

### Step 3.1: Make sure Docker is running

Before this step, check that Docker Desktop is open and running (see Phase 1B above). The whale icon should be visible in your system tray.

### Step 3.2: Navigate to the project's core folder

In the same terminal, type:
```
cd do-not-share
```

(If you get "no such file or directory", type `cd ~/Jads-2/do-not-share` instead -- this is the full path.)

### Step 3.3: Start the database

```
docker-compose up -d
```

**What this does:** Tells Docker to download the PostgreSQL database program and start it in the background.

**What you should see:**
- First time: It downloads the PostgreSQL image (~80MB). You'll see "Pulling postgres..." and progress bars.
- After download: You'll see "Creating jads_postgres ... done"

**The `-d` means "detached"** -- the database runs in the background so you can keep using this terminal.

**How to know it worked:**
```
docker ps
```

This shows all running Docker containers. You should see one line with `jads_postgres` and `healthy` (or `Up`):
```
CONTAINER ID   IMAGE              STATUS                  NAMES
abc123...      postgres:16-alpine Up 30 seconds (healthy) jads_postgres
```

If you see nothing, or the status says "Exited" or "Restarting", something is wrong. Common fix:
- Make sure Docker Desktop is open
- Try again: `docker-compose down` then `docker-compose up -d`

### If You Need a Fresh Start Later

If the database gets messed up and you want to erase everything and start over:
```
docker-compose down -v
docker-compose up -d
---

## PHASE 1: Install Required Software

You need to install 4 programs. If you already have any of them, skip that step.

---

### Step 1.1 — Install Node.js

Node.js is what runs the backend server and the web portals.

**On Windows:**
1. Open your web browser (Chrome, Edge, Firefox — any is fine)
2. Go to this address: **https://nodejs.org**
3. You will see a big green button that says **"20.x.x LTS"** (the numbers might be slightly different). Click that green button
4. A file will download — it will be called something like `node-v20.11.1-x64.msi`
5. Find the downloaded file:
   - Look at the bottom of your browser window — there should be a download bar
   - OR press **Ctrl+J** to open the Downloads page
   - OR look in your **Downloads** folder (open File Explorer → click "Downloads" on the left)
6. **Double-click** the downloaded file
7. A setup wizard will appear:
   - Click **"Next"**
   - Check the box that says **"I accept the terms..."** → click **"Next"**
   - Leave the install location as-is → click **"Next"**
   - Leave everything checked → click **"Next"**
   - Click **"Install"**
   - If Windows asks "Do you want to allow this app to make changes?" → click **"Yes"**
   - Wait for the progress bar to finish
   - Click **"Finish"**

**On macOS:**
1. Open Safari (or any browser)
2. Go to **https://nodejs.org**
3. Click the big green **"20.x.x LTS"** button
4. A `.pkg` file will download
5. Open your **Downloads** folder (click the smiley face icon in your dock → Downloads)
6. **Double-click** the `.pkg` file
7. Follow the installer — click **"Continue"** → **"Continue"** → **"Agree"** → **"Install"**
8. Enter your Mac password when asked → click **"Install Software"**
9. Click **"Close"** when done

**On Ubuntu/Linux:**
1. Open a terminal (press **Ctrl+Alt+T**)
2. Type this and press Enter:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
3. Type your password when asked (you won't see the characters — that's normal, just type and press Enter)

---

### Step 1.2 — Install Docker Desktop

Docker runs the database inside a "container" (like a mini virtual computer).

**On Windows:**
1. Go to **https://www.docker.com/products/docker-desktop/**
2. Click the blue button **"Download for Windows"**
3. A file called `Docker Desktop Installer.exe` will download
4. **Double-click** the downloaded file
5. If Windows asks "Do you want to allow this app to make changes?" → click **"Yes"**
6. The installer will run. Leave all checkboxes checked. Click **"Ok"**
7. Wait for it to finish (this takes 2–5 minutes)
8. Click **"Close and restart"** — your computer will restart
9. After restarting, Docker Desktop should open automatically. If it doesn't:
   - Click the **Windows Start button** (bottom-left corner)
   - Type **"Docker Desktop"**
   - Click on the **Docker Desktop** app
10. The first time Docker starts, it shows a tutorial. You can click **"Skip tutorial"** or just close it
11. You should see a whale icon (🐋) in your system tray (bottom-right corner of your screen, near the clock). That means Docker is running

**On macOS:**
1. Go to **https://www.docker.com/products/docker-desktop/**
2. Click **"Download for Mac"**
   - If you have a newer Mac (2020 or later) → choose **"Apple Silicon"**
   - If you have an older Mac → choose **"Intel chip"**
   - Not sure? Click the Apple logo (top-left of screen) → "About This Mac" → look at "Chip" or "Processor". If it says "M1", "M2", "M3", or "M4" → Apple Silicon. If it says "Intel" → Intel
3. A `.dmg` file will download
4. **Double-click** the `.dmg` file
5. A window will appear showing the Docker icon and an Applications folder
6. **Drag the Docker icon onto the Applications folder**
7. Open **Finder** → click **"Applications"** → **double-click "Docker"**
8. If macOS asks "are you sure you want to open it?" → click **"Open"**
9. Enter your Mac password when asked
10. Wait for Docker to start (you'll see a whale icon in the top menu bar)

---

### Step 1.3 — Install Git

Git is used to download the project code.

**On Windows:**
1. Go to **https://git-scm.com/download/win**
2. The download should start automatically. If not, click **"Click here to download manually"**
3. **Double-click** the downloaded file
4. Click **"Next"** through all the screens (the default options are fine)
5. Click **"Install"**
6. Click **"Finish"**

**On macOS:**
Git is already installed. Skip this step. (If it's not, macOS will prompt you to install it the first time you use it — just click "Install" when asked.)

**On Ubuntu/Linux:**
```bash
sudo apt install git
```

**WARNING:** This deletes ALL data in the database. Only do this if you want a completely clean slate.

---

## PHASE 4: Setup & Start the Backend Server

The backend is the "brain" of the platform. It handles all the logic, security checks, and data processing.

### Step 4.1: Navigate to the backend folder

In the same terminal:
```
cd jads-backend
```

(If this doesn't work, use the full path: `cd ~/Jads-2/do-not-share/jads-backend`)

### Step 4.2: Install backend dependencies

```
npm install
```

**What this does:** Downloads all the small software libraries that the backend needs to run (hundreds of them). Think of it like installing an app's required updates.

**What you should see:** Lines scrolling by, eventually ending with "added XXX packages in XX.XXs". This takes 1-3 minutes.

**If you see "npm: command not found":** Node.js isn't installed properly. Go back to Phase 1A.

### Step 4.3: Create the configuration file (.env)

The backend needs a configuration file that tells it passwords, database locations, etc. We'll copy a template and fill it in.

```
cp .env.example .env
```

**What this does:** Copies the template file `.env.example` and creates a new file called `.env` (the period at the start is intentional -- it means "hidden file").

**On Windows PowerShell**, if `cp` doesn't work, use:
```
Copy-Item .env.example .env
```

Now you need to **edit this file** to put in the correct values. Here's how to edit it:

**On Windows:**
```
notepad .env
```
This opens the file in Notepad (the basic text editor).

**On Mac:**
```
open -e .env
```
This opens it in TextEdit.

**On Linux:**
```
nano .env
```
This opens a simple text editor inside the terminal. (To save: press Ctrl+O then Enter. To exit: press Ctrl+X.)

### Step 4.4: What to put in the .env file

Delete everything in the file and paste this EXACT content:

```
NODE_ENV=development
PORT=8080
### Step 1.4 — Install Android Studio

Android Studio is needed to build and run the phone app.

1. Go to **https://developer.android.com/studio**
2. Click the big **"Download Android Studio"** button
3. Check the box to agree to the terms → click **"Download"**
4. The download is large (~1 GB) — it will take a while

**On Windows:**
5. **Double-click** the downloaded `.exe` file
6. Click **"Next"** → make sure **"Android Virtual Device"** is checked → **"Next"** → **"Install"**
7. Wait for installation → click **"Finish"**
8. Android Studio will open for the first time:
   - Choose **"Do not import settings"** → click **"OK"**
   - Click **"Next"** through the setup wizard
   - Choose **"Standard"** installation type → **"Next"**
   - Choose a theme (light or dark — your preference) → **"Next"**
   - Click **"Finish"** — it will download more components (this takes 5–15 minutes)

**On macOS:**
5. **Double-click** the downloaded `.dmg` file
6. Drag **Android Studio** into the **Applications** folder
7. Open **Applications** → **double-click Android Studio**
8. Follow the same setup wizard as Windows (above, steps 8 onwards)

---

### Step 1.5 — Verify Everything Is Installed

Now let's check that everything installed correctly.

**How to open a terminal:**

- **Windows:** Press the **Windows key**, type **"cmd"**, and click **"Command Prompt"**. OR press **Windows key**, type **"powershell"**, and click **"Windows PowerShell"**
- **macOS:** Press **Cmd+Space** (opens Spotlight), type **"Terminal"**, press **Enter**
- **Linux:** Press **Ctrl+Alt+T**

In the terminal, type each of these commands **one at a time**, pressing **Enter** after each one:

```bash
node --version
```
You should see something like: `v20.11.1` (any `v20.x.x` or higher is fine)

**Save the file** (Ctrl+S on Windows/Linux, Cmd+S on Mac) and close the editor.

These are development-only test passwords. They are NOT real secrets -- they're fine for running on your laptop.

### Step 4.5: Set up the database tables

Now we need to create all the database tables (think of them like spreadsheets where data will be stored) and fill in some demo data.

Run these three commands **one at a time**, waiting for each to finish before running the next:

**Command 1 -- Generate the database tools:**
```
npx prisma generate
```
Wait for it to finish (you'll see "Generated Prisma Client"). Takes about 10 seconds.

**Command 2 -- Create all the database tables:**
```
npx prisma migrate deploy
```
Wait for it to finish (you'll see "All migrations have been successfully applied"). Takes about 10-30 seconds.

**Command 3 -- Fill in demo data (test users, sample missions):**
```
npx prisma db seed
```
Wait for it to finish (you'll see "Seeding finished"). Takes about 10-30 seconds.

**What is `npx`?** It's a tool that comes with Node.js. It runs programs that were downloaded by `npm install`. You don't need to install it separately.

**What is Prisma?** It's a tool that manages the database -- creates tables, adds data, etc. Think of it as a translator between the code and the database.

### Step 4.6: What the demo data contains

The seed command created these test accounts you can use:

| Account Type | Username | Password | Where to Use It |
|-------------|----------|----------|----------------|
| **DGCA Super Admin** | `dgca.admin` | `Admin@JADS2024` | Admin Portal website + Audit Portal website |
| **IAF 28 Squadron** | `iaf.28sqn` | `28SQN@Secure2024` | Android App (military user) |
| **Civilian Pilot** | phone: `9999000001` | Any OTP works in dev mode | Android App (civilian user) |

It also created: 3 sample drone missions with GPS data, 2 sample flight plans, airspace zones, NOTAMs, and weather reports.

### Step 4.7: Start the backend server

```
npm run dev
```

**What you should see after a few seconds:**
```
[server_started] { port: 8080, version: '4.0' }
```

You might also see other log messages about jobs starting, triggers being installed, etc. That's all normal.

**IMPORTANT: DO NOT CLOSE THIS TERMINAL WINDOW.** The backend runs as long as this terminal is open. If you close it, the backend stops and nothing else will work.

If you need to stop the backend later (e.g., to restart it), press **Ctrl+C** in this terminal window.

### Step 4.8: Test that the backend is working

Open a **new terminal window** (see "How to Open Multiple Terminal Tabs" section above). In this new terminal, type:

```
curl http://localhost:8080/health
```

**What you should see:**
```json
{"status":"ok","version":"4.0",...}
```

If you see this, the backend is running correctly.

**On Windows** if `curl` doesn't work: Open your web browser and go to `http://localhost:8080/health`. You should see the same JSON text in the browser.

**If you see "connection refused":** The backend isn't running. Go back to your other terminal and check for error messages.
```bash
npm --version
```
You should see something like: `10.2.4` (any `10.x.x` or higher is fine)

```bash
docker --version
```
You should see something like: `Docker version 25.0.3`

```bash
git --version
```
You should see something like: `git version 2.43.0`

```bash
java -version
```
You should see something like: `openjdk version "17.0.x"` (17 is important)

**If `java -version` shows nothing or the wrong version:**
- Android Studio bundles Java 17. You may need to open Android Studio first (it installs Java automatically)
- On the terminal, try: `java --version` (with two dashes)

**If any command shows "command not found" or an error:**
- Go back to the install step for that program
- Make sure you completed the installation
- On Windows, you might need to **close and reopen** the terminal after installing

---

## PHASE 2: Download the Project Code

### Step 2.1 — Open a terminal

(See "How to open a terminal" above if you don't have one open already)

### Step 2.2 — Go to your home folder

Type this and press Enter:

**On Windows (Command Prompt):**
```bash
cd %USERPROFILE%
```

**On Windows (PowerShell), macOS, or Linux:**
```bash
cd ~
```

### Step 2.3 — Download (clone) the project

Type this and press Enter:
```bash
git clone https://github.com/ysjubb/Jads-2.git
```

You will see text scrolling as it downloads. Wait for it to finish. It should say something like:
```
Cloning into 'Jads-2'...
remote: Enumerating objects: ...
Receiving objects: 100% ...
```

### Step 2.4 — Go into the project folder

```bash
cd Jads-2
```

The Admin Portal is a website that runs on your laptop. Government admins use it to manage airspace, view flight plans, and issue clearances.

### Step 5.1: Open a NEW terminal window

You need a fresh terminal. The backend terminal must stay open and running.

Open a new terminal window or tab (see instructions above).

### Step 5.2: Navigate to the admin portal folder

```
cd ~/Jads-2/do-not-share/jads-admin-portal
```

**On Windows PowerShell**, use:
```
cd $HOME\Jads-2\do-not-share\jads-admin-portal
```

### Step 5.3: Install dependencies and start

```
npm install
```
Wait for it to finish (1-2 minutes).

```
npm run dev
```

**What you should see:**
```
VITE v5.x.x  ready in xxx ms
  Local:   http://localhost:5173/
```

### Step 5.4: Open the Admin Portal in your browser

Open your web browser (Chrome, Edge, Firefox, Safari) and go to:

**http://localhost:5173**

(Type it in the address bar at the top of the browser, not in Google search.)

You should see a **login page**.

### Step 5.5: Log in

- **Username:** `dgca.admin`
- **Password:** `Admin@JADS2024`

Click the Login button. You should see a dashboard with system statistics.

### What you can explore in the Admin Portal:

- **Dashboard** -- System overview, active stats
- **Flight Plans** -- View filed manned aircraft plans, issue ADC/FIC clearance, compare OFPL, view AFTN messages (FPL, CNL, DLA)
- **OFPL Comparison Tool** -- Paste an external OFPL, JADS highlights differences
- **Users** -- Manage civilian operators
- **Special Users** -- Manage IAF/DGCA/Army/Navy/DRDO/HAL/BSF/CRPF accounts (27 entities)
- **Drone Zones** -- Manage RED/YELLOW/GREEN airspace zones
- **Airspace** -- Version control with two-person approval workflow

**KEEP THIS TERMINAL RUNNING.** Do not close it.
### Step 2.5 — Switch to the correct branch

```bash
git checkout claude/add-claude-documentation-YA3Eb
```

You should see: `Switched to branch 'claude/add-claude-documentation-YA3Eb'`

If you see `Already on 'claude/add-claude-documentation-YA3Eb'` — that's fine too.

---

## PHASE 3: Start the Database

The database is where all the platform's data lives. We run it using Docker.

### Step 3.1 — Make sure Docker is running

- **Windows:** Look at the bottom-right of your screen (system tray, near the clock). You should see a whale icon (🐋). If you don't see it, open the Start menu, type "Docker Desktop", and open it. Wait until it says "Docker Desktop is running"
- **macOS:** Look at the top menu bar. You should see a whale icon. If not, open Applications → Docker

The Audit Portal is another website for forensic auditors to examine drone mission data with cryptographic proof.

### Step 6.1: Open ANOTHER new terminal window

You now have at least 2 terminals running (backend + admin portal). Open a third one.

### Step 6.2: Navigate, install, and start

```
cd ~/Jads-2/do-not-share/jads-audit-portal
```

(On Windows: `cd $HOME\Jads-2\do-not-share\jads-audit-portal`)

```
npm install
```
Wait for it to finish.

```
npm run dev
```

**What you should see:**
```
VITE v5.x.x  ready in xxx ms
  Local:   http://localhost:5174/
```

### Step 6.3: Open in browser

Go to: **http://localhost:5174**

Login with the same credentials: `dgca.admin` / `Admin@JADS2024`

### What you can explore:

- **Missions** -- Browse drone missions with 10-point forensic verification
- **Mission Detail** -- Full cryptographic breakdown (hash chain, ECDSA signatures, NTP sync, geofence compliance)
- **Flight Plans** -- View manned aircraft flight plans with AFTN message history
- **Violations** -- Browse geofence, altitude, and proximity violations
### Step 3.2 — Navigate to the right folder

In your terminal, type:
```bash
cd ~/Jads-2/do-not-share
```

**On Windows (Command Prompt) use:**
```bash
cd %USERPROFILE%\Jads-2\do-not-share
```

### Step 3.3 — Start the database

Type:
```bash
docker-compose up -d
```

- The first time you run this, Docker will download the PostgreSQL image (~150 MB). You'll see download progress bars
- When it's done, you'll see: `Creating jads_postgres ... done` (or similar)

### Step 3.4 — Verify the database is running

Type:
```bash
docker ps
```

These are 4 small helper programs. They add "smart" features like interpreting NOTAMs in plain English or generating forensic narratives. The main system works without them, but they make the demo better.

### Option A: Start each agent in a separate terminal (recommended for beginners)

You need **4 more terminal windows**. For each agent, open a new terminal and run the commands shown.

**Agent 1 -- NOTAM Interpreter (Terminal 5):**
```
cd ~/Jads-2/do-not-share/agents/notam-interpreter
npm install
npx ts-node index.ts
```
You should see: `NOTAM Interpreter running on port 3101`

**Agent 2 -- Forensic Narrator (Terminal 6):**
```
cd ~/Jads-2/do-not-share/agents/forensic-narrator
npm install
npx ts-node index.ts
```
You should see: `Forensic Narrator running on port 3102`

**Agent 3 -- AFTN Draft (Terminal 7):**
```
cd ~/Jads-2/do-not-share/agents/aftn-draft
npm install
npx ts-node index.ts
```
You should see: `AFTN Draft running on port 3103`

**Agent 4 -- Anomaly Advisor (Terminal 8):**
```
cd ~/Jads-2/do-not-share/agents/anomaly-advisor
npm install
npx ts-node index.ts
You should see a table with one row. Look for:
- **IMAGE**: `postgres:16-alpine`
- **STATUS**: `Up X seconds` (or `Up X minutes`)
- **PORTS**: `0.0.0.0:5432->5432/tcp`

If you see that — the database is running. If the table is empty, something went wrong. Try:
```bash
docker-compose down
docker-compose up -d
```

**If you ever want to wipe the database and start completely fresh:**
```bash
docker-compose down -v
docker-compose up -d
```
(The `-v` deletes all stored data. Only do this if you want to reset everything.)

---

## PHASE 4: Start the Backend Server

The backend server is the "brain" of the platform. It processes everything.

### Step 4.1 — Open a NEW terminal window

**IMPORTANT:** Leave your current terminal open. Open a brand new one:
- **Windows:** Right-click the Command Prompt icon in the taskbar → click **"Command Prompt"** again. OR press **Windows key**, type "cmd", Enter
- **macOS:** In the Terminal app, press **Cmd+N** (this opens a new window). OR press **Cmd+T** (this opens a new tab)
- **Linux:** Press **Ctrl+Alt+T** for a new terminal window. OR in your terminal, press **Ctrl+Shift+T** for a new tab

### Step 4.2 — Navigate to the backend folder

```bash
cd ~/Jads-2/do-not-share/jads-backend
```
You should see: `Anomaly Advisor running on port 3104`

### Option B: Start all 4 agents with one command (advanced)

If you're comfortable with the terminal, open ONE new terminal and run:
```
cd ~/Jads-2/do-not-share/agents
for agent in notam-interpreter forensic-narrator aftn-draft anomaly-advisor; do
  (cd $agent && npm install && npx ts-node index.ts &)
done
```

### Verify all agents are running

Open yet another terminal (or use any existing one) and run:
```
curl http://localhost:3101/health
curl http://localhost:3102/health
curl http://localhost:3103/health
curl http://localhost:3104/health
```

Each should return a JSON response. If any returns "connection refused", that agent isn't running.
**Windows (Command Prompt):**
```bash
cd %USERPROFILE%\Jads-2\do-not-share\jads-backend
```

### Step 4.3 — Install dependencies

```bash
npm install
```

- This downloads all the code libraries the backend needs
- You'll see a progress bar and lots of text scrolling
- It should finish with something like: `added 485 packages in 30s`
- **If you see warnings** (yellow text) — that's normal, ignore them
- **If you see errors** (red text saying "ERR!") — check that Node.js is installed correctly (go back to Step 1.1)

### Step 4.4 — Create the configuration file

The backend needs a `.env` file that tells it how to connect to the database and what secret keys to use.

```bash
cp .env.example .env
```

This copies the example file to create your actual config file.

This is the most complex phase. If you just want to test the web portals, you can skip this entirely.

### 7a. Open the project in Android Studio

1. Open **Android Studio** (from Start Menu / Applications / etc.)
2. If you see the "Welcome" screen, click **"Open"**
   - If you see an existing project, go to **File > Open**
3. A file browser appears. Navigate to:
   - **Windows:** `C:\Users\YOUR_USERNAME\Jads-2\do-not-share\jads-android`
   - **Mac:** `/Users/YOUR_USERNAME/Jads-2/do-not-share/jads-android`
   - **Linux:** `/home/YOUR_USERNAME/Jads-2/do-not-share/jads-android`
4. Select the `jads-android` folder and click **OK** (or **Open**)
5. Android Studio will start "syncing" the project -- this means it's downloading all the Android libraries the app needs

**First-time sync takes 5-15 minutes and downloads ~150MB.** You need internet. You'll see a progress bar at the bottom of Android Studio.

**What "success" looks like:** A green checkmark or "BUILD SUCCESSFUL" in the bottom bar. No red error banners at the top.

### 7b. Generate the Gradle wrapper (only if sync fails)

If Android Studio says something about "Gradle wrapper not found", do this:

1. Open a terminal
2. Navigate to the android folder:
   ```
   cd ~/Jads-2/do-not-share/jads-android
   ```
3. **On Mac/Linux:**
   ```
   brew install gradle
   ```
   (If `brew` is not found on Mac, install it first: go to https://brew.sh and follow their one-line install command)

   **On Linux (Ubuntu):**
   ```
   sudo apt install gradle
   ```

   **On Windows:**
   - Go to https://gradle.org/install/
   - Download the zip file
   - Extract it to `C:\Gradle`
   - Add `C:\Gradle\bin` to your PATH (Google "add to PATH Windows" if unsure)

4. Then run:
   ```
   gradle wrapper --gradle-version 8.6
   ```

5. Go back to Android Studio and click **"Sync Project with Gradle Files"** (the elephant icon with a blue arrow at the top toolbar)

### 7c. Fix the backend URL (CRITICAL)

By default, the Android app tries to connect to a production server that doesn't exist. You need to change it to connect to your laptop instead.

**You need to edit 2 files.** Here's how to find and edit them in Android Studio:

#### File 1: MissionForegroundService.kt

1. In Android Studio, look at the left panel (called "Project" panel). If you don't see it, press **Alt+1** (Windows/Linux) or **Cmd+1** (Mac)
2. Navigate through the folders: `app` > `src` > `main` > `kotlin` > `com` > `jads` > `service`
3. Double-click on **`MissionForegroundService.kt`** to open it
4. Press **Ctrl+G** (Windows/Linux) or **Cmd+L** (Mac) to "Go to Line"
5. Type `107` and press Enter -- this takes you to line 107
6. You should see a line that says:
   ```
   backendUrl = "https://jads.internal/api"
   ```
7. Change it to:
   - **If using Android Emulator:**
     ```
     backendUrl = "http://10.0.2.2:8080/api"
     ```
   - **If using a real phone on the same WiFi:**
     ```
     backendUrl = "http://YOUR_LAPTOP_IP:8080/api"
     ```
     (Replace `YOUR_LAPTOP_IP` with your actual laptop IP -- see below for how to find it)

8. Save the file: **Ctrl+S** (Windows/Linux) or **Cmd+S** (Mac)

#### File 2: AppPreferences.kt

1. In the left panel, navigate: `app` > `src` > `main` > `kotlin` > `com` > `jads` > `storage`
2. Double-click **`AppPreferences.kt`**
3. Go to line 75 (Ctrl+G or Cmd+L, type 75)
4. You should see:
   ```
   private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:3000"
   ```
5. Change it to:
   - **Emulator:** `"http://10.0.2.2:8080"`
   - **Real phone:** `"http://YOUR_LAPTOP_IP:8080"`
6. Save the file

#### How to Find Your Laptop's IP Address

Your laptop's IP address is a number like `192.168.1.105` that identifies it on your WiFi network.

**On Windows:**
1. Open a terminal (PowerShell or CMD)
2. Type: `ipconfig`
3. Press Enter
4. Look for **"Wireless LAN adapter Wi-Fi"** (or "Ethernet adapter" if using a cable)
5. Find the line that says **"IPv4 Address"** -- the number next to it (e.g., `192.168.1.105`) is your IP

**On Mac:**
1. Open a terminal
2. Type: `ifconfig | grep "inet "`
3. Press Enter
4. Look for a line with `192.168.x.x` or `10.x.x.x` -- that's your IP
5. Ignore the line with `127.0.0.1` (that's not it)

**On Linux:**
1. Open a terminal
2. Type: `ip addr show | grep "inet "`
3. Look for `192.168.x.x` or `10.x.x.x`
4. Ignore `127.0.0.1`

### 7d. Build the APK (the app file)

**From Android Studio:**
1. Go to menu: **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
2. Wait for the build to finish (1-5 minutes)
3. When done, a small notification appears at the bottom saying "Build APK(s) successful" with a "locate" link -- click it to find the APK file

**From terminal (alternative):**
```
cd ~/Jads-2/do-not-share/jads-android
./gradlew assembleDebug
```
(On Windows: `.\gradlew.bat assembleDebug`)

The APK file will be at: `app/build/outputs/apk/debug/app-debug.apk`

### 7e. Run the app

#### Option A: Android Emulator (no phone needed)

1. In Android Studio, go to menu: **Tools > Device Manager**
2. Click **"Create Virtual Device"**
3. Select **"Pixel 7"** (or any phone), click **Next**
4. Select a system image with **API 34** -- click **Download** next to it if needed (downloads ~1GB)
5. Click **Next** > **Finish**
6. Back in the main Android Studio window, you'll see the emulator in the device dropdown (top toolbar, near the green play button)
7. Click the green **Run** button (triangle icon)
8. The emulator starts (takes 1-2 minutes first time) and the app installs and opens

#### Option B: Physical Android Phone

1. **On your phone:** Go to **Settings > About Phone**
2. Tap **"Build Number"** 7 times rapidly -- you'll see a toast message "You are now a developer!"
3. Go back to **Settings > System > Developer Options** (might be in a different location depending on your phone brand)
4. Turn ON **"USB Debugging"**
5. Connect your phone to your laptop with a USB cable
6. A popup will appear on your phone: **"Allow USB Debugging?"** -- tap **Allow** (check "Always allow" if you want)
7. In Android Studio, your phone should now appear in the device dropdown at the top
8. Click the green **Run** button

### 7f. Network: Phone and Laptop Must Talk to Each Other

For the app on your phone to communicate with the backend on your laptop, they must be on the same network.

**Option A -- Same WiFi (easiest):**
- Connect both your phone and laptop to the same WiFi network (e.g., your home WiFi)
- Use the laptop IP from step 7c

**Option B -- Phone Hotspot:**
- Turn on mobile hotspot on your phone (Settings > Hotspot)
- Connect your laptop to the phone's hotspot WiFi
- Find your laptop's new IP (it will be something like `192.168.43.x`)

**Option C -- USB Tethering:**
- Connect phone via USB
- On your phone: Settings > Tethering > USB Tethering: ON
- The laptop gets an IP from the phone

---

## PHASE 8: Test the Complete System

### Test 1: Admin Portal -- Flight Plan Demo

1. Open your browser and go to **http://localhost:5173**
2. Login: `dgca.admin` / `Admin@JADS2024`
3. Click **"Flight Plans"** in the menu
4. You'll see 2 pre-loaded flight plans from the demo data
5. Click on any flight plan to see its details
6. Try clicking **"AFTN Message"** to see the generated ICAO FPL message
7. Try the **"Compare with OFPL"** button (paste any text starting with `(FPL-` to test)

### Test 2: Audit Portal -- Forensic Verification

1. Open a new browser tab and go to **http://localhost:5174**
2. Login: `dgca.admin` / `Admin@JADS2024`
3. Click **"Missions"** in the menu
4. You'll see 3 sample drone missions
5. Click any mission to see the full forensic breakdown:
   - Hash chain integrity (every record cryptographically linked to the previous)
   - ECDSA signature verification
   - NTP time synchronization status
   - Geofence compliance check

### Test 3: Android App -- Drone Mission (if you set up Phase 7)

1. Open the JADS app on your phone/emulator
2. Login with: `iaf.28sqn` / `28SQN@Secure2024`
3. Grant location permissions when prompted (tap "Allow")
4. Set up a mission (enter mission parameters)
5. Start the mission -- the phone starts recording GPS data
6. Let it run for 30-60 seconds
7. Stop the mission -- it uploads data to the backend
8. Go to the Audit Portal (http://localhost:5174) -- the mission should appear in the missions list

---

## Terminal Windows Summary -- What Should Be Running

When everything is set up, you'll have these terminal windows open:

| Terminal # | What's Running | How You Started It | Port |
|-----------|---------------|-------------------|------|
| 1 | Database (PostgreSQL) | `docker-compose up -d` | 5432 (runs silently in background) |
| 2 | Backend API | `npm run dev` in jads-backend/ | 8080 |
| 3 | Admin Portal | `npm run dev` in jads-admin-portal/ | 5173 |
| 4 | Audit Portal | `npm run dev` in jads-audit-portal/ | 5174 |
| 5 | NOTAM Interpreter (optional) | `npx ts-node index.ts` in agents/notam-interpreter/ | 3101 |
| 6 | Forensic Narrator (optional) | `npx ts-node index.ts` in agents/forensic-narrator/ | 3102 |
| 7 | AFTN Draft (optional) | `npx ts-node index.ts` in agents/aftn-draft/ | 3103 |
| 8 | Anomaly Advisor (optional) | `npx ts-node index.ts` in agents/anomaly-advisor/ | 3104 |

Plus **Android Studio** if you're building the phone app.

**Terminals 2, 3, and 4 MUST stay open.** If you close them, those services stop.

Terminal 1 (database) runs in the background -- you can close that terminal window and the database keeps running. To stop the database later: open a terminal, `cd ~/Jads-2/do-not-share`, then `docker-compose down`.

---

## Quick Reference -- All URLs

| What | URL | Need Backend Running? |
|------|-----|----------------------|
| Backend Health Check | http://localhost:8080/health | Yes |
| Admin Portal | http://localhost:5173 | Yes (backend + admin terminal) |
| Audit Portal | http://localhost:5174 | Yes (backend + audit terminal) |
| Phone App Backend (from phone) | http://YOUR_LAPTOP_IP:8080 | Yes (same WiFi required) |
**Now open the `.env` file in a text editor and change its contents:**

**On Windows:**
```bash
notepad .env
```

**On macOS:**
```bash
open -e .env
```

**On Linux:**
```bash
nano .env
```

**Delete everything in the file and paste this instead:**

```env
NODE_ENV=development
PORT=8080

DATABASE_URL=postgresql://jads:jads_dev_password@localhost:5432/jads_dev

JWT_SECRET=aabbccddee11223344556677889900aabbccddee11223344556677889900aabb
ADMIN_JWT_SECRET=ff00ee11dd22cc33bb44aa5566778899ff00ee11dd22cc33bb44aa5566778899
ADAPTER_INBOUND_KEY=deadbeef12345678deadbeef12345678

USE_LIVE_ADAPTERS=false
```

**Save the file:**
- **Notepad (Windows):** Press **Ctrl+S**, then close Notepad
- **TextEdit (macOS):** Press **Cmd+S**, then close TextEdit
- **nano (Linux):** Press **Ctrl+O**, then **Enter** to save, then **Ctrl+X** to exit

These are development-only test secrets. They are fine for testing on your laptop. Never use these in a real deployment.

### Step 4.5 — Set up the database tables and demo data

Run these three commands **one at a time**, waiting for each to finish before running the next:

```bash
npx prisma generate
```
Wait for it to finish. You should see: `✔ Generated Prisma Client`

```bash
npx prisma migrate deploy
```
Wait for it to finish. You should see: `All migrations have been successfully applied`

```bash
npx prisma db seed
```
Wait for it to finish. You should see output about seeding data — admin accounts, demo missions, etc.

**This creates these demo accounts you can use later:**

| Who | Username | Password | Where to use it |
|-----|----------|----------|-----------------|
| **DGCA Super Admin** | `dgca.admin` | `Admin@JADS2024` | Admin Portal website + Audit Portal website |
| **IAF 28 Squadron** | `iaf.28sqn` | `28SQN@Secure2024` | Android phone app |
| **Civilian Pilot** | phone number: `9999000001` | Any OTP code works in dev mode | Android phone app |

### Step 4.6 — Start the backend server

```bash
npm run dev
```

You should see output like:
```
[server_started] { port: 8080, version: '4.0' }
```

**⚠️ DO NOT CLOSE THIS TERMINAL WINDOW. Leave it running. The backend must stay on.**

If you close it, everything else will stop working.

### Step 4.7 — Verify the backend is working

Open **another new terminal** (see Step 4.1 for how). Type:

```bash
curl http://localhost:8080/health
```

You should see something like:
```json
{"status":"ok","version":"4.0","timestamp":"2026-03-04T..."}
```

**On Windows** if `curl` doesn't work:
- Open your web browser
- Type `http://localhost:8080/health` in the address bar and press Enter
- You should see the same JSON text on the page

If you see that — the backend is working!

---

## PHASE 5: Start the Admin Portal

The Admin Portal is a website that runs on your laptop for government admins.

### Step 5.1 — Open a NEW terminal window

(Same as Step 4.1 — keep all previous terminals open)

### Step 5.2 — Navigate to the admin portal folder

```bash
cd ~/Jads-2/do-not-share/jads-admin-portal
```

**Windows:**
```bash
cd %USERPROFILE%\Jads-2\do-not-share\jads-admin-portal
```

## Quick Reference -- All Credentials

| Where | Username | Password |
|-------|----------|----------|
| Admin Portal | `dgca.admin` | `Admin@JADS2024` |
| Audit Portal | `dgca.admin` | `Admin@JADS2024` |
| Android App (Military) | `iaf.28sqn` | `28SQN@Secure2024` |
| Android App (Civilian) | phone: `9999000001` | Any OTP (dev mode accepts anything) |

---

## Troubleshooting -- If Something Goes Wrong

### "I typed a command and got an error"

Read the error message carefully. Here are the most common ones:

| Error Message | What It Means | How to Fix |
|--------------|--------------|-----------|
| `'node' is not recognized` or `command not found: node` | Node.js isn't installed, or the terminal can't find it | Close the terminal, reopen it, try again. If still broken, reinstall Node.js (Phase 1A) and restart your computer |
| `'docker' is not recognized` or `command not found: docker` | Docker isn't installed or isn't running | Install Docker Desktop (Phase 1B). Make sure the whale icon is in your system tray |
| `'git' is not recognized` or `command not found: git` | Git isn't installed | Install Git (Phase 1C) |
| `ECONNREFUSED localhost:5432` or `connect ECONNREFUSED` | The database isn't running | Run `docker-compose up -d` in the `do-not-share/` folder. Check Docker Desktop is open |
| `FATAL: Missing required environment variable` | The `.env` file is missing or incomplete | Go to `jads-backend/` folder and check the `.env` file exists. Follow Phase 4.3-4.4 |
| `Error: Cannot find module '...'` | You forgot to run `npm install` | Run `npm install` in the folder that's giving the error |
| `EADDRINUSE: port already in use` | Something else is using that port, or you started the same thing twice | Close the other terminal that's running the same program, or restart your computer |
| `npm ERR! code ENOENT` with `package.json` | You're in the wrong folder | Check what folder you're in (`pwd` on Mac/Linux, `Get-Location` on Windows PowerShell) and navigate to the correct one |

### "The Admin Portal / Audit Portal shows a blank white page"

The backend isn't running. Check Terminal 2 -- is it still showing the backend? If not, restart it:
```
cd ~/Jads-2/do-not-share/jads-backend
npm run dev
```

### "The Android app says 'Network Error' or 'Connection refused'"

1. Check the backend is running (Terminal 2)
2. Check the IP address in the two Kotlin files (Phase 7c) is correct
3. Make sure your phone and laptop are on the same WiFi network
4. Try opening `http://YOUR_LAPTOP_IP:8080/health` in your phone's browser -- if it doesn't work, it's a network issue

### "Android Studio says 'Gradle sync failed'"

- **"Gradle JVM not found":** In Android Studio, go to **File > Project Structure > SDK Location** and make sure the JDK path points to Java 17
- **"Could not resolve dependencies":** You need internet for the first sync. Check your connection.
- **"Kotlin daemon failed":** You don't have enough RAM. Close other programs (especially Chrome with many tabs)

### "I closed a terminal by accident"

Just open a new terminal, navigate to the correct folder, and run the startup command again. For example, if you closed the backend terminal:
```
cd ~/Jads-2/do-not-share/jads-backend
npm run dev
```

### "I want to stop everything and shut down"

1. In each terminal running a service, press **Ctrl+C** to stop it
2. To stop the database: open a terminal, then:
   ```
   cd ~/Jads-2/do-not-share
   docker-compose down
   ```
3. Close all terminal windows
4. (Optional) Close Docker Desktop

### "I want to start everything again tomorrow"

1. Open Docker Desktop (wait for the whale icon)
2. Start the database:
   ```
   cd ~/Jads-2/do-not-share
   docker-compose up -d
   ```
3. Start the backend:
   ```
   cd ~/Jads-2/do-not-share/jads-backend
   npm run dev
   ```
4. Start admin portal (new terminal):
   ```
   cd ~/Jads-2/do-not-share/jads-admin-portal
   npm run dev
   ```
5. Start audit portal (new terminal):
   ```
   cd ~/Jads-2/do-not-share/jads-audit-portal
   npm run dev
   ```
6. You do NOT need to run `npm install` or `npx prisma` commands again -- those are one-time setup only

---

## Architecture Overview (for reference)

| Component | Port | Technology | Purpose |
|-----------|------|-----------|---------|
| **PostgreSQL Database** | `localhost:5432` | Docker (postgres:16-alpine) | Primary data store + audit log with immutability triggers |
| **Backend API** | `localhost:8080` | Node.js + Express + Prisma | 5-stage OFPL pipeline, 10-point forensic engine, 7 background jobs |
| **Admin Portal** | `localhost:5173` | React + Vite | Airspace CMS, flight plans, ADC/FIC clearance, OFPL comparison |
| **Audit Portal** | `localhost:5174` | React + Vite | Forensic mission viewer, DJI import, role-scoped access |
| **NOTAM Interpreter** | `localhost:3101` | Express microservice | Parses raw NOTAMs into structured advisories |
| **Forensic Narrator** | `localhost:3102` | Express microservice | Mission data into human-readable forensic narrative |
| **AFTN Draft** | `localhost:3103` | Express microservice | Structured input into ICAO AFTN message draft |
| **Anomaly Advisor** | `localhost:3104` | Express microservice | Telemetry into anomaly detection report |
| **Android App** | Physical device / emulator | Kotlin + Jetpack Compose | ECDSA + ML-DSA-65 signing, hash chains, NTP quorum |
### Step 5.3 — Install dependencies and start

```bash
npm install
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

**⚠️ DO NOT CLOSE THIS TERMINAL. Leave it running.**

### Step 5.4 — Open the Admin Portal in your browser

1. Open your web browser (Chrome, Firefox, Edge — any is fine)
2. Click on the address bar at the top of the browser (where you normally type website addresses)
3. Type: **http://localhost:5173**
4. Press **Enter**

You should see the **JADS Admin Portal login page**.

### Step 5.5 — Log in

1. You'll see two text boxes: one for **Username** and one for **Password**
2. Click on the **Username** box and type: `dgca.admin`
3. Click on the **Password** box and type: `Admin@JADS2024`
4. Click the **"Login"** button (or press Enter)

You should now see the **Dashboard** — a page with system statistics, entity counts, and an overview of the platform.

### Step 5.6 — Explore the Admin Portal

After logging in, look at the **left side of the screen** (or the top menu). You should see navigation links:

| Menu item | What you'll see when you click it | What you can do there |
|-----------|----------------------------------|----------------------|
| **Dashboard** | System overview — number of missions, users, flight plans | Just look at the numbers |
| **Flight Plans** | A table showing filed manned aircraft flight plans | Click any row to see its AFTN message. Click "Compare with OFPL" to paste an external flight plan and see how it differs. Click "Issue ADC/FIC" to simulate clearance issuance |
| **Users** | A table of civilian operators | View Aadhaar-verified pilot accounts |
| **Special Users** | Government/military accounts | See the 27 government entities (DGCA, IAF, Army, Navy, DRDO, HAL, BSF, CRPF, etc.) |
| **Drone Zones** | RED/YELLOW/GREEN airspace zones on a list | Manage drone zone classifications with 5km/8km airport proximity gates |
| **Airspace** | Airspace version control | Create airspace changes and see the two-person approval workflow (one person creates, a different person must approve) |

---

## PHASE 6: Start the Audit Portal

The Audit Portal is a separate website for forensic auditors.

### Step 6.1 — Open a NEW terminal window

(Keep all previous terminals open)

### Step 6.2 — Navigate, install, and start

```bash
cd ~/Jads-2/do-not-share/jads-audit-portal
npm install
npm run dev
```

1. **AFTN Gateway** -- Uses a stub (fake). Does NOT transmit to real AFMLU/FIR networks. ADC/FIC numbers must be issued manually via Admin Portal.
2. **Digital Sky API** -- Uses a hardcoded zone map. No live connection to DGCA Digital Sky.
3. **Aadhaar Verification** -- Stub mode. Accepts any OTP in development.
4. **METAR/NOTAM** -- Stub adapters return hardcoded data. No live feed from IMD/AAI.
5. **Background Upload URL** -- `MissionForegroundService.kt` line 107 has a hardcoded URL that must be changed for local dev (see Phase 7c).
**Windows:**
```bash
cd %USERPROFILE%\Jads-2\do-not-share\jads-audit-portal
npm install
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

## Sovereign Handover Architecture -- Adapter Pattern

The platform is designed for **government handover**: every external dependency (AFTN, Digital Sky, METAR, NOTAM, UIDAI, AFMLU, FIR) is abstracted behind a TypeScript interface with a development stub. Government integrators replace stubs with live implementations -- zero application code changes required.
  ➜  Local:   http://localhost:5174/
```

**⚠️ DO NOT CLOSE THIS TERMINAL.**

### Step 6.3 — Open the Audit Portal in your browser

| Interface | Stub | What It Abstracts |
|-----------|------|-------------------|
| `IAftnGateway.ts` | `AftnGatewayStub.ts` | AFTN flight plan filing with ATC (Doc 4444 FPL/DLA/CNL/CHG) |
| `IAfmluAdapter.ts` | `AfmluAdapterStub.ts` | AFMLU data -- ADC (Air Defence Clearance) coordination records, defence airspace GeoJSON polygons |
| `IFirAdapter.ts` | `FirAdapterStub.ts` | FIR circulars (FIC records, supersedes chain) |
| `IMetarAdapter.ts` | `MetarAdapterStub.ts` | Weather observations for 12 major Indian aerodromes |
| `INotamAdapter.ts` | `NotamAdapterStub.ts` | NOTAMs for all 4 Indian FIRs (VIDF, VABB, VECC, VOMF) |

### Injection Pattern -- Constructor Defaults
1. Open a **new browser tab** (press **Ctrl+T** on Windows/Linux, or **Cmd+T** on macOS)
2. Type in the address bar: **http://localhost:5174**
3. Press **Enter**

You'll see the Audit Portal login page. Log in with the same credentials:
- Username: `dgca.admin`
- Password: `Admin@JADS2024`

### Step 6.4 — Explore the Audit Portal

```typescript
// FlightPlanService.ts -- swap AftnGatewayStub for live AFTN gateway
constructor(prisma: PrismaClient, aftnGateway: IAftnGateway = new AftnGatewayStub())

// MetarPollJob.ts -- swap for live IMD/AAI METAR feed
constructor(prisma: PrismaClient, adapter?: IMetarAdapter)

// AirspaceDataPollJob.ts -- swap all three simultaneously
constructor(prisma, afmluAdapter = new AfmluAdapterStub(), firAdapter = new FirAdapterStub(), metarAdapter = new MetarAdapterStub())
```

### Inbound Webhooks -- Government Systems Push to JADS
After logging in, you should see navigation links:

| Menu item | What you'll see | What to look for |
|-----------|----------------|-----------------|
| **Missions** | A list of drone missions (3 seeded demo missions) | Click any mission to see the full forensic breakdown |
| **Mission Detail** (after clicking a mission) | Hash chain integrity, ECDSA signature status, NTP sync, geofence compliance, NPNT zone, GNSS integrity, PQC status, device trust score | Look at the "Invariants" section — each shows PASS or FAIL |
| **Flight Plans** | Manned aircraft flight plans with AFTN message history and clearance status | See which plans have ADC/FIC clearance |
| **Violations** | Geofence breaches, altitude violations, airport proximity warnings | Click a violation to see which mission it belongs to |

---

## PHASE 6B: Start the Agent Microservices (Optional)

These 4 small services add extra features (NOTAM interpretation, forensic narratives, AFTN drafting, anomaly detection). **Everything works without them** — they just make the output more human-readable.

### Option A: Start them one by one (beginner-friendly)

### Polling Jobs -- JADS Pulls from Government Systems
You need **4 more terminal windows**. For each agent:

**Agent 1 — NOTAM Interpreter (open a new terminal):**
```bash
cd ~/Jads-2/do-not-share/agents/notam-interpreter
npm install
npx ts-node index.ts
```
You should see: `NOTAM Interpreter running on port 3101`

**Agent 2 — Forensic Narrator (open another new terminal):**
```bash
cd ~/Jads-2/do-not-share/agents/forensic-narrator
npm install
npx ts-node index.ts
```
You should see: `Forensic Narrator running on port 3102`

**Agent 3 — AFTN Draft (open another new terminal):**
```bash
cd ~/Jads-2/do-not-share/agents/aftn-draft
npm install
npx ts-node index.ts
```
You should see: `AFTN Draft running on port 3103`

**Agent 4 — Anomaly Advisor (open another new terminal):**
```bash
cd ~/Jads-2/do-not-share/agents/anomaly-advisor
npm install
npx ts-node index.ts
```
You should see: `Anomaly Advisor running on port 3104`

**⚠️ Leave all 4 terminals open.**

All env vars are already defined in `env.ts` -- set `USE_LIVE_ADAPTERS=true` and fill in:
### Option B: Start all 4 at once (if you're comfortable with terminals)

```bash
cd ~/Jads-2/do-not-share/agents
for agent in notam-interpreter forensic-narrator aftn-draft anomaly-advisor; do
  (cd $agent && npm install && npx ts-node index.ts &)
done
```

### Verify agents are running

## Scope Invariants -- Post-Flight Only (S2/S3 Enforcement)
Open a new terminal and type each of these:
```bash
curl http://localhost:3101/health
curl http://localhost:3102/health
curl http://localhost:3103/health
curl http://localhost:3104/health
```

Each should return `{"status":"ok"}` or similar. If any fails, that agent isn't running — go back and check its terminal for error messages.

---

## PHASE 7: Build & Deploy the Android App

- **S2**: Platform must NOT be a real-time monitoring system
- **S3**: Drone data flows ONE direction ONLY: device to backend AFTER landing
- **S7**: No live telemetry streaming, no WebSocket, no SSE for drone data
This is the most complex phase. Take it step by step.

### Step 7.1 — Generate the Gradle wrapper

| Test ID | What It Verifies |
|---------|-----------------|
| SCOPE-01 | WebSocket upgrade to `/ws` returns 404/400 (not 101) |
| SCOPE-02 | `/ws/live-track` returns 404 |
| SCOPE-03 | `/ws/drone-position` returns 404 |
| SCOPE-04 | `/api/drone/stream/position` (SSE) returns 404 |
| SCOPE-05 | `/api/drone/missions/active/stream` (SSE) returns 404 |
| SCOPE-11 | Express router stack inspected -- no WebSocket/SSE handlers registered anywhere |
The Android app needs a file called `gradlew` to build. Let's create it.

```bash
cd ~/Jads-2/do-not-share/jads-android
```

### Frozen Files -- DO NOT MODIFY
**If you have Gradle installed** (most people don't — skip to "If not"):
```bash
gradle wrapper --gradle-version 8.6
```

**If you DON'T have Gradle installed (most common):**

| File | Runtime | Why Frozen |
|------|---------|-----------|
| `HashChainEngine.kt` | Kotlin | HASH_0/HASH_n computation must match TypeScript byte-for-byte |
| `CanonicalSerializer.kt` | Kotlin | 96-byte frozen layout is the forensic record format |
| `EndianWriter.kt` | Kotlin | Explicit bit-shift big-endian encoding -- no ByteBuffer, no library calls |
| `canonicalSerializer.ts` | TypeScript | Must produce identical bytes to Kotlin serializer |

**Runtime assertion** in `HashChainEngine.kt:29-33`: prefix length check runs at startup -- crashes immediately if invariant violated.
Don't worry — Android Studio will handle this. Skip to Step 7.3 and open the project in Android Studio. When it asks about Gradle wrapper, click "OK" or "Use Gradle wrapper" — it will auto-generate the files.

Alternatively, install Gradle first:

- **macOS:** Open Terminal and type: `brew install gradle` then run `gradle wrapper --gradle-version 8.6`
- **Ubuntu/Linux:** `sudo apt install gradle` then run `gradle wrapper --gradle-version 8.6`
- **Windows:** Go to https://gradle.org/install/ and follow the manual install instructions. Then run `gradle wrapper --gradle-version 8.6`

### Step 7.2 — Change the backend URL for local development

## Project Directory Structure

```
Jads-2/do-not-share/
|-- jads-backend/                  Backend API server
|   |-- src/
|   |   |-- server.ts              Express app entry point
|   |   |-- env.ts                 Environment variable validation
|   |   |-- routes/                All API route handlers
|   |   |-- services/              Business logic (FlightPlan, Clearance, Audit, etc.)
|   |   |-- adapters/stubs/        Stub adapters for gov systems
|   |   |-- middleware/            Auth, rate limiting, version check
|   |   |-- jobs/                  Background schedulers (METAR poll, etc.)
|   |   +-- __tests__/             Jest test suites
|   |-- prisma/
|   |   |-- schema.prisma          Database schema (authoritative)
|   |   |-- seed.ts                Demo data seeder
|   |   +-- migrations/            SQL migration files
|   |-- .env.example               Environment template
|   +-- package.json
|
|-- jads-admin-portal/             Admin web interface
|   |-- src/pages/
|   |   |-- FlightPlansPage.tsx    Flight plans + OFPL comparison + ADC/FIC issuance
|   |   |-- DashboardPage.tsx      System overview
|   |   |-- DroneZonesPage.tsx     Airspace zone management
|   |   +-- ...
|   +-- vite.config.ts             Dev server config (proxy to backend:8080)
|
|-- jads-audit-portal/             Forensic audit web interface
|   |-- src/pages/
|   |   |-- MissionDetailPage.tsx  Full forensic breakdown
|   |   |-- MissionsPage.tsx       Mission list
|   |   +-- ViolationsPage.tsx     Violation browser
|   +-- vite.config.ts             Dev server config (proxy to backend:8080)
|
|-- jads-android/                  Android app (Kotlin)
|   |-- app/src/main/kotlin/com/jads/
|   |   |-- crypto/                ECDSA + SHA-256 hash chain
|   |   |-- drone/                 Geofence, NPNT, mission controller
|   |   |-- network/               API client (OkHttp)
|   |   |-- storage/               SQLCipher encrypted DB
|   |   |-- telemetry/             96-byte canonical serializer
|   |   |-- time/                  NTP quorum authority
|   |   |-- ui/                    Jetpack Compose screens
|   |   |-- dji/                   DJI flight log ingestion
|   |   +-- service/               Foreground GPS service
|   +-- README-SETUP.md            Android-specific setup
|
|-- agents/                        AI microservices (optional)
|-- e2e/                           End-to-end test suites
|-- ci/                            CI/CD pipeline config
|-- docker-compose.yml             PostgreSQL container definition
|-- CLAUDE.md                      AI assistant conventions
|-- KOTLIN_DEV_BRIEF.md            Android dev guide
|-- IDEX_BATTLE_PLAN.md            Strategic roadmap
+-- OPERATIONAL_RISK_REGISTER.md   Risk assessment
```
**THIS STEP IS CRITICAL.** The Android app needs to know where your laptop's backend server is. By default, it's set to a production URL that doesn't exist on your laptop.

You need to edit **two files**. Here's exactly how:

---

#### File 1: `MissionForegroundService.kt`

**Full path:** `~/Jads-2/do-not-share/jads-android/app/src/main/kotlin/com/jads/service/MissionForegroundService.kt`

**How to open it:**

**Option A — Using a text editor from terminal:**
- **macOS:** `open -e ~/Jads-2/do-not-share/jads-android/app/src/main/kotlin/com/jads/service/MissionForegroundService.kt`
- **Windows:** `notepad %USERPROFILE%\Jads-2\do-not-share\jads-android\app\src\main\kotlin\com\jads\service\MissionForegroundService.kt`
- **Linux:** `nano ~/Jads-2/do-not-share/jads-android/app/src/main/kotlin/com/jads/service/MissionForegroundService.kt`

**Option B — Using Android Studio** (easier — do this after Step 7.3):
1. In Android Studio, look at the left side panel (it shows the project files)
2. Click the little triangles to expand: **app** → **src** → **main** → **kotlin** → **com** → **jads** → **service**
3. **Double-click** on **MissionForegroundService.kt**

**What to find:** Look for this line (around line 107):
```kotlin
backendUrl = "https://jads.internal/api"
```

**What to change it to:**

- **If you will use the Android Emulator** (fake phone on your laptop):
```kotlin
backendUrl = "http://10.0.2.2:8080/api"
```
(10.0.2.2 is a special address that the Android emulator uses to talk to your laptop)

- **If you will use a real physical phone** connected to the same WiFi:
```kotlin
backendUrl = "http://192.168.1.XXX:8080/api"
```
Replace `192.168.1.XXX` with **your laptop's actual IP address**. To find it:
  - **Windows:** Open Command Prompt, type `ipconfig`, look for "IPv4 Address" under your WiFi adapter — it will be something like `192.168.1.105`
  - **macOS:** Open Terminal, type `ifconfig | grep "inet "`, look for the `192.168.x.x` number
  - **Linux:** Type `ip addr show | grep "inet "`, look for `192.168.x.x`

**Save the file** after making the change.

---

#### File 2: `AppPreferences.kt`

**Full path:** `~/Jads-2/do-not-share/jads-android/app/src/main/kotlin/com/jads/storage/AppPreferences.kt`

Open it the same way as above (text editor or Android Studio — in the left panel: app → src → main → kotlin → com → jads → storage → **AppPreferences.kt**).

**What to find:** Look for this line (around line 75):
```kotlin
private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:3000"
```

**What to change it to:**

- **Emulator:**
```kotlin
private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:8080"
```

- **Physical phone:**
```kotlin
private const val DEFAULT_BACKEND_URL = "http://192.168.1.XXX:8080"
```
(Same IP as above)

**Save the file.**

---

### Step 7.3 — Open the project in Android Studio

1. Open **Android Studio** (from Start menu on Windows, or Applications on macOS)
2. If you see a "Welcome" screen:
   - Click **"Open"** (NOT "New Project")
3. If Android Studio is already open with another project:
   - Click **File** (top menu bar) → **Open**
4. A file browser window appears. Navigate to:
   - Your home folder → `Jads-2` → `do-not-share` → `jads-android`
   - Select the **jads-android** folder (click on it once to highlight it)
   - Click **"OK"** or **"Open"**
5. If it asks "Trust this project?" → click **"Trust Project"**
6. Android Studio will start **syncing** the project. Look at the bottom of the Android Studio window — you'll see a progress bar that says "Gradle sync" or "Indexing"
7. **Wait for it to finish.** This can take 2–10 minutes the first time because it downloads ~150 MB of build tools
8. When it's done, the progress bar disappears and you should see a **green checkmark** or no errors in the bottom panel

**If sync fails — common fixes:**

| Error message | What to do |
|--------------|-----------|
| "Gradle JVM not found" or "Invalid JDK" | Click **File** (top menu) → **Project Structure** → on the left click **"SDK Location"** → next to "Gradle JDK", click the dropdown and select **"17"** or **"jbr-17"** → click **"OK"** |
| "Could not resolve com.android.tools.build:gradle" | Your internet connection might be slow. Wait and try again: **File** → **Sync Project with Gradle Files** (the icon looks like an elephant with a blue arrow) |
| "Kotlin daemon failed" or "Out of memory" | Close other programs to free up RAM. The project already sets 4 GB heap in `gradle.properties` |

### Step 7.4 — Build the APK

**Option A — From Android Studio menu (beginner-friendly):**
1. Look at the top menu bar of Android Studio
2. Click **Build**
3. In the dropdown, click **Build Bundle(s) / APK(s)**
4. In the submenu, click **Build APK(s)**
5. Wait for the build to finish (1–3 minutes). You'll see a progress bar at the bottom
6. When done, a green notification will appear at the bottom: **"Build APK(s): APK(s) generated successfully"**
7. Click **"locate"** in that notification to find the APK file

**Option B — From terminal:**
```bash
cd ~/Jads-2/do-not-share/jads-android
./gradlew assembleDebug
```
The APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

### Step 7.5 — Run the app

#### Option A: Android Emulator (no physical phone needed)

1. In Android Studio, look for **"Device Manager"** — it's either:
   - On the right side panel (click the phone icon)
   - OR go to **Tools** (top menu) → **Device Manager**
2. Click **"Create Device"** (the **+** button)
3. Choose a phone model (e.g., **"Pixel 7"**) → click **"Next"**
4. Choose a system image:
   - Click the **"Download"** link next to **"API 34"** (if you haven't downloaded it before)
   - Wait for the download to finish
   - Select API 34 → click **"Next"**
5. Give it a name (or keep the default) → click **"Finish"**
6. Back in Device Manager, click the **play button** ▶️ next to your new virtual device. The emulator will start — you'll see a phone screen appear on your laptop
7. Wait for the emulator to fully boot (you'll see the Android home screen)
8. Now click the **green Run button** ▶️ in the **top toolbar** of Android Studio (it's a green triangle, near the center-top of the window)
9. Make sure your emulator is selected in the device dropdown (next to the Run button)
10. Click **Run** — the app will install and open on the emulator

#### Option B: Physical Android Phone

1. **On your phone:**
   - Open **Settings**
   - Scroll down and tap **"About Phone"** (might be at the very bottom)
   - Find **"Build Number"** (might be under "Software Information" first)
   - **Tap "Build Number" exactly 7 times**. You'll see a countdown ("You are now 3 steps away from being a developer...")
   - After 7 taps, you'll see: **"You are now a developer!"**
2. Go back to **Settings**
3. Scroll down — you should now see **"Developer Options"** (it appeared because of Step 1)
4. Tap **"Developer Options"**
5. Find **"USB Debugging"** and **toggle it ON**
6. A warning dialog will appear — tap **"OK"** to allow
7. **Connect your phone to your laptop** using a USB cable
8. Your phone will show a popup: **"Allow USB debugging?"**
   - Check the box **"Always allow from this computer"**
   - Tap **"Allow"**
9. In Android Studio, look at the **device dropdown** in the top toolbar — your phone's name should appear (e.g., "Samsung SM-G991B")
10. Select your phone → click the **green Run button** ▶️
11. The app will install and open on your phone

### Step 7.6 — Network setup for physical phone

The phone and your laptop **MUST be on the same network** for the app to talk to the backend.

**Option A — Same WiFi (easiest):**
- Connect both your laptop and phone to the same WiFi network (your home WiFi, office WiFi, etc.)
- Use the laptop's WiFi IP address in the Kotlin files (see Step 7.2)

**Option B — Phone Hotspot:**
1. On your phone: **Settings** → **Connections** (or **Network**) → **Mobile Hotspot** → turn it **ON**
2. On your laptop: Connect to the phone's WiFi hotspot (it will appear in your WiFi list)
3. Find your laptop's new IP: it's usually `192.168.43.x` — check with `ipconfig` / `ifconfig`
4. Use this IP in the Kotlin files

**Option C — USB Tethering:**
1. Connect phone to laptop via USB
2. On your phone: **Settings** → **Connections** → **Mobile Hotspot and Tethering** → enable **USB Tethering**
3. Your laptop gets an IP from the phone's tethering interface

---

## PHASE 8: Test the Complete System

Now everything should be running. Let's test each piece.

### Test 1: Health Check

Open a new terminal and type:
```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok","version":"4.0",...}`

If this doesn't work, the backend isn't running. Go back to Phase 4 and check the terminal where you ran `npm run dev`.

### Test 2: Admin Portal — Browse Flight Plans

1. Open your browser
2. Go to **http://localhost:5173**
3. Log in with username: `dgca.admin` / password: `Admin@JADS2024`
4. Click **"Flight Plans"** in the navigation
5. You should see **2 seeded flight plans** in a table
6. **Click on any flight plan row** — you'll see:
   - The full flight plan details (departure, destination, route, altitude)
   - The generated **AFTN FPL message** (starts with `(FPL-`)
   - ADC/FIC clearance status
7. Try the **"Issue ADC/FIC"** button — this simulates the military (AFMLU) or air traffic (FIR) issuing a clearance number

### Test 3: Admin Portal — Airspace Two-Person Rule

1. Still in Admin Portal, click **"Airspace"** or **"Drone Zones"**
2. Try creating a new drone zone draft
3. Notice: the same admin who created it **cannot approve it**. This is the two-person rule. You would need a second admin account to approve

### Test 4: Audit Portal — Forensic Verification

1. Open a **new browser tab**
2. Go to **http://localhost:5174**
3. Log in with username: `dgca.admin` / password: `Admin@JADS2024`
4. Click **"Missions"** — you'll see **3 seeded drone missions**
5. **Click on any mission** to see the full forensic breakdown:
   - **Hash Chain Integrity** — every telemetry record is cryptographically linked
   - **ECDSA Signature** — each record was signed on the drone device
   - **NTP Time Sync** — was the drone's clock accurate?
   - **Geofence Compliance** — did the drone stay inside allowed zones?
   - **NPNT Zone** — GREEN/YELLOW/RED classification
   - **PQC Status** — post-quantum signature (ML-DSA-65) if present
   - **Device Trust Score** — 0–100 hardware integrity rating

### Test 5: Android App — Drone Mission (if you set up the phone/emulator)

1. Open the JADS app on your phone/emulator
2. Log in:
   - For civilian: enter phone number `9999000001`, any OTP code works in dev mode
   - For military/government: use `iaf.28sqn` / `28SQN@Secure2024`
3. Grant location permissions when the app asks
4. Set up a mission (enter mission parameters)
5. Start the mission — the app starts recording GPS telemetry every second
6. Let it run for 30–60 seconds (walk around if using a real phone for varied GPS data)
7. Stop the mission — it finalizes the hash chain and uploads to the backend
8. Go to the **Audit Portal** (http://localhost:5174) → **Missions** — your new mission should appear with a full forensic report

---

## Terminal Windows Summary

At this point, you should have these terminal windows open:

| Terminal # | What's running | How to tell it's working |
|-----------|---------------|-------------------------|
| 1 | Database (Docker) | Runs in background — `docker ps` shows it as "Up" |
| 2 | Backend Server | Shows `[server_started] { port: 8080 }` and log messages |
| 3 | Admin Portal (Vite) | Shows `Local: http://localhost:5173/` |
| 4 | Audit Portal (Vite) | Shows `Local: http://localhost:5174/` |
| 5 | NOTAM Interpreter (optional) | Shows `running on port 3101` |
| 6 | Forensic Narrator (optional) | Shows `running on port 3102` |
| 7 | AFTN Draft (optional) | Shows `running on port 3103` |
| 8 | Anomaly Advisor (optional) | Shows `running on port 3104` |
| + | Android Studio | Open with the jads-android project |

**Plus 2 browser tabs:**
- http://localhost:5173 — Admin Portal
- http://localhost:5174 — Audit Portal

---

## Quick Reference — All URLs

| What | URL | Who uses it |
|------|-----|-------------|
| Backend Health Check | http://localhost:8080/health | You (to verify backend is running) |
| Admin Portal | http://localhost:5173 | Government admins |
| Audit Portal | http://localhost:5174 | Forensic auditors |
| Backend API (from phone) | http://YOUR_LAPTOP_IP:8080 | Android app on phone |

---

## Quick Reference — All Credentials

| Portal | Username | Password |
|--------|----------|----------|
| Admin Portal | `dgca.admin` | `Admin@JADS2024` |
| Audit Portal | `dgca.admin` | `Admin@JADS2024` |
| Android App (Special) | `iaf.28sqn` | `28SQN@Secure2024` |
| Android App (Civilian) | phone `9999000001` | Any OTP code (dev mode) |

---

## How to Stop Everything

When you're done testing, here's how to shut everything down:

1. **Terminal windows** (backend, portals, agents): Press **Ctrl+C** in each terminal window. This stops the program running in that terminal
2. **Database**: In any terminal, type:
```bash
cd ~/Jads-2/do-not-share
docker-compose down
```
3. **Android Studio**: Just close the window (File → Exit)
4. **Docker Desktop**: You can quit it from the system tray (right-click the whale icon → Quit)

---

## How to Start Everything Again (Next Day)

You don't need to reinstall anything. Just:

1. Open Docker Desktop (wait for it to start)
2. Open a terminal: `cd ~/Jads-2/do-not-share && docker-compose up -d`
3. Open a terminal: `cd ~/Jads-2/do-not-share/jads-backend && npm run dev`
4. Open a terminal: `cd ~/Jads-2/do-not-share/jads-admin-portal && npm run dev`
5. Open a terminal: `cd ~/Jads-2/do-not-share/jads-audit-portal && npm run dev`
6. Open browser tabs: http://localhost:5173 and http://localhost:5174

---

## Troubleshooting — When Things Go Wrong

| Problem | What you see | How to fix it |
|---------|-------------|---------------|
| **"FATAL: Missing required environment variable"** | Red error text when starting the backend | The `.env` file is missing or incomplete. Go back to Step 4.4 and create it |
| **"docker: command not found"** | Error when running `docker-compose up -d` | Docker Desktop is not installed. Go back to Step 1.2 |
| **"ECONNREFUSED localhost:5432"** | Backend can't connect to database | Docker isn't running. Open Docker Desktop first, then run `docker-compose up -d` |
| **"npx prisma migrate deploy" fails** | Error during database setup | The database isn't ready yet. Wait 10 seconds after `docker-compose up -d`, then try again |
| **Admin portal shows a blank white page** | Nothing loads at http://localhost:5173 | The backend isn't running. Go back to Phase 4 and start it |
| **Android app says "Network Error"** | Error popup in the app | Wrong IP/port in MissionForegroundService.kt or AppPreferences.kt. Go back to Step 7.2 |
| **Android app says "Connection refused"** | Error popup in the app | Your phone and laptop are on different WiFi networks. They must be on the same network |
| **Gradle sync fails in Android Studio** | Red error messages at the bottom | JDK 17 not set. Go to File → Project Structure → SDK Location → set JDK to 17 |
| **"Kotlin daemon failed"** | Error during Android build | Not enough RAM. Close other programs (browsers, etc.) |
| **"npm install" gives errors** | Red "ERR!" messages | Node.js might not be installed correctly. Run `node --version` to check. If it fails, reinstall Node.js |
| **Port already in use** | "EADDRINUSE" error | Another program is using that port. Close it, or find it with `lsof -i :8080` (macOS/Linux) or `netstat -ano | findstr 8080` (Windows) |

---

## What's NOT Working Yet (Known Limitations)

These are parts of the system that use **stubs** (fake implementations) in development:

1. **AFTN Gateway** — Flight plans are NOT actually transmitted to real air traffic control. The system generates the correct AFTN messages but doesn't send them anywhere
2. **Digital Sky API** — The drone zone map uses hardcoded data, not live DGCA Digital Sky data
3. **Aadhaar Verification** — Any OTP code works in development mode (no real Aadhaar checking)
4. **METAR/NOTAM** — Weather and NOTAM data is hardcoded demo data, not live feeds
5. **Backend URL in Android** — Must be manually changed for local development (Step 7.2)

These stubs are **by design** — the government replaces them with live connections when deploying for real. All the core logic (forensic verification, hash chains, ECDSA signatures, two-person rule, audit logging) works fully.

---

## What Starts Automatically When the Backend Runs

When you run `npm run dev` in the backend, these things happen automatically without any action from you:

1. **PostgreSQL audit triggers** are installed (makes the audit log tamper-proof)
2. **RuntimeIntegrityService** creates a SHA-256 hash of critical server files (detects tampering)
3. **7 background jobs** start (METAR polling, NOTAM polling, ADC/FIC polling, evidence ledger anchoring, etc.)
4. **Evidence ledger chain** begins (daily cryptographic anchoring at 00:05 UTC)
