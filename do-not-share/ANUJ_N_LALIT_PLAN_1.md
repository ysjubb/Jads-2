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

---

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

DATABASE_URL=postgresql://jads:jads_dev_password@localhost:5432/jads_dev

JWT_SECRET=aabbccddee11223344556677889900aabbccddee11223344556677889900aabb
ADMIN_JWT_SECRET=ff00ee11dd22cc33bb44aa5566778899ff00ee11dd22cc33bb44aa5566778899
ADAPTER_INBOUND_KEY=deadbeef12345678deadbeef12345678

USE_LIVE_ADAPTERS=false
```

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

---

## PHASE 5: Start the Admin Portal

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

---

## PHASE 6: Start the Audit Portal

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

**KEEP THIS TERMINAL RUNNING.**

---

## PHASE 6B: Start the Agent Microservices (Optional but Recommended)

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

---

## PHASE 7: Build & Deploy the Android App

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

---

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

---

## What's NOT Working Yet (Known Limitations)

1. **AFTN Gateway** -- Uses a stub (fake). Does NOT transmit to real AFMLU/FIR networks. ADC/FIC numbers must be issued manually via Admin Portal.
2. **Digital Sky API** -- Uses a hardcoded zone map. No live connection to DGCA Digital Sky.
3. **Aadhaar Verification** -- Stub mode. Accepts any OTP in development.
4. **METAR/NOTAM** -- Stub adapters return hardcoded data. No live feed from IMD/AAI.
5. **Background Upload URL** -- `MissionForegroundService.kt` line 107 has a hardcoded URL that must be changed for local dev (see Phase 7c).

---

## Sovereign Handover Architecture -- Adapter Pattern

The platform is designed for **government handover**: every external dependency (AFTN, Digital Sky, METAR, NOTAM, UIDAI, AFMLU, FIR) is abstracted behind a TypeScript interface with a development stub. Government integrators replace stubs with live implementations -- zero application code changes required.

### Backend Adapter Interfaces (`jads-backend/src/adapters/interfaces/`)

| Interface | Stub | What It Abstracts |
|-----------|------|-------------------|
| `IAftnGateway.ts` | `AftnGatewayStub.ts` | AFTN flight plan filing with ATC (Doc 4444 FPL/DLA/CNL/CHG) |
| `IAfmluAdapter.ts` | `AfmluAdapterStub.ts` | AFMLU data -- ADC (Air Defence Clearance) coordination records, defence airspace GeoJSON polygons |
| `IFirAdapter.ts` | `FirAdapterStub.ts` | FIR circulars (FIC records, supersedes chain) |
| `IMetarAdapter.ts` | `MetarAdapterStub.ts` | Weather observations for 12 major Indian aerodromes |
| `INotamAdapter.ts` | `NotamAdapterStub.ts` | NOTAMs for all 4 Indian FIRs (VIDF, VABB, VECC, VOMF) |

### Injection Pattern -- Constructor Defaults

Every consumer accepts an optional adapter, defaulting to the stub:

```typescript
// FlightPlanService.ts -- swap AftnGatewayStub for live AFTN gateway
constructor(prisma: PrismaClient, aftnGateway: IAftnGateway = new AftnGatewayStub())

// MetarPollJob.ts -- swap for live IMD/AAI METAR feed
constructor(prisma: PrismaClient, adapter?: IMetarAdapter)

// AirspaceDataPollJob.ts -- swap all three simultaneously
constructor(prisma, afmluAdapter = new AfmluAdapterStub(), firAdapter = new FirAdapterStub(), metarAdapter = new MetarAdapterStub())
```

### Inbound Webhooks -- Government Systems Push to JADS

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/adapter/adc/push` | POST | `X-JADS-Adapter-Key` | AFMLU pushes ADC (Air Defence Clearance) number after IAF approves |
| `/api/adapter/fic/push` | POST | `X-JADS-Adapter-Key` | FIR pushes FIC number |
| `/api/adapter/clearance/reject` | POST | `X-JADS-Adapter-Key` | Clearance rejection notification |

Authentication: constant-time comparison (`crypto.timingSafeEqual`) via `adapterAuthMiddleware.ts`. Separate from JWT auth.

### Polling Jobs -- JADS Pulls from Government Systems

| Job | Cron | Adapter | Idempotency |
|-----|------|---------|-------------|
| `NotamPollJob` | `*/5 * * * *` (5 min) | `INotamAdapter` | Upsert by `notamNumber` |
| `MetarPollJob` | `*/30 * * * *` (30 min) | `IMetarAdapter` | Dedup by `(icaoCode, observationUtc)` |
| `AdcFicPollJob` | `0 */6 * * *` (6 hr) | `IFirAdapter` | Upsert by `ficNumber` |
| `AirspaceDataPollJob` | 60 min (ADC), 60 min +15s (FIC), 30 min (METAR) | All three | Combined upsert |

### Android Adapter (`jads-android/`)

| Interface | Stub | Location |
|-----------|------|----------|
| `IDigitalSkyAdapter` | `HardcodedZoneMapAdapter.kt` | `NpntComplianceGate.kt:111-114` |
| `IAirportProximityChecker` | `AirportProximityChecker` (loads from `aerodrome_proximity.json`) | `NpntComplianceGate.kt:278-360` |

Injected via `AppContainer.kt:62-67`. Replace inline stub with HTTP adapter pointing to `https://digitalsky.dgca.gov.in/api/gcs/flightlog/classify` when API becomes available.

### Pre-Plumbed Environment Variables for Live Adapters

All env vars are already defined in `env.ts` -- set `USE_LIVE_ADAPTERS=true` and fill in:

```env
DIGITAL_SKY_BASE_URL=       # eGCA/Digital Sky API endpoint
DIGITAL_SKY_API_KEY=        # Digital Sky credentials
UIDAI_BASE_URL=             # Aadhaar verification endpoint
UIDAI_API_KEY=              # UIDAI credentials
AFMLU_BASE_URL=             # AFMLU data feed
AFMLU_API_KEY=              # AFMLU credentials
FIR_BASE_URL=               # FIR office data feed
AFTN_GATEWAY_HOST=          # AFTN gateway server
AFTN_GATEWAY_PORT=          # AFTN gateway port
METAR_BASE_URL=             # IMD/AAI METAR feed
NOTAM_BASE_URL=             # AAI NOTAM feed
```

---

## Scope Invariants -- Post-Flight Only (S2/S3 Enforcement)

**The platform is NOT a real-time monitoring system. This is enforced in code and tested in CI.**

### Architectural Boundary

- **S2**: Platform must NOT be a real-time monitoring system
- **S3**: Drone data flows ONE direction ONLY: device to backend AFTER landing
- **S7**: No live telemetry streaming, no WebSocket, no SSE for drone data

### Enforcement Tests (`e2e/security/scopeEnforcement.test.ts`)

| Test ID | What It Verifies |
|---------|-----------------|
| SCOPE-01 | WebSocket upgrade to `/ws` returns 404/400 (not 101) |
| SCOPE-02 | `/ws/live-track` returns 404 |
| SCOPE-03 | `/ws/drone-position` returns 404 |
| SCOPE-04 | `/api/drone/stream/position` (SSE) returns 404 |
| SCOPE-05 | `/api/drone/missions/active/stream` (SSE) returns 404 |
| SCOPE-11 | Express router stack inspected -- no WebSocket/SSE handlers registered anywhere |

If any of these fail, **the build must not ship**. These are architectural boundary tests, not functional tests.

### Frozen Files -- DO NOT MODIFY

These files are frozen. Any change breaks cross-runtime hash compatibility:

| File | Runtime | Why Frozen |
|------|---------|-----------|
| `HashChainEngine.kt` | Kotlin | HASH_0/HASH_n computation must match TypeScript byte-for-byte |
| `CanonicalSerializer.kt` | Kotlin | 96-byte frozen layout is the forensic record format |
| `EndianWriter.kt` | Kotlin | Explicit bit-shift big-endian encoding -- no ByteBuffer, no library calls |
| `canonicalSerializer.ts` | TypeScript | Must produce identical bytes to Kotlin serializer |

**Runtime assertion** in `HashChainEngine.kt:29-33`: prefix length check runs at startup -- crashes immediately if invariant violated.

**Cross-runtime verification**: `canonical_test_vectors.json` contains frozen test vectors (TV-001 through TV-008) verified by both runtimes in CI Stage 2.

---

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
