const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat, PageBreak } = require('docx');
const fs = require('fs');

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  navy: '1B3A5C', teal: '0D7377', amber: 'F0A500', red: 'C0392B',
  green: '1A7A4A', lgrey: 'F2F4F6', mgrey: 'D0D5DD', dgrey: '4A5568',
  white: 'FFFFFF', warn: 'FFF3CD', warnBdr: 'F0A500', tip: 'E8F5E9',
  tipBdr: '1A7A4A', codeBg: '1E2A3A', codeText:'A8D8A8', infoBg: 'E8EEF5',
  purple: '5B2D8E', purpleBg:'F3EEF9',
};

const FULL_W = 9360;
const bdr = { style: BorderStyle.SINGLE, size: 1, color: C.mgrey };
const bdrs = { top: bdr, bottom: bdr, left: bdr, right: bdr };
const noBdr = { style: BorderStyle.NONE, size: 0, color: C.white };
const noBdrs = { top: noBdr, bottom: noBdr, left: noBdr, right: noBdr };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pb = () => new Paragraph({ children: [new PageBreak()] });
const sp = (n=80) => new Paragraph({ spacing:{before:n,after:0}, children:[new TextRun('')] });

const div = () => new Paragraph({
  spacing:{before:160,after:160},
  border:{bottom:{style:BorderStyle.SINGLE,size:4,color:C.teal,space:1}},
  children:[new TextRun('')]
});

const h1 = t => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing:{before:360,after:120},
  children:[new TextRun({text:t, bold:true, size:36, font:'Arial', color:C.navy})]
});

const h2 = t => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing:{before:280,after:100},
  children:[new TextRun({text:t, bold:true, size:28, font:'Arial', color:C.teal})]
});

const h3 = t => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing:{before:200,after:80},
  children:[new TextRun({text:t, bold:true, size:24, font:'Arial', color:C.navy})]
});

const p = (text, opts={}) => new Paragraph({
  spacing:{before:80,after:80},
  children:[new TextRun({text, size:22, font:'Arial', color:C.dgrey, ...opts})]
});

const bullet = (text, level=0, bold=false) => new Paragraph({
  numbering:{reference:'bullets', level},
  spacing:{before:40,after:40},
  indent: level===0 ? {left:720,hanging:360} : {left:1080,hanging:360},
  children:[new TextRun({text, size:22, font:'Arial', color:C.dgrey, bold})]
});

const numbered = text => new Paragraph({
  numbering:{reference:'steps', level:0},
  spacing:{before:60,after:60},
  indent:{left:720,hanging:360},
  children:[new TextRun({text, size:22, font:'Arial', color:C.dgrey})]
});

const code = lines => lines.map((line,i) => new Paragraph({
  spacing:{before: i===0?80:20, after: i===lines.length-1?80:20},
  shading:{fill:C.codeBg, type:ShadingType.CLEAR},
  indent:{left:360,right:360},
  children:[new TextRun({text:line||' ', size:18, font:'Courier New', color:C.codeText})]
}));

const phaseHeader = (num, title) => new Paragraph({
  spacing:{before:320,after:160},
  shading:{fill:C.navy, type:ShadingType.CLEAR},
  children:[
    new TextRun({text: `  PHASE ${num}:  `, bold:true, size:32, font:'Arial', color:C.amber}),
    new TextRun({text:title.toUpperCase(), bold:true, size:32, font:'Arial', color:C.white})
  ]
});

const stepHeader = (num, title) => new Paragraph({
  spacing:{before:240,after:100},
  shading:{fill:C.teal, type:ShadingType.CLEAR},
  children:[
    new TextRun({text: `  Step ${num} \u2014 `, bold:true, size:26, font:'Arial', color:C.white}),
    new TextRun({text:title, size:26, font:'Arial', color:C.white})
  ]
});

const box = (icon, title, lines, fillColor, borderColor, textColor) => {
  const rows = [
    new Paragraph({
      spacing:{before:80,after:60},
      children:[new TextRun({text:`${icon}  ${title}`, bold:true, size:22, font:'Arial', color:textColor})]
    }),
    ...lines.map(l => new Paragraph({
      spacing:{before:40,after:40},
      children:[new TextRun({text:l||' ', size:22, font:'Arial', color:textColor})]
    }))
  ];
  return new Table({
    width:{size:FULL_W, type:WidthType.DXA},
    columnWidths:[FULL_W],
    rows:[new TableRow({children:[new TableCell({
      width:{size:FULL_W, type:WidthType.DXA},
      shading:{fill:fillColor, type:ShadingType.CLEAR},
      borders:{
        top:{style:BorderStyle.SINGLE,size:4,color:borderColor},
        bottom:{style:BorderStyle.SINGLE,size:1,color:borderColor},
        left:{style:BorderStyle.THICK,size:12,color:borderColor},
        right:{style:BorderStyle.SINGLE,size:1,color:borderColor},
      },
      margins:{top:120,bottom:120,left:200,right:120},
      children:rows
    })]})]
  });
};

const warnBox = (title, lines) => box('\u26A0\uFE0F', title, lines, C.warn, C.warnBdr, '7A5200');
const tipBox  = (title, lines) => box('\u2705', title, lines, C.tip, C.tipBdr, '0E5A30');
const infoBox = (title, lines) => box('\u2139\uFE0F', title, lines, C.infoBg, C.navy, C.navy);
const checkBox = (title, lines) => box('\uD83D\uDD0D', title, lines, C.purpleBg,C.purple, C.purple);
const planBox = (title, lines) => box('\uD83D\uDDFA\uFE0F', title, lines, 'FFF8E1', C.amber, '5C3D00');

const tbl = (headers, rows, colWidths) => {
  const total = colWidths.reduce((a,b)=>a+b,0);
  const hRow = new TableRow({
    tableHeader:true,
    children: headers.map((h,i)=>new TableCell({
      width:{size:colWidths[i],type:WidthType.DXA},
      shading:{fill:C.navy,type:ShadingType.CLEAR},
      borders:bdrs,
      margins:{top:80,bottom:80,left:120,right:120},
      children:[new Paragraph({children:[new TextRun({text:h,bold:true,size:20,font:'Arial',color:C.white})]})]
    }))
  });
  const dRows = rows.map((row,ri)=>new TableRow({children:row.map((cell,ci)=>new TableCell({
    width:{size:colWidths[ci],type:WidthType.DXA},
    shading:{fill:ri%2===0?C.lgrey:C.white,type:ShadingType.CLEAR},
    borders:bdrs,
    margins:{top:80,bottom:80,left:120,right:120},
    children:[new Paragraph({children:[new TextRun({text:cell,size:20,font:'Arial',color:C.dgrey})]})]
  }))}));
  return new Table({width:{size:total,type:WidthType.DXA}, columnWidths:colWidths, rows:[hRow,...dRows]});
};

// ─── CONTENT ──────────────────────────────────────────────────────────────────
const children = [

  // ══════════════════════════════════════════════════════════════════════════════
  // COVER
  // ══════════════════════════════════════════════════════════════════════════════
  new Paragraph({
    spacing:{before:720,after:200}, alignment:AlignmentType.CENTER,
    children:[new TextRun({text:'JADS PLATFORM', bold:true, size:64, font:'Arial', color:C.navy})]
  }),
  new Paragraph({
    alignment:AlignmentType.CENTER, spacing:{before:0,after:120},
    children:[new TextRun({text:'Complete Laptop Setup Guide', size:40, font:'Arial', color:C.teal})]
  }),
  new Paragraph({
    alignment:AlignmentType.CENTER, spacing:{before:0,after:60},
    children:[new TextRun({text:'Version 4.0.0 \u00B7 March 2026', size:24, font:'Arial', color:C.dgrey})]
  }),
  new Paragraph({
    alignment:AlignmentType.CENTER, spacing:{before:0,after:120},
    children:[new TextRun({text:'For: Anuj & Lalit \u00B7 No coding experience required', size:22, font:'Arial', color:C.dgrey, italics:true})]
  }),
  new Paragraph({
    alignment:AlignmentType.CENTER, spacing:{before:0,after:400},
    children:[new TextRun({text:'Prepared by: JADS Development Team', size:20, font:'Arial', color:C.dgrey})]
  }),

  infoBox('What this guide will give you',[
    'By the end of this guide, 9 programs will be running on your laptop \u2014 the database,',
    'backend server, Admin Portal website, Audit Portal website, 4 helper agents, and the',
    'Android app \u2014 for both manned aircraft flight plan filing and drone forensic audit.',
    '',
    'Estimated time: 1\u20132 hours (most of it is downloading things).',
    'Who this guide is for: You have a laptop, you use a phone, and you know how to install apps.',
  ]),
  sp(240),

  // ══════════════════════════════════════════════════════════════════════════════
  // WHAT YOU ARE BUILDING
  // ══════════════════════════════════════════════════════════════════════════════
  h1('What You Are About to Build'),
  p('You are going to start 9 separate programs on your laptop that together form the JADS platform. Think of it like starting 9 different apps \u2014 each does one job and they all talk to each other.'),
  sp(80),

  tbl(
    ['#','What It Is','What It Does','How You\'ll See It'],
    [
      ['1','Database (PostgreSQL)','Stores all the data (users, missions, flight plans)','Runs silently in background \u2014 no window'],
      ['2','Backend API','The brain \u2014 handles all logic, security, verification','Runs in a terminal window \u2014 shows log messages'],
      ['3','Admin Portal','Website for DGCA admins to manage airspace, issue clearances','Opens in your web browser at localhost:5173'],
      ['4','Audit Portal','Website for auditors to view forensic mission reports','Opens in your web browser at localhost:5174'],
      ['5\u20138','4 Agent Services','Small helper programs (NOTAM, Forensics, AFTN, Anomaly)','Run in terminal windows (optional)'],
      ['9','Android App','The phone app that records drone missions','Runs on your Android phone or emulator'],
    ],
    [400,2200,3360,2600]
  ),
  sp(160),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 0 — TERMINAL BASICS
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(0,'Before You Start \u2014 What Is a Terminal?'),
  p('A terminal (also called "command line" or "command prompt") is a text-based way to give instructions to your computer. Instead of clicking buttons, you type commands and press Enter.'),
  sp(120),

  h2('How to Open a Terminal'),
  h3('On Windows:'),
  numbered('Press the Windows key on your keyboard (the key with the Windows logo, bottom-left)'),
  numbered('Type cmd or powershell'),
  numbered('Click on "Windows PowerShell" or "Command Prompt" that appears'),
  numbered('A black (or blue) window will open with a blinking cursor \u2014 this is your terminal'),
  sp(80),

  h3('On Mac:'),
  numbered('Press Cmd + Space (opens Spotlight search)'),
  numbered('Type Terminal'),
  numbered('Press Enter'),
  numbered('A white window will open with a blinking cursor \u2014 this is your terminal'),
  sp(80),

  h3('On Linux (Ubuntu):'),
  numbered('Press Ctrl + Alt + T'),
  numbered('A terminal window opens'),
  sp(120),

  h2('How to Open Multiple Terminal Tabs/Windows'),
  p('You will need 4\u20138 terminal windows open at the same time (one for each program). Here\'s how:'),
  sp(60),

  h3('On Windows (PowerShell):'),
  bullet('Right-click the PowerShell icon in the taskbar > click "Windows PowerShell" again'),
  bullet('OR inside PowerShell, press Ctrl + Shift + T (if using Windows Terminal app)'),
  sp(60),

  h3('On Mac (Terminal):'),
  bullet('Press Cmd + T to open a new tab inside the same Terminal window'),
  bullet('OR press Cmd + N to open a brand new Terminal window'),
  sp(60),

  h3('On Linux:'),
  bullet('Press Ctrl + Shift + T for a new tab'),
  bullet('OR press Ctrl + Shift + N for a new window'),
  sp(120),

  h2('How Terminal Commands Work'),
  p('When this guide says:'),
  sp(60),
  ...code(['cd ~/Jads-2']),
  sp(60),
  p('It means:'),
  numbered('Click inside your terminal window so it\'s active'),
  numbered('Type exactly cd ~/Jads-2 (no extra spaces)'),
  numbered('Press Enter'),
  numbered('Wait until the blinking cursor comes back (means the command is done)'),
  sp(80),

  warnBox('Important rules',[
    'Copy-paste is your friend. Select the command text, copy (Ctrl+C on Windows/Linux, Cmd+C on Mac),',
    'then paste into the terminal (right-click \u2192 Paste, or Ctrl+Shift+V on Linux, or Cmd+V on Mac).',
    '',
    'If a command shows an error (red text or the word "error"), STOP and read the error message.',
    'If nothing seems to happen for more than 5 minutes, something is wrong.',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 1 — SOFTWARE
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(1,'Install Required Software'),
  p('You need to install 4 programs on your laptop. This is like installing apps on your phone \u2014 you download them, run the installer, and click Next a few times.'),
  sp(120),

  stepHeader('1.1','Install Node.js (the engine that runs the backend)'),
  sp(80),
  h3('On Windows:'),
  numbered('Open your web browser (Chrome, Edge, Safari, Firefox \u2014 any will work)'),
  numbered('Go to: https://nodejs.org'),
  numbered('You will see a big green button that says "XX.XX.X LTS" (the numbers may vary \u2014 that\'s okay)'),
  numbered('Click that green LTS button \u2014 a file will download'),
  numbered('Find the downloaded file (usually in your Downloads folder) \u2014 it\'s called something like node-v20.xx.x-x64.msi'),
  numbered('Double-click it'),
  numbered('Click Next > Next > Next > Install > Finish'),
  numbered('That\'s it. Node.js is installed.'),
  sp(80),

  h3('On Mac:'),
  numbered('Find the downloaded .pkg file in Downloads'),
  numbered('Double-click it'),
  numbered('Click Continue > Continue > Agree > Install (enter your Mac password when asked) > Close'),
  sp(80),

  h3('On Linux (Ubuntu):'),
  numbered('Open a terminal and type these two commands, pressing Enter after each:'),
  ...code([
    'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
    'sudo apt-get install -y nodejs',
  ]),
  p('It will ask for your password \u2014 type it (you won\'t see any characters appear, that\'s normal) and press Enter.'),
  sp(80),

  tipBox('Verify it worked',[
    'Open a NEW terminal window (close the old one and open a fresh one) and type:',
    '  node --version',
    'You should see something like v20.11.1 (the exact numbers don\'t matter,',
    'as long as it starts with v20 or higher).',
    '',
    'If you see "node is not recognized" or "command not found", close the terminal,',
    'reopen it, and try again. If it still doesn\'t work, restart your laptop and try once more.',
  ]),
  sp(160),

  stepHeader('1.2','Install Docker Desktop (runs the database)'),
  p('Docker is a program that runs other programs inside little isolated boxes called "containers". You need it to run the PostgreSQL database.'),
  sp(80),

  h3('On Windows:'),
  numbered('Go to: https://www.docker.com/products/docker-desktop/'),
  numbered('Click the big "Download for Windows" (or Mac, or Linux) button'),
  numbered('Run the downloaded Docker Desktop Installer.exe'),
  numbered('Click OK on all prompts. If it asks about "WSL 2", say Yes'),
  numbered('It may ask you to restart your computer \u2014 do it'),
  numbered('After restart, Docker Desktop will start automatically. You\'ll see a small whale icon in your system tray (bottom-right corner of your screen near the clock)'),
  numbered('IMPORTANT: The first time Docker starts, it takes 1\u20132 minutes to fully load. Wait until the whale icon stops animating'),
  sp(80),

  h3('On Mac:'),
  numbered('Open the downloaded .dmg file'),
  numbered('Drag the Docker icon into the Applications folder'),
  numbered('Open Docker from your Applications (or Spotlight: Cmd+Space, type "Docker", Enter)'),
  numbered('It will ask for your password \u2014 enter it'),
  numbered('Wait for the whale icon to appear in the top menu bar and stop animating'),
  sp(80),

  h3('On Linux (Ubuntu):'),
  numbered('Follow the instructions at: https://docs.docker.com/desktop/install/linux/ubuntu/'),
  numbered('OR install Docker Engine directly:'),
  ...code([
    'sudo apt-get update',
    'sudo apt-get install -y docker.io docker-compose',
    'sudo usermod -aG docker $USER',
  ]),
  p('Log out and log back in (or restart) for the group change to take effect.'),
  sp(80),

  warnBox('CRITICAL: Docker must be RUNNING before you continue',[
    'Windows/Mac: The whale icon in your system tray / menu bar.',
    'If it\'s not there, find Docker Desktop in your Start Menu (Windows) or Applications (Mac) and open it.',
    '',
    'Linux: Type "docker ps" in terminal. If it doesn\'t give an error, Docker is running.',
  ]),
  sp(80),

  tipBox('Verify it worked',[
    'Type: docker --version',
    'You should see something like: Docker version 25.0.3',
    'If you see an error, make sure Docker Desktop is open and running.',
  ]),
  sp(160),

  stepHeader('1.3','Install Git (downloads the code)'),
  p('Git is a program that downloads code from the internet and tracks changes to it.'),
  sp(80),

  h3('On Windows:'),
  numbered('Go to: https://git-scm.com/download/win'),
  numbered('The download starts automatically'),
  numbered('Run the installer'),
  numbered('Click Next on EVERY screen (the default settings are fine)'),
  numbered('Click Install > Finish'),
  sp(80),

  h3('On Mac:'),
  p('Git is already installed on most Macs. Open Terminal and type git --version. If it shows a version number, you\'re done.'),
  p('If it says "xcode-select: note: no developer tools were found", a popup will appear asking to install Command Line Tools. Click Install and wait.'),
  sp(80),

  h3('On Linux:'),
  ...code(['sudo apt-get install -y git']),
  sp(80),

  tipBox('Verify it worked',[
    'Type: git --version',
    'You should see something like: git version 2.43.0',
  ]),
  sp(160),

  stepHeader('1.4','Install Android Studio (builds the phone app)'),
  p('This is only needed if you want to run the Android app. You can skip this for now and come back later.'),
  sp(80),
  numbered('Go to: https://developer.android.com/studio'),
  numbered('Click "Download Android Studio"'),
  numbered('Accept the terms and click Download'),
  numbered('On Windows: Run the .exe installer. Click Next > Next > Next > Install. It will download additional files (~1 GB) \u2014 this takes a while on slow internet'),
  numbered('On Mac: Open the .dmg and drag Android Studio to Applications'),
  numbered('When Android Studio opens for the first time, choose "Standard" setup and click through all the prompts. It will download SDK components (~2 GB) \u2014 let it finish'),
  sp(80),

  tipBox('Verify it worked',[
    'Open Android Studio. If you see a "Welcome to Android Studio" screen, it\'s working.',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — DOWNLOAD CODE
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(2,'Download the JADS Code'),
  p('Now you will download the entire JADS project onto your laptop.'),
  sp(120),

  stepHeader('2.1','Open a terminal'),
  p('Open a terminal (see "How to Open a Terminal" section above).'),
  sp(120),

  stepHeader('2.2','Navigate to your home folder'),
  p('On Windows (PowerShell):'),
  ...code(['cd $HOME']),
  p('On Mac or Linux:'),
  ...code(['cd ~']),
  p('(~ is a shortcut that means "my home folder" \u2014 like My Documents but one level up)'),
  sp(120),

  stepHeader('2.3','Download (clone) the project'),
  ...code(['git clone https://github.com/ysjubb/Jads-2.git']),
  p('What this does: It downloads the entire JADS project from GitHub (a code-sharing website) and creates a folder called Jads-2 on your laptop.'),
  p('What you should see: Lines of text scrolling by, ending with something like "Resolving deltas: 100% ... done."'),
  p('How long this takes: 30 seconds to 5 minutes depending on internet speed.'),
  sp(80),

  warnBox('If you see "fatal: repository not found"',[
    'The repository might be private. Contact the project owner for access. You may need to:',
    '  1. Create a GitHub account at https://github.com',
    '  2. Share your username with the project owner',
    '  3. Accept the repository invitation via email',
    '  4. Try the clone command again',
  ]),
  sp(120),

  stepHeader('2.4','Enter the project folder'),
  ...code(['cd Jads-2']),
  sp(120),

  stepHeader('2.5','Switch to the correct branch'),
  ...code(['git checkout claude/add-claude-documentation-YA3Eb']),
  p('What this does: The project has different versions (called "branches"). This command switches to the version that has all the latest setup files.'),
  p('What you should see: Either "Switched to branch \'claude/add-claude-documentation-YA3Eb\'" or "Already on \'claude/add-claude-documentation-YA3Eb\'"'),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 3 — DATABASE
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(3,'Start the Database'),
  p('The database is where all information is stored \u2014 users, missions, flight plans, everything. We use a program called PostgreSQL, running inside Docker.'),
  sp(120),

  stepHeader('3.1','Make sure Docker is running'),
  p('Before this step, check that Docker Desktop is open and running (see Phase 1.2 above). The whale icon should be visible in your system tray.'),
  sp(120),

  stepHeader('3.2','Navigate to the project\'s core folder'),
  p('In the same terminal, type:'),
  ...code(['cd do-not-share']),
  p('(If you get "no such file or directory", type cd ~/Jads-2/do-not-share instead \u2014 this is the full path.)'),
  sp(120),

  stepHeader('3.3','Start the database'),
  ...code(['docker-compose up -d']),
  p('What this does: Tells Docker to download the PostgreSQL database program and start it in the background.'),
  p('What you should see:'),
  bullet('First time: It downloads the PostgreSQL image (~80 MB). You\'ll see "Pulling postgres..." and progress bars.'),
  bullet('After download: You\'ll see "Creating jads_postgres ... done"'),
  p('The -d means "detached" \u2014 the database runs in the background so you can keep using this terminal.'),
  sp(80),

  stepHeader('3.4','How to know it worked'),
  ...code(['docker ps']),
  p('This shows all running Docker containers. You should see one line with jads_postgres and healthy (or Up):'),
  ...code([
    'CONTAINER ID   IMAGE                  STATUS                    NAMES',
    'abc123...      postgres:16-alpine     Up 30 seconds (healthy)   jads_postgres',
  ]),
  sp(80),

  warnBox('If you see nothing, or the status says "Exited" or "Restarting"',[
    'Make sure Docker Desktop is open.',
    'Try again: type docker-compose down then docker-compose up -d',
  ]),
  sp(120),

  infoBox('If You Need a Fresh Start Later',[
    'If the database gets messed up and you want to erase everything and start over:',
    '',
    '  docker-compose down -v',
    '  docker-compose up -d',
    '',
    'WARNING: This deletes ALL data in the database.',
    'Only do this if you want a completely clean slate.',
  ]),

  sp(120),
  checkBox('Verification Check \u2014 Phase 3 Complete',[
    'Before moving to Phase 4, confirm:',
    '',
    '  docker ps \u2192 shows jads_postgres with STATUS "Up"',
    '',
    'If the container shows "Restarting" repeatedly, your Docker Desktop may not have',
    'enough memory allocated. Open Docker Desktop \u2192 Settings \u2192 Resources \u2192 increase',
    'Memory to at least 2 GB.',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 4 — BACKEND
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(4,'Setup & Start the Backend Server'),
  p('The backend is the "brain" of the platform. It handles all the logic, security checks, and data processing.'),
  sp(120),

  stepHeader('4.1','Navigate to the backend folder'),
  p('In the same terminal:'),
  ...code(['cd jads-backend']),
  p('(If this doesn\'t work, use the full path: cd ~/Jads-2/do-not-share/jads-backend)'),
  sp(120),

  stepHeader('4.2','Install backend dependencies'),
  ...code(['npm install']),
  p('What this does: Downloads all the small software libraries that the backend needs to run (hundreds of them). Think of it like installing an app\'s required updates.'),
  p('What you should see: Lines scrolling by, eventually ending with "added XXX packages in XX.XXs". This takes 1\u20133 minutes.'),
  p('If you see "npm: command not found": Node.js isn\'t installed properly. Go back to Phase 1.1.'),
  sp(120),

  stepHeader('4.3','Create the configuration file (.env)'),
  p('The backend needs a configuration file that tells it passwords, database locations, etc. We\'ll copy a template and fill it in.'),
  p('Mac / Linux:'),
  ...code(['cp .env.example .env']),
  p('Windows PowerShell:'),
  ...code(['Copy-Item .env.example .env']),
  p('What this does: Copies the template file .env.example and creates a new file called .env (the period at the start is intentional \u2014 it means "hidden file").'),
  sp(80),
  p('Now you need to edit this file. Here\'s how to open it:'),
  p('On Windows: notepad .env'),
  p('On Mac: open -e .env'),
  p('On Linux: nano .env'),
  p('(Linux nano: To save: press Ctrl+O then Enter. To exit: press Ctrl+X.)'),
  sp(120),

  stepHeader('4.4','What to put in the .env file'),
  p('Delete everything in the file and paste this EXACT content:'),
  sp(60),
  ...code([
    'NODE_ENV=development',
    'PORT=8080',
    '',
    'DATABASE_URL=postgresql://jads:jads_dev_password@localhost:5432/jads_dev',
    '',
    'JWT_SECRET=aabbccddee11223344556677889900aabbccddee11223344556677889900aabb',
    'ADMIN_JWT_SECRET=ff00ee11dd22cc33bb44aa5566778899ff00ee11dd22cc33bb44aa5566778899',
    'ADAPTER_INBOUND_KEY=deadbeef12345678deadbeef12345678',
    '',
    'USE_LIVE_ADAPTERS=false',
  ]),
  sp(60),
  p('Save the file (Ctrl+S on Windows/Linux, Cmd+S on Mac) and close the editor.'),

  infoBox('About these values',[
    'These are development-only test passwords. They are NOT real secrets.',
    'They are fine for running on your laptop.',
    'Never use these in a real deployment.',
  ]),
  sp(120),

  stepHeader('4.5','Set up the database tables'),
  p('Now we need to create all the database tables (think of them like spreadsheets where data will be stored) and fill in some demo data.'),
  p('Run these three commands ONE AT A TIME, waiting for each to finish before running the next:'),
  sp(80),

  p('Command 1 \u2014 Generate the database tools:'),
  ...code(['npx prisma generate']),
  p('Wait for it to finish (you\'ll see "Generated Prisma Client"). Takes about 10 seconds.'),
  sp(80),

  p('Command 2 \u2014 Create all the database tables:'),
  ...code(['npx prisma migrate deploy']),
  p('Wait for it to finish (you\'ll see "All migrations have been successfully applied"). Takes about 10\u201330 seconds.'),
  sp(80),

  p('Command 3 \u2014 Fill in demo data (test users, sample missions):'),
  ...code(['npx prisma db seed']),
  p('Wait for it to finish (you\'ll see "Seeding finished"). Takes about 10\u201330 seconds.'),
  sp(80),

  p('What is npx? It\'s a tool that comes with Node.js. It runs programs downloaded by npm install. You don\'t need to install it separately.'),
  p('What is Prisma? It\'s a tool that manages the database \u2014 creates tables, adds data, etc. Think of it as a translator between the code and the database.'),
  sp(120),

  stepHeader('4.6','What the demo data contains'),
  p('The seed command created these test accounts you can use:'),
  sp(60),
  tbl(
    ['Account Type','Username','Password','Where to Use It'],
    [
      ['DGCA Super Admin','dgca.admin','Admin@JADS2024','Admin Portal + Audit Portal websites'],
      ['IAF 28 Squadron','iaf.28sqn','28SQN@Secure2024','Android App (military user)'],
      ['Civilian Pilot','phone: 9999000001','Any OTP works in dev mode','Android App (civilian user)'],
    ],
    [2000,1800,2160,3400]
  ),
  sp(60),
  p('It also created: 3 sample drone missions with GPS data, 2 sample flight plans, airspace zones, NOTAMs, and weather reports.'),
  sp(120),

  stepHeader('4.7','Start the backend server'),
  ...code(['npm run dev']),
  p('What you should see after a few seconds:'),
  ...code(['[server_started] { port: 8080, version: \'4.0\' }']),
  p('You might also see other log messages about jobs starting, triggers being installed, etc. That\'s all normal.'),
  sp(80),

  warnBox('IMPORTANT: DO NOT CLOSE THIS TERMINAL WINDOW',[
    'The backend runs as long as this terminal is open.',
    'If you close it, the backend stops and nothing else will work.',
    'If you need to stop the backend later (e.g., to restart it), press Ctrl+C in this terminal window.',
  ]),
  sp(120),

  stepHeader('4.8','Test that the backend is working'),
  p('Open a NEW terminal window. In this new terminal, type:'),
  ...code(['curl http://localhost:8080/health']),
  p('What you should see:'),
  ...code(['{"status":"ok","version":"4.0",...}']),
  p('If you see this, the backend is running correctly.'),
  p('On Windows if curl doesn\'t work: Open your web browser and go to http://localhost:8080/health. You should see the same JSON text in the browser.'),
  p('If you see "connection refused": The backend isn\'t running. Go back to your other terminal and check for error messages.'),

  sp(120),
  checkBox('Verification Check \u2014 Phase 4 Complete',[
    'Run these checks in order. All must pass before continuing to Phase 5.',
    '',
    '1. Type check (catches any code errors from recent changes):',
    '   cd ~/Jads-2/do-not-share/jads-backend',
    '   npx tsc --noEmit',
    '   Expected: no output, no errors. Any red text = paste it to the team.',
    '',
    '2. Run the 68 automated tests:',
    '   npx jest stage7-logic --no-coverage',
    '   Expected last line: "Tests: 68 passed"',
    '   All 68 must pass. If any fail, note the test name and paste to the team.',
    '',
    '3. Live TSA timestamp check (verifies freetsa.org connectivity):',
    '   npx ts-node -e "...(see full command in Appendix A)"',
    '   Expected: "TSA OK: freetsa.org STUB-XXXXXX"',
    '   If TSA FAILED: no internet, or freetsa.org is down. Note the error.',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 5 — ADMIN PORTAL
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(5,'Start the Admin Portal'),
  p('The Admin Portal is a website that runs on your laptop. Government admins use it to manage airspace, view flight plans, and issue clearances.'),
  sp(120),

  stepHeader('5.1','Open a NEW terminal window'),
  p('You need a fresh terminal. The backend terminal must stay open and running.'),
  p('Open a new terminal window or tab (see instructions in Phase 0 above).'),
  sp(120),

  stepHeader('5.2','Navigate to the admin portal folder'),
  p('Mac / Linux:'),
  ...code(['cd ~/Jads-2/do-not-share/jads-admin-portal']),
  p('Windows PowerShell:'),
  ...code(['cd $HOME\\Jads-2\\do-not-share\\jads-admin-portal']),
  sp(120),

  stepHeader('5.3','Install dependencies and start'),
  ...code(['npm install']),
  p('Wait for it to finish (1\u20132 minutes).'),
  ...code(['npm run dev']),
  p('What you should see:'),
  ...code(['VITE v5.x.x  ready in xxx ms','  Local:   http://localhost:5173/']),
  sp(80),
  warnBox('KEEP THIS TERMINAL RUNNING',['Do not close it.']),
  sp(120),

  stepHeader('5.4','Open the Admin Portal in your browser'),
  p('Open your web browser (Chrome, Edge, Firefox, Safari) and go to:'),
  p('http://localhost:5173'),
  p('(Type it in the address bar at the top of the browser, not in Google search.)'),
  p('You should see a login page.'),
  sp(120),

  stepHeader('5.5','Log in'),
  bullet('Username: dgca.admin'),
  bullet('Password: Admin@JADS2024'),
  p('Click the Login button. You should see a dashboard with system statistics.'),
  sp(120),

  stepHeader('5.6','What you can explore in the Admin Portal'),
  tbl(
    ['Menu Item','What You See','What You Can Do'],
    [
      ['Dashboard','System overview, active stats','Look at the numbers'],
      ['Flight Plans','Filed manned aircraft plans','Click any row to see AFTN message. Click "Compare with OFPL" to paste an external flight plan. Click "Issue ADC/FIC" to simulate clearance issuance'],
      ['OFPL Comparison Tool','Comparison interface','Paste an external OFPL \u2014 JADS highlights differences'],
      ['Users','Civilian operators','View Aadhaar-verified pilot accounts'],
      ['Special Users','Government/military accounts','Manage IAF/DGCA/Army/Navy/DRDO/HAL/BSF/CRPF accounts (27 entities)'],
      ['Drone Zones','RED/YELLOW/GREEN zones','Manage airspace classifications'],
      ['Airspace','Airspace version history','Create changes \u2014 see the two-person approval workflow in action'],
    ],
    [1600,2400,5360]
  ),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 6 — AUDIT PORTAL
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(6,'Start the Audit Portal'),
  p('The Audit Portal is another website for forensic auditors to examine drone mission data with cryptographic proof.'),
  sp(120),

  stepHeader('6.1','Open ANOTHER new terminal window'),
  p('You now have at least 2 terminals running (backend + admin portal). Open a third one.'),
  sp(120),

  stepHeader('6.2','Navigate, install, and start'),
  p('Mac / Linux:'),
  ...code([
    'cd ~/Jads-2/do-not-share/jads-audit-portal',
    'npm install',
    'npm run dev',
  ]),
  p('Windows PowerShell:'),
  ...code(['cd $HOME\\Jads-2\\do-not-share\\jads-audit-portal']),
  p('What you should see:'),
  ...code(['VITE v5.x.x  ready in xxx ms','  Local:   http://localhost:5174/']),
  sp(80),
  warnBox('KEEP THIS TERMINAL RUNNING',['Do not close it.']),
  sp(120),

  stepHeader('6.3','Open in browser'),
  p('Go to: http://localhost:5174'),
  p('Login with the same credentials: dgca.admin / Admin@JADS2024'),
  sp(120),

  stepHeader('6.4','What you can explore'),
  bullet('Missions \u2014 Browse drone missions with 10-point forensic verification'),
  bullet('Mission Detail \u2014 Full cryptographic breakdown (hash chain, ECDSA signatures, NTP sync, geofence compliance)'),
  bullet('Flight Plans \u2014 View manned aircraft flight plans with AFTN message history'),
  bullet('Violations \u2014 Browse geofence, altitude, and proximity violations'),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 6B — AGENTS
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader('6B','Start the Agent Microservices (Optional)'),
  p('These are 4 small helper programs. They add "smart" features like interpreting NOTAMs in plain English or generating forensic narratives. The main system works without them, but they make the demo better.'),
  sp(120),

  h2('Option A: Start each agent in a separate terminal (recommended for beginners)'),
  p('You need 4 more terminal windows. For each agent, open a new terminal and run the commands shown.'),
  sp(80),

  h3('Agent 1 \u2014 NOTAM Interpreter (Terminal 5):'),
  ...code([
    'cd ~/Jads-2/do-not-share/agents/notam-interpreter',
    'npm install',
    'npx ts-node index.ts',
  ]),
  p('You should see: NOTAM Interpreter running on port 3101'),
  sp(80),

  h3('Agent 2 \u2014 Forensic Narrator (Terminal 6):'),
  ...code([
    'cd ~/Jads-2/do-not-share/agents/forensic-narrator',
    'npm install',
    'npx ts-node index.ts',
  ]),
  p('You should see: Forensic Narrator running on port 3102'),
  sp(80),

  h3('Agent 3 \u2014 AFTN Draft (Terminal 7):'),
  ...code([
    'cd ~/Jads-2/do-not-share/agents/aftn-draft',
    'npm install',
    'npx ts-node index.ts',
  ]),
  p('You should see: AFTN Draft running on port 3103'),
  sp(80),

  h3('Agent 4 \u2014 Anomaly Advisor (Terminal 8):'),
  ...code([
    'cd ~/Jads-2/do-not-share/agents/anomaly-advisor',
    'npm install',
    'npx ts-node index.ts',
  ]),
  p('You should see: Anomaly Advisor running on port 3104'),
  sp(80),
  warnBox('Leave all 4 terminals open',['Do not close them.']),
  sp(120),

  h2('Option B: Start all 4 agents with one command (advanced)'),
  p('If you\'re comfortable with the terminal, open ONE new terminal and run:'),
  ...code([
    'cd ~/Jads-2/do-not-share/agents',
    'for agent in notam-interpreter forensic-narrator aftn-draft anomaly-advisor; do',
    '  (cd $agent && npm install && npx ts-node index.ts &)',
    'done',
  ]),
  sp(120),

  stepHeader('Verify','Check all agents are running'),
  ...code([
    'curl http://localhost:3101/health',
    'curl http://localhost:3102/health',
    'curl http://localhost:3103/health',
    'curl http://localhost:3104/health',
  ]),
  p('Each should return a JSON response. If any returns "connection refused", that agent isn\'t running.'),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 7 — ANDROID
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(7,'Build & Deploy the Android App'),
  p('This is the most complex phase. If you just want to test the web portals, you can skip this entirely.'),
  sp(120),

  stepHeader('7a','Open the project in Android Studio'),
  numbered('Open Android Studio (from Start Menu / Applications / etc.)'),
  numbered('If you see the "Welcome" screen, click "Open" \u2014 if you see an existing project, go to File > Open'),
  numbered('A file browser appears. Navigate to:'),
  bullet('Windows: C:\\Users\\YOUR_USERNAME\\Jads-2\\do-not-share\\jads-android', 1),
  bullet('Mac: /Users/YOUR_USERNAME/Jads-2/do-not-share/jads-android', 1),
  bullet('Linux: /home/YOUR_USERNAME/Jads-2/do-not-share/jads-android', 1),
  numbered('Select the jads-android folder and click OK (or Open)'),
  numbered('Android Studio will start "syncing" the project \u2014 downloading all Android libraries needed'),
  sp(60),
  p('First-time sync takes 5\u201315 minutes and downloads ~150 MB. You need internet. You\'ll see a progress bar at the bottom of Android Studio.'),
  p('What "success" looks like: A green checkmark or "BUILD SUCCESSFUL" in the bottom bar. No red error banners at the top.'),
  sp(120),

  stepHeader('7b','Generate the Gradle wrapper (only if sync fails)'),
  p('If Android Studio says something about "Gradle wrapper not found", do this:'),
  numbered('Open a terminal'),
  numbered('Navigate to the android folder:'),
  ...code(['cd ~/Jads-2/do-not-share/jads-android']),
  numbered('On Mac/Linux:'),
  ...code([
    'brew install gradle',
    'gradle wrapper --gradle-version 8.6',
  ]),
  p('(If brew is not found on Mac, install it first: go to https://brew.sh and follow their one-line install command)'),
  numbered('On Linux (Ubuntu):'),
  ...code([
    'sudo apt install gradle',
    'gradle wrapper --gradle-version 8.6',
  ]),
  numbered('On Windows: go to https://gradle.org/install/, download, extract to C:\\Gradle, add C:\\Gradle\\bin to your PATH, then run:'),
  ...code(['gradle wrapper --gradle-version 8.6']),
  numbered('Go back to Android Studio and click "Sync Project with Gradle Files" (the elephant icon with a blue arrow at the top toolbar)'),
  sp(120),

  stepHeader('7c','Fix the backend URL (CRITICAL)'),
  p('By default, the Android app tries to connect to a production server that doesn\'t exist. You need to change it to connect to your laptop instead.'),
  p('You need to edit 2 files. Here\'s how to find and edit them in Android Studio:'),
  sp(80),

  h3('File 1: MissionForegroundService.kt'),
  numbered('In Android Studio, look at the left panel (called "Project" panel). If you don\'t see it, press Alt+1 (Windows/Linux) or Cmd+1 (Mac)'),
  numbered('Navigate: app > src > main > kotlin > com > jads > service'),
  numbered('Double-click on MissionForegroundService.kt to open it'),
  numbered('Press Ctrl+G (Windows/Linux) or Cmd+L (Mac) to "Go to Line" \u2192 type 107 \u2192 press Enter'),
  numbered('You should see a line that says:'),
  ...code(['backendUrl = "https://jads.internal/api"']),
  numbered('Change it to:'),
  p('If using Android Emulator:'),
  ...code(['backendUrl = "http://10.0.2.2:8080/api"']),
  p('If using a real phone on the same WiFi:'),
  ...code(['backendUrl = "http://YOUR_LAPTOP_IP:8080/api"']),
  p('(Replace YOUR_LAPTOP_IP with your actual laptop IP address \u2014 see below for how to find it)'),
  numbered('Save the file: Ctrl+S (Windows/Linux) or Cmd+S (Mac)'),
  sp(80),

  h3('File 2: AppPreferences.kt'),
  numbered('In the left panel, navigate: app > src > main > kotlin > com > jads > storage'),
  numbered('Double-click AppPreferences.kt'),
  numbered('Go to line 75 (Ctrl+G or Cmd+L, type 75)'),
  numbered('You should see:'),
  ...code(['private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:3000"']),
  numbered('Change it to:'),
  bullet('Emulator: "http://10.0.2.2:8080"', 1),
  bullet('Real phone: "http://YOUR_LAPTOP_IP:8080"', 1),
  numbered('Save the file'),
  sp(80),

  infoBox('How to Find Your Laptop\'s IP Address',[
    'Windows: Open Command Prompt \u2192 type ipconfig \u2192 press Enter',
    '  Look for "Wireless LAN adapter Wi-Fi" \u2192 "IPv4 Address"',
    '  Example: 192.168.1.105',
    '',
    'Mac: Open Terminal \u2192 type: ifconfig | grep "inet "',
    '  Look for a line with 192.168.x.x or 10.x.x.x (ignore 127.0.0.1)',
    '',
    'Linux: Open Terminal \u2192 type: ip addr show | grep "inet "',
    '  Look for 192.168.x.x or 10.x.x.x (ignore 127.0.0.1)',
  ]),
  sp(120),

  stepHeader('7d','Build the APK (the app file)'),
  p('From Android Studio:'),
  numbered('Go to menu: Build > Build Bundle(s) / APK(s) > Build APK(s)'),
  numbered('Wait for the build to finish (1\u20135 minutes)'),
  numbered('When done, a small notification appears at the bottom saying "Build APK(s) successful" with a "locate" link \u2014 click it to find the APK file'),
  sp(80),
  p('From terminal (alternative):'),
  ...code([
    'cd ~/Jads-2/do-not-share/jads-android',
    './gradlew assembleDebug',
  ]),
  p('(On Windows: .\\gradlew.bat assembleDebug)'),
  p('The APK file will be at: app/build/outputs/apk/debug/app-debug.apk'),
  sp(120),

  stepHeader('7e','Run the app'),
  h3('Option A: Android Emulator (no phone needed)'),
  numbered('In Android Studio, go to menu: Tools > Device Manager'),
  numbered('Click "Create Virtual Device"'),
  numbered('Select "Pixel 7" (or any phone), click Next'),
  numbered('Select a system image with API 34 \u2014 click Download next to it if needed (downloads ~1 GB)'),
  numbered('Click Next > Finish'),
  numbered('Back in the main Android Studio window, you\'ll see the emulator in the device dropdown (top toolbar, near the green play button)'),
  numbered('Click the green Run button (triangle icon)'),
  numbered('The emulator starts (takes 1\u20132 minutes first time) and the app installs and opens'),
  sp(80),

  h3('Option B: Physical Android Phone'),
  numbered('On your phone: Go to Settings > About Phone'),
  numbered('Tap "Build Number" 7 times rapidly \u2014 you\'ll see "You are now a developer!"'),
  numbered('Go back to Settings > System > Developer Options'),
  numbered('Turn ON "USB Debugging"'),
  numbered('Connect your phone to your laptop with a USB cable'),
  numbered('A popup will appear on your phone: "Allow USB Debugging?" \u2014 tap Allow (check "Always allow" if you want)'),
  numbered('In Android Studio, your phone should now appear in the device dropdown at the top'),
  numbered('Click the green Run button'),
  sp(120),

  stepHeader('7f','Network: Phone and Laptop Must Talk to Each Other'),
  p('For the app on your phone to communicate with the backend on your laptop, they must be on the same network.'),
  sp(60),
  bullet('Option A \u2014 Same WiFi (easiest): Connect both your phone and laptop to the same WiFi network (e.g., your home WiFi). Use the laptop IP from step 7c.'),
  bullet('Option B \u2014 Phone Hotspot: Turn on mobile hotspot on your phone (Settings > Hotspot). Connect your laptop to the phone\'s hotspot WiFi. Find your laptop\'s new IP \u2014 it will be something like 192.168.43.x.'),
  bullet('Option C \u2014 USB Tethering: Connect phone via USB. On your phone: Settings > Tethering > USB Tethering: ON. The laptop gets an IP from the phone.'),

  sp(120),
  checkBox('Verification Check \u2014 Android Layer',[
    'After building the APK and before running the app on a phone, run this test in Android Studio.',
    'Create a new file at:',
    '  app/src/test/java/com/jads/telemetry/CrossRuntimeInvariantTest.kt',
    '',
    'Run: ./gradlew test',
    'All 3 tests must pass.',
    'Paste the two printed hex values (HASH_0 and Canonical hex) to the team.',
    'The team will verify them against the TypeScript backend for cross-runtime consistency.',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 8 — TESTING
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  phaseHeader(8,'Test the Complete System'),

  stepHeader('Test 1','Admin Portal \u2014 Flight Plan Demo'),
  numbered('Open your browser and go to http://localhost:5173'),
  numbered('Login: dgca.admin / Admin@JADS2024'),
  numbered('Click "Flight Plans" in the menu'),
  numbered('You\'ll see 2 pre-loaded flight plans from the demo data'),
  numbered('Click on any flight plan to see its details'),
  numbered('Try clicking "AFTN Message" to see the generated ICAO FPL message'),
  numbered('Try the "Compare with OFPL" button (paste any text starting with (FPL- to test)'),
  sp(120),

  stepHeader('Test 2','Audit Portal \u2014 Forensic Verification'),
  numbered('Open a new browser tab and go to http://localhost:5174'),
  numbered('Login: dgca.admin / Admin@JADS2024'),
  numbered('Click "Missions" in the menu'),
  numbered('You\'ll see 3 sample drone missions'),
  numbered('Click any mission to see the full forensic breakdown:'),
  bullet('Hash chain integrity (every record cryptographically linked to the previous)', 1),
  bullet('ECDSA signature verification', 1),
  bullet('NTP time synchronization status', 1),
  bullet('Geofence compliance check', 1),
  sp(120),

  stepHeader('Test 3','Android App \u2014 Drone Mission (if you set up Phase 7)'),
  numbered('Open the JADS app on your phone/emulator'),
  numbered('Login with: iaf.28sqn / 28SQN@Secure2024'),
  numbered('Grant location permissions when prompted (tap "Allow")'),
  numbered('Set up a mission (enter mission parameters)'),
  numbered('Start the mission \u2014 the phone starts recording GPS data'),
  numbered('Let it run for 30\u201360 seconds'),
  numbered('Stop the mission \u2014 it uploads data to the backend'),
  numbered('Go to the Audit Portal (http://localhost:5174) \u2014 the mission should appear in the missions list'),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // TERMINAL SUMMARY
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  h1('Terminal Windows Summary \u2014 What Should Be Running'),
  p('When everything is set up, you\'ll have these terminal windows open:'),
  sp(80),

  tbl(
    ['Terminal #','What\'s Running','How You Started It','Port'],
    [
      ['1','Database (PostgreSQL)','docker-compose up -d','5432 (runs silently in background)'],
      ['2','Backend API','npm run dev in jads-backend/','8080'],
      ['3','Admin Portal','npm run dev in jads-admin-portal/','5173'],
      ['4','Audit Portal','npm run dev in jads-audit-portal/','5174'],
      ['5','NOTAM Interpreter (optional)','npx ts-node index.ts in agents/notam-interpreter/','3101'],
      ['6','Forensic Narrator (optional)','npx ts-node index.ts in agents/forensic-narrator/','3102'],
      ['7','AFTN Draft (optional)','npx ts-node index.ts in agents/aftn-draft/','3103'],
      ['8','Anomaly Advisor (optional)','npx ts-node index.ts in agents/anomaly-advisor/','3104'],
    ],
    [900,2200,3560,1900]
  ),
  sp(80),

  infoBox('Which terminals must stay open',[
    'Terminals 2, 3, and 4 MUST stay open. If you close them, those services stop.',
    '',
    'Terminal 1 (database) runs in the background \u2014 you can close that terminal window',
    'and the database keeps running.',
    '',
    'To stop the database: open a terminal, cd ~/Jads-2/do-not-share, then docker-compose down.',
  ]),
  sp(160),

  h1('Quick Reference \u2014 All URLs'),
  tbl(
    ['What','URL','Need Backend Running?'],
    [
      ['Backend Health Check','http://localhost:8080/health','Yes'],
      ['Admin Portal','http://localhost:5173','Yes (backend + admin terminal)'],
      ['Audit Portal','http://localhost:5174','Yes (backend + audit terminal)'],
      ['Phone App Backend (from phone)','http://YOUR_LAPTOP_IP:8080','Yes (same WiFi required)'],
    ],
    [2800,2760,3800]
  ),
  sp(120),

  h1('Quick Reference \u2014 All Credentials'),
  tbl(
    ['Where','Username','Password'],
    [
      ['Admin Portal','dgca.admin','Admin@JADS2024'],
      ['Audit Portal','dgca.admin','Admin@JADS2024'],
      ['Android App (Military)','iaf.28sqn','28SQN@Secure2024'],
      ['Android App (Civilian)','phone: 9999000001','Any OTP (dev mode accepts anything)'],
    ],
    [2400,2400,4560]
  ),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // STOP / RESTART
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  h1('How to Stop Everything and Shut Down'),
  numbered('In each terminal running a service, press Ctrl+C to stop it'),
  numbered('To stop the database: open a terminal, then:'),
  ...code([
    'cd ~/Jads-2/do-not-share',
    'docker-compose down',
  ]),
  numbered('Close all terminal windows'),
  numbered('(Optional) Close Docker Desktop'),
  sp(160),

  h1('How to Start Everything Again (Next Day)'),
  p('You do NOT need to run npm install, npx prisma, or db seed again. Those are one-time setup commands. From the second day onwards:'),
  sp(80),
  numbered('Open Docker Desktop (wait for the whale icon)'),
  numbered('Start the database:'),
  ...code([
    'cd ~/Jads-2/do-not-share',
    'docker-compose up -d',
  ]),
  numbered('Start the backend (new terminal):'),
  ...code([
    'cd ~/Jads-2/do-not-share/jads-backend',
    'npm run dev',
  ]),
  numbered('Start admin portal (new terminal):'),
  ...code([
    'cd ~/Jads-2/do-not-share/jads-admin-portal',
    'npm run dev',
  ]),
  numbered('Start audit portal (new terminal):'),
  ...code([
    'cd ~/Jads-2/do-not-share/jads-audit-portal',
    'npm run dev',
  ]),
  numbered('Open browser tabs: http://localhost:5173 and http://localhost:5174'),
  sp(80),

  tipBox('That is all you need every morning',[
    'npm install, prisma generate, prisma migrate, db seed \u2014 these were one-time steps.',
    'From now on: Docker \u2192 backend \u2192 portals. Done.',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // TROUBLESHOOTING
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  h1('Troubleshooting \u2014 If Something Goes Wrong'),
  p('Read the error message carefully. Here are the most common ones:'),
  sp(80),

  tbl(
    ['Error Message','What It Means','How to Fix'],
    [
      ['"node" is not recognized / command not found: node','Node.js isn\'t installed, or terminal can\'t find it','Close the terminal, reopen it, try again. If still broken, reinstall Node.js (Phase 1.1) and restart computer'],
      ['"docker" is not recognized / command not found: docker','Docker isn\'t installed or isn\'t running','Install Docker Desktop (Phase 1.2). Make sure the whale icon is visible'],
      ['"ECONNREFUSED localhost:5432" / connect ECONNREFUSED','The database isn\'t running','Run docker-compose up -d in the do-not-share/ folder. Check Docker Desktop is open'],
      ['"FATAL: Missing required environment variable"','The .env file is missing or incomplete','Go to jads-backend/ folder and check the .env file exists. Follow Phase 4.3\u20134.4'],
      ['"Error: Cannot find module..."','You forgot to run npm install','Run npm install in the folder that\'s giving the error'],
      ['"EADDRINUSE: port already in use"','Something else is using that port, or you started the same thing twice','Close the other terminal running the same program, or restart your computer'],
      ['"npm ERR! code ENOENT" with package.json','You\'re in the wrong folder','Check your folder with pwd (Mac/Linux) or Get-Location (Windows PowerShell)'],
      ['Admin Portal shows blank white page','Backend isn\'t running','Check Terminal 2. If it stopped, restart: cd ~/Jads-2/do-not-share/jads-backend && npm run dev'],
      ['"Network Error" or "Connection refused" in Android app','Wrong IP/port, or different WiFi networks','Check the IP in the two Kotlin files (Phase 7c). Phone and laptop must be on the same WiFi'],
      ['"Gradle JVM not found" in Android Studio','JDK 17 not configured','File > Project Structure > SDK Location > set Gradle JDK to 17'],
      ['"Kotlin daemon failed"','Not enough RAM','Close other programs, especially Chrome with many tabs open'],
    ],
    [3000,2160,4200]
  ),
  sp(160),

  h1('Architecture Overview (for reference)'),
  tbl(
    ['Component','Port','Technology','Purpose'],
    [
      ['PostgreSQL Database','localhost:5432','Docker (postgres:16-alpine)','Primary data store + audit log with immutability triggers'],
      ['Backend API','localhost:8080','Node.js + Express + Prisma','5-stage OFPL pipeline, 10-point forensic engine, 7 background jobs'],
      ['Admin Portal','localhost:5173','React + Vite','Airspace CMS, flight plans, ADC/FIC clearance, OFPL comparison'],
      ['Audit Portal','localhost:5174','React + Vite','Forensic mission viewer, DJI import, role-scoped access'],
      ['NOTAM Interpreter','localhost:3101','Express microservice','Parses raw NOTAMs into structured advisories'],
      ['Forensic Narrator','localhost:3102','Express microservice','Mission data into human-readable forensic narrative'],
      ['AFTN Draft','localhost:3103','Express microservice','Structured input into ICAO AFTN message draft'],
      ['Anomaly Advisor','localhost:3104','Express microservice','Telemetry into anomaly detection report'],
      ['Android App','Physical device / emulator','Kotlin + Jetpack Compose','ECDSA + ML-DSA-65 signing, hash chains, NTP quorum'],
    ],
    [2000,1200,2400,3760]
  ),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // KNOWN LIMITATIONS
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  h1('What\'s NOT Working Yet (Known Limitations)'),
  p('These are parts of the system that use stubs (fake implementations) in development. This is by design. The government replaces them with live connections when deploying for real. All the core logic \u2014 forensic verification, hash chains, ECDSA signatures, two-person rule, audit logging \u2014 works fully.'),
  sp(80),

  tbl(
    ['Feature','Status in Dev','What is Missing for Production'],
    [
      ['AFTN Gateway','Stub','FPL messages are built correctly per ICAO Doc 4444 but NOT transmitted to real air traffic control. Requires BEL partnership for AAI AMHS network access.'],
      ['Digital Sky API','Stub','Drone zone map uses hardcoded data. No live DGCA Digital Sky connection. Requires DSP certification (6\u201312 months from application).'],
      ['Aadhaar Verification','Stub','Any OTP works in dev mode. No real Aadhaar checking.'],
      ['METAR / NOTAM','Stub','Weather and NOTAM data is hardcoded demo data. No live feeds from IMD/AAI.'],
      ['RFC 3161 Timestamps','Dev: freetsa.org','Development uses freetsa.org (free public TSA). Production requires eMudhra or CDAC TSA (CCA India licensed). No institutional blocker \u2014 can be upgraded any time.'],
      ['NPNT Permission Artefact','Stub','PA XML parsing works. DGCA PKI signature verification is a stub returning true. Requires DSP certification before DGCA PKI access is granted.'],
      ['ML-DSA Private Key Storage','Interim','ML-DSA-65 signing works. Private key is AES-256-GCM wrapped using Android Keystore. Full hardware-backed PQC keys require FIPS 204 support in Android Keystore (Phase 2).'],
      ['Background Upload URL','Manual change needed','MissionForegroundService.kt line 107 must be changed for local dev (done in Phase 7c).'],
    ],
    [2000,1400,5960]
  ),
  sp(120),

  infoBox('What IS working fully',[
    'AFTN FPL message generation validated against ICAO Doc 4444',
    'Indian AIP transition altitude database (127 civil aerodromes) wired into Field 15',
    'CNL / ARR / DLA message builders (correct ICAO Doc 4444 formats)',
    '96-byte canonical telemetry payload with CRC32 self-verification',
    'RFC 6979 deterministic ECDSA P-256 signing (identical bytes every time)',
    'SHA-256 hash chain linking every telemetry record',
    'Two-person rule for drone zone changes with admin lineage collusion prevention',
    'No-delete invariant \u2014 all airspace records are WITHDRAWN or SUPERSEDED, never deleted',
    'ADC/FIC clearance tracking with real-time SSE push to pilot app',
    '68 automated tests covering AFTN logic, semicircular rule, FIR sequencing, and hash chain',
  ]),
  sp(120),

  h2('Sovereign Handover Architecture \u2014 Adapter Pattern'),
  p('The platform is designed for government handover: every external dependency (AFTN, Digital Sky, METAR, NOTAM, UIDAI, AFMLU, FIR) is abstracted behind a TypeScript interface with a development stub. Government integrators replace stubs with live implementations \u2014 zero application code changes required.'),
  sp(80),

  tbl(
    ['Interface','Stub','What It Abstracts'],
    [
      ['IAftnGateway.ts','AftnGatewayStub.ts','AFTN flight plan filing with ATC (Doc 4444 FPL/DLA/CNL/CHG)'],
      ['IAfmluAdapter.ts','AfmluAdapterStub.ts','AFMLU data \u2014 ADC coordination records, defence airspace GeoJSON polygons'],
      ['IFirAdapter.ts','FirAdapterStub.ts','FIR circulars (FIC records, supersedes chain)'],
      ['IMetarAdapter.ts','MetarAdapterStub.ts','Weather observations for 12 major Indian aerodromes'],
      ['INotamAdapter.ts','NotamAdapterStub.ts','NOTAMs for all 4 Indian FIRs (VIDF, VABB, VECC, VOMF)'],
      ['IDigitalSkyAdapter.ts','DigitalSkyStub.ts','Digital Sky flight log submission, PA fetch, UAS registration'],
    ],
    [2400,2400,4560]
  ),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // SCOPE INVARIANTS
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  h2('Scope Invariants \u2014 Post-Flight Only (S2/S3 Enforcement)'),
  bullet('S2: Platform must NOT be a real-time monitoring system'),
  bullet('S3: Drone data flows ONE direction ONLY: device to backend AFTER landing'),
  bullet('S7: No live telemetry streaming, no WebSocket, no SSE for drone data'),
  sp(80),

  tbl(
    ['Test ID','What It Verifies'],
    [
      ['SCOPE-01','WebSocket upgrade to /ws returns 404/400 (not 101)'],
      ['SCOPE-02','/ws/live-track returns 404'],
      ['SCOPE-03','/ws/drone-position returns 404'],
      ['SCOPE-04','/api/drone/stream/position (SSE) returns 404'],
      ['SCOPE-05','/api/drone/missions/active/stream (SSE) returns 404'],
      ['SCOPE-11','Express router stack inspected \u2014 no WebSocket/SSE handlers registered anywhere'],
    ],
    [1200,8160]
  ),
  sp(160),

  h2('Frozen Files \u2014 DO NOT MODIFY'),
  tbl(
    ['File','Runtime','Why Frozen'],
    [
      ['HashChainEngine.kt','Kotlin','HASH_0/HASH_n computation must match TypeScript byte-for-byte'],
      ['CanonicalSerializer.kt','Kotlin','96-byte frozen layout is the forensic record format'],
      ['EndianWriter.kt','Kotlin','Explicit bit-shift big-endian encoding \u2014 no ByteBuffer, no library calls'],
      ['canonicalSerializer.ts','TypeScript','Must produce identical bytes to Kotlin serializer'],
    ],
    [2800,1600,4960]
  ),
  sp(60),
  p('Runtime assertion in HashChainEngine.kt lines 29\u201333: prefix length check runs at startup \u2014 crashes immediately if invariant violated.'),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // DIRECTORY STRUCTURE
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  h1('Project Directory Structure'),
  ...code([
    'Jads-2/do-not-share/',
    '|-- jads-backend/                    Backend API server',
    '|   |-- src/',
    '|   |   |-- server.ts               Express app entry point',
    '|   |   |-- env.ts                  Environment variable validation',
    '|   |   |-- routes/                 All API route handlers',
    '|   |   |-- services/               Business logic (FlightPlan, Clearance, Audit, etc.)',
    '|   |   |-- adapters/stubs/         Stub adapters for gov systems',
    '|   |   |-- middleware/             Auth, rate limiting, version check',
    '|   |   |-- jobs/                   Background schedulers (METAR poll, etc.)',
    '|   |   +-- tests/                  Jest test suites (68 stage-7 tests)',
    '|   |-- prisma/',
    '|   |   |-- schema.prisma           Database schema (authoritative)',
    '|   |   |-- seed.ts                 Demo data seeder',
    '|   |   +-- migrations/             SQL migration files',
    '|   |-- .env.example                Environment template',
    '|   +-- package.json',
    '|',
    '|-- jads-admin-portal/              Admin web interface',
    '|   |-- src/pages/',
    '|   |   |-- FlightPlansPage.tsx     Flight plans + OFPL comparison + ADC/FIC issuance',
    '|   |   |-- DashboardPage.tsx       System overview',
    '|   |   |-- DroneZonesPage.tsx      Airspace zone management',
    '|   |   +-- ...',
    '|   +-- vite.config.ts              Dev server config (proxy to backend:8080)',
    '|',
    '|-- jads-audit-portal/              Forensic audit web interface',
    '|   |-- src/pages/',
    '|   |   |-- MissionDetailPage.tsx   Full forensic breakdown',
    '|   |   |-- MissionsPage.tsx        Mission list',
    '|   |   +-- ViolationsPage.tsx      Violation browser',
    '|   +-- vite.config.ts              Dev server config (proxy to backend:8080)',
    '|',
    '|-- jads-android/                   Android app (Kotlin)',
    '|   |-- app/src/main/kotlin/com/jads/',
    '|   |   |-- crypto/                 ECDSA + ML-DSA-65 + Keystore signing',
    '|   |   |-- drone/                  Geofence, NPNT, mission controller',
    '|   |   |-- network/               API client (OkHttp)',
    '|   |   |-- storage/               SQLCipher encrypted DB',
    '|   |   |-- telemetry/             96-byte canonical serializer + hash chain',
    '|   |   |-- time/                  NTP quorum authority',
    '|   |   |-- ui/                    Jetpack Compose screens',
    '|   |   |-- dji/                   DJI flight log ingestion',
    '|   |   +-- service/               Foreground GPS service',
    '|   +-- README-SETUP.md             Android-specific setup',
    '|',
    '|-- agents/                         AI microservices (optional)',
    '|-- e2e/                            End-to-end test suites',
    '|-- ci/                             CI/CD pipeline config',
    '|-- docs/                           Technical documentation',
    '|   |-- KNOWN_LIMITATIONS.md        All stub/gap declarations',
    '|   |-- POST_IDEX_ROADMAP.md        18-month production build plan',
    '|   +-- CLAIMS_VERIFICATION.md      Verified vs unverified capability claims',
    '|-- docker-compose.yml              PostgreSQL container definition',
    '|-- CLAUDE.md                       AI assistant conventions',
    '|-- KOTLIN_DEV_BRIEF.md             Android dev guide',
    '|-- IDEX_BATTLE_PLAN.md             Strategic roadmap',
    '+-- OPERATIONAL_RISK_REGISTER.md    Risk assessment',
  ]),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // APPENDIX A — FULL VERIFICATION CHECKLIST
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  new Paragraph({
    spacing:{before:320,after:160},
    shading:{fill:C.purple,type:ShadingType.CLEAR},
    children:[
      new TextRun({text:'  APPENDIX A:  ', bold:true, size:32, font:'Arial', color:C.amber}),
      new TextRun({text:'FULL VERIFICATION CHECKLIST', bold:true, size:32, font:'Arial', color:C.white})
    ]
  }),
  p('Run these checks in order after completing all phases. Every item must pass before declaring the platform ready for the iDEX demonstration.'),
  sp(80),

  h2('Backend Checks'),
  sp(60),

  h3('A1 \u2014 TypeScript Compile Check'),
  p('Catches every type error across all files without running the server.'),
  ...code([
    'cd ~/Jads-2/do-not-share/jads-backend',
    'npx tsc --noEmit',
  ]),
  p('Expected: no output, no errors. Any red text = paste it to the team immediately.'),
  sp(80),

  h3('A2 \u2014 Database Migration Check'),
  p('Confirms the originalEobt field and ManufacturerPushSource enum fix applied cleanly.'),
  ...code([
    'npx prisma migrate dev',
    'npx prisma generate',
  ]),
  p('Expected: "All migrations have been successfully applied". No errors.'),
  sp(80),

  h3('A3 \u2014 Stage 7 Logic Tests'),
  p('68 tests covering AFTN format, semicircular rule, FIR sequencing, airspace invariants, and hash chain. This is the single most important backend check.'),
  ...code(['npx jest stage7-logic --no-coverage']),
  p('Expected: Tests: 68 passed, 0 failed, 0 skipped.'),
  p('If any fail: paste the failing test name and error message to the team. Do not proceed until all 68 pass.'),
  sp(80),

  h3('A4 \u2014 Live TSA Connectivity'),
  p('Verifies freetsa.org is reachable and returns a real RFC 3161 timestamp token.'),
  ...code([
    'npx ts-node -e "',
    '  const {PrismaClient}=require(\'@prisma/client\')',
    '  const {EvidenceLedgerService}=require(\'./src/services/EvidenceLedgerService\')',
    '  const p=new PrismaClient()',
    '  const s=new EvidenceLedgerService(p)',
    '  s.requestTsaToken()',
    '  .then(r=>console.log(\'TSA OK:\',r.tsaName,r.serialNumber))',
    '  .catch(e=>console.error(\'TSA FAILED:\',e.message))',
    '"',
  ]),
  p('Expected: "TSA OK: freetsa.org STUB-XXXXXX" (or a real serial number if freetsa.org is live)'),
  p('If TSA FAILED: no internet connectivity to freetsa.org, or the service is temporarily down. Note the error.'),
  sp(80),

  h3('A5 \u2014 Transition Altitude Seeding Check'),
  p('Confirms all 127 Indian civil aerodromes have transition altitude data populated in the database.'),
  ...code([
    'npx ts-node -e "',
    '  const {PrismaClient}=require(\'@prisma/client\')',
    '  const p=new PrismaClient()',
    '  p.aerodromeRecord.count({where:{transitionAltitudeFt:null}})',
    '  .then(n=>console.log(\'Null transition altitude count:\',n))',
    '"',
  ]),
  p('Expected: "Null transition altitude count: 0"'),
  p('If count > 0: run npx ts-node prisma/seeds/seedTransitionAltitudes.ts and recheck.'),
  sp(80),

  h2('Android Checks'),
  sp(60),

  h3('A6 \u2014 Cross-Runtime Hash Invariant'),
  p('The most critical Android check. Verifies that Kotlin and TypeScript produce identical SHA-256 values for the same input \u2014 the forensic foundation depends on this.'),
  p('In Android Studio, run the CrossRuntimeInvariantTest (see Phase 7 inline check). Note the printed hex values:'),
  sp(60),
  tbl(
    ['Test','What to paste to team','Why it matters'],
    [
      ['HASH_0 for missionId=1','64-character hex string','TypeScript backend must return identical hex from hashChainService.computeHash0(1n)'],
      ['Canonical hex for test fields','192-character hex string','TypeScript backend must produce same 96 bytes from identical TelemetryFields input'],
    ],
    [2400,3000,4560]
  ),
  sp(80),

  h3('A7 \u2014 RFC 6979 Determinism'),
  p('Verifies that ECDSA signing with the same key and hash always produces identical DER bytes. This is required for forensic reproducibility.'),
  p('The CrossRuntimeInvariantTest ecdsa_sign_is_deterministic test covers this.'),
  p('Expected: both signatures identical. If they differ, HMacDSAKCalculator is not being used \u2014 check EcdsaSigner.kt.'),
  sp(80),

  h3('A8 \u2014 StrongBox Attestation Flag'),
  p('Verifies the isKeyStrongBoxBacked flag reflects actual hardware, not the old always-true heuristic.'),
  p('In Android Studio logcat, after app launch, look for:'),
  ...code([
    'KeyStoreSigningProvider: isStrongBoxBacked=true  (if device has StrongBox)',
    'KeyStoreSigningProvider: isStrongBoxBacked=false (if device is TEE-backed only)',
  ]),
  p('Both values are valid. "false" on a TEE device is correct. "true" on a device with no StrongBox chip is the old bug \u2014 should no longer occur after the fix.'),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // APPENDIX B — POST-iDEX ROADMAP
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  new Paragraph({
    spacing:{before:320,after:160},
    shading:{fill:C.purple,type:ShadingType.CLEAR},
    children:[
      new TextRun({text:'  APPENDIX B:  ', bold:true, size:32, font:'Arial', color:C.amber}),
      new TextRun({text:'POST-iDEX PRODUCTION ROADMAP', bold:true, size:32, font:'Arial', color:C.white})
    ]
  }),
  p('The gap between the iDEX prototype and a production government deployment is substantial. This roadmap captures what needs to be built, in what order, and what institutional approvals are required. For full detail, see docs/POST_IDEX_ROADMAP.md in the repository.'),
  sp(80),

  warnBox('Important distinction',[
    'Everything in this roadmap is FUTURE work. It is NOT required to run the platform',
    'on your laptop today. The setup guide (Phases 1\u20138 above) is complete and working.',
    'This appendix is for understanding what comes next after the iDEX submission.',
  ]),
  sp(120),

  h2('Phase 1 \u2014 Months 1\u20133: Forensic Foundations'),
  sp(60),
  tbl(
    ['Item','Status','Notes'],
    [
      ['RFC 3161 TSA integration (eMudhra or CDAC)','Dev: freetsa.org','No institutional blocker. eMudhra commercial TSA available now. Production upgrade = replace one method in EvidenceLedgerService.ts'],
      ['Merkle tree batch anchoring of EvidenceLedger','Built (stub)','Architecture complete. anchorBatch() is real. Needs to be wired into a nightly scheduled job'],
      ['BSA 2023 Part A certificate generation','Not built','Requires BSA 2023 legal review. Backend schema has fields ready'],
      ['FIPS 140-2 Level 3+ HSM deployment','Not built','Backend signing keys are software-held. HSM required for production forensic evidence admissibility'],
      ['StrongBox attestation nonce from server','Partial','Static challenge string is a known gap. Needs server-issued nonce per device registration (replay protection)'],
      ['Indian AIP 127-aerodrome database wired','Complete','Field 15 indiaAIP integration complete. All 127 civil aerodromes with correct transition altitudes'],
      ['Android Keystore P-256 key generation','Complete','StrongBox preference with TEE fallback. False attestation claim fixed'],
      ['ML-DSA-65 hybrid signing','Complete (software)','AES-256-GCM key wrapping in place. Hardware-backed PQC keys await Android Keystore FIPS 204 support'],
    ],
    [3200,1600,4560]
  ),
  sp(120),

  h2('Phase 2 \u2014 Months 3\u20136: NPNT and Operator Integration'),
  sp(60),
  tbl(
    ['Item','Status','Notes'],
    [
      ['DSP certification application to DGCA','Not started','Must apply immediately. 6\u201312 month timeline. Prerequisite for all live Digital Sky API access'],
      ['DGCA PKI root CA certificate acquisition','Not started','Blocked on DSP certification. DGCA issues PKI access only to certified DSPs'],
      ['XML-DSig verification of Permission Artefacts','Stub','NpntVerificationService.verifyDgcaSignature() returns true. Real check requires DGCA root CA'],
      ['Digital Sky live API integration','Stub','All three DigitalSkyStub methods blocked on DSP certification'],
      ['ideaForge SDK MoU','Not started','Required for Netra and Falcon series telemetry access. MAVLink covers only 15\u201325% of market'],
      ['UAS registration workflow','Stub','Digital Sky link requires live API'],
      ['CNL / ARR / DLA AFTN builders','Complete','All three builders correct per ICAO Doc 4444. ARR format (ADEP+EOBT before ADES) verified'],
      ['Permission Artefact stub service','Complete','NpntVerificationService, PermissionArtefactService, DigitalSkyStub \u2014 all built and wired'],
    ],
    [3200,1600,4560]
  ),
  sp(120),

  h2('Phase 3 \u2014 Months 6\u201318: Certification and Partnerships'),
  sp(60),
  tbl(
    ['Item','Blocked by','Timeline'],
    [
      ['CERT-In VAPT (penetration testing)','None \u2014 can start now','Book a CERT-In empanelled vendor'],
      ['STQC software quality certification','VAPT report','Sequential after VAPT'],
      ['ISO 27001 information security','None \u2014 can start now','Parallel track'],
      ['BEL partnership for AAI AMHS AFTN access','MoU negotiation','BEL engagement must start now. AFTN bridge cannot be built without this'],
      ['UTM-SP registration with AAI','AAI approval','Required before airspace data feeds go live'],
      ['DAP 2026 compliance review','Legal review','Defence Acquisition Procedure 2026 compliance required for military procurement'],
    ],
    [2800,2800,3760]
  ),
  sp(120),

  h2('Institutional Tracks \u2014 Run in Parallel, Not Sequential'),
  p('These four tracks must be started immediately after iDEX submission. They cannot be unblocked by code \u2014 they require human engagement.'),
  sp(60),
  tbl(
    ['Track','First Action','Estimated Timeline','Blocks'],
    [
      ['DSP Certification','File application with DGCA','6\u201312 months','DGCA PKI, Digital Sky live API, NPNT enforcement'],
      ['BEL Partnership','Initiate MoU with BEL','3\u20136 months to MoU','AFTN live transmission to AAI AMHS'],
      ['ideaForge MoU','Contact ideaForge BD team','1\u20133 months','SDK access for Netra, Falcon, Agilus series'],
      ['UTM-SP Registration','Apply to AAI','6\u201312 months','Live airspace feed, controlled airspace operations'],
    ],
    [2000,2400,2000,3360]
  ),
  div(),

  // ══════════════════════════════════════════════════════════════════════════════
  // APPENDIX C — CLAIMS VERIFICATION
  // ══════════════════════════════════════════════════════════════════════════════
  pb(),
  new Paragraph({
    spacing:{before:320,after:160},
    shading:{fill:C.purple,type:ShadingType.CLEAR},
    children:[
      new TextRun({text:'  APPENDIX C:  ', bold:true, size:32, font:'Arial', color:C.amber}),
      new TextRun({text:'WHAT CAN AND CANNOT BE CLAIMED', bold:true, size:32, font:'Arial', color:C.white})
    ]
  }),
  p('Every claim about JADS capabilities must be verifiable against the actual source code. This register prevents overclaims. The rule is: if it is not in the source, it cannot be in the pitch.'),
  sp(80),

  h2('Verified Claims (backed by source code)'),
  sp(60),
  tbl(
    ['Claim','Source File','Verified'],
    [
      ['AFTN FPL messages generated per ICAO Doc 4444','AftnMessageBuilder.ts','Yes'],
      ['CNL / ARR / DLA message builders (correct formats)','AftnCnlBuilder.ts, AftnArrBuilder.ts, AftnDlaBuilder.ts','Yes'],
      ['Indian AIP transition altitudes (127 aerodromes) wired into Field 15','indiaAIP.ts + FlightPlanService.ts','Yes'],
      ['96-byte canonical telemetry payload with CRC32','CanonicalSerializer.kt','Yes'],
      ['RFC 6979 deterministic ECDSA P-256 signatures','EcdsaSigner.kt','Yes'],
      ['SHA-256 hash chain linking telemetry records','HashChainEngine.kt','Yes'],
      ['Two-person rule for drone zone changes','AirspaceVersioningService.ts','Yes'],
      ['Admin lineage collusion prevention','AirspaceVersioningService.ts (approveDroneZoneVersion)','Yes'],
      ['No-delete invariant on all airspace records','AirspaceVersioningService.ts (withdrawDroneZone)','Yes'],
      ['CRC32 self-verification on every telemetry frame','CanonicalSerializer.kt (serialize)','Yes'],
      ['ML-DSA-65 hybrid signing (software-backed)','MlDsaSigner.kt','Yes'],
      ['ADC/FIC clearance tracking with SSE real-time push','ClearanceService.ts','Yes'],
      ['RFC 3161 forensic timestamps via freetsa.org (dev)','EvidenceLedgerService.ts','Yes \u2014 dev only'],
      ['68 automated tests covering AFTN + forensic chain','stage7-logic.test.ts','Yes'],
    ],
    [3600,2800,2960]
  ),
  sp(120),

  h2('Stub Claims (architecture exists, not production-ready)'),
  sp(60),
  tbl(
    ['Claim','Stub File','What is Needed for Production'],
    [
      ['RFC 3161 timestamps externally verifiable','EvidenceLedgerService (freetsa.org)','Replace with eMudhra or CDAC TSA endpoint'],
      ['AFTN messages transmitted to ATC','AftnGatewayStub.ts','BEL partnership + AAI AMHS network access'],
      ['NPNT Permission Artefact enforced','NpntVerificationService.ts','DSP certification + DGCA PKI root CA certificate'],
      ['Digital Sky integration live','DigitalSkyStub.ts','DSP certification (6\u201312 months from application)'],
      ['NOTAM / METAR live feeds','NotamAdapterStub, MetarAdapterStub','Government MoU for AAI / IMD data feeds'],
      ['All drone brands supported','MAVLink only','ideaForge MoU (Netra/Falcon), DJI ban context, Asteria proprietary protocol'],
    ],
    [2800,2400,4160]
  ),
  sp(120),

  h2('Claims That Must Never Be Made'),
  sp(60),
  tbl(
    ['Claim','Reason'],
    [
      ['Forensic timestamps are externally verifiable','TSA uses freetsa.org in dev \u2014 not a CCA India licensed TSA'],
      ['NPNT is enforced in production','PA signature verification is a stub returning true'],
      ['Compatible with all drone brands','MAVLink covers 15\u201325% of market only. DJI is banned from procurement. ideaForge/Asteria use proprietary protocols'],
      ['AFTN messages are transmitted to ATC','AftnGatewayStub returns stubMode:true on every call'],
      ['Hardware-backed ML-DSA keys','Android Keystore does not yet support FIPS 204 (ML-DSA)'],
      ['551 tests pass (not 444)','Actual verified count from source: 551. Never say 444 again'],
      ['CNL / ARR / DLA are built (when they weren\'t)','Historical overclaim \u2014 now corrected. All three are built and verified'],
    ],
    [3600,5760]
  ),
];

// ─── Document ─────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering:{config:[
    {reference:'bullets', levels:[
      {level:0, format:LevelFormat.BULLET, text:'\u2022', alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:720,hanging:360}}}},
      {level:1, format:LevelFormat.BULLET, text:'\u25E6', alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:1080,hanging:360}}}},
    ]},
    {reference:'steps', levels:[
      {level:0, format:LevelFormat.DECIMAL, text:'%1.', alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:720,hanging:360}}}},
    ]}
  ]},
  styles:{
    default:{document:{run:{font:'Arial',size:22,color:'2D3748'}}},
    paragraphStyles:[
      {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{size:36,bold:true,font:'Arial',color:C.navy},
        paragraph:{spacing:{before:360,after:120},outlineLevel:0}},
      {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{size:28,bold:true,font:'Arial',color:C.teal},
        paragraph:{spacing:{before:280,after:100},outlineLevel:1}},
      {id:'Heading3',name:'Heading 3',basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{size:24,bold:true,font:'Arial',color:C.navy},
        paragraph:{spacing:{before:200,after:80},outlineLevel:2}},
    ]
  },
  sections:[{
    properties:{page:{
      size:{width:12240,height:15840},
      margin:{top:1440,right:1440,bottom:1440,left:1440}
    }},
    children
  }]
});

const outputPath = process.argv[2] || 'JADS_Setup_Guide_v4.docx';
Packer.toBuffer(doc).then(buf=>{
  fs.writeFileSync(outputPath, buf);
  console.log('Done: ' + outputPath + ' (' + buf.length + ' bytes)');
});
