# Mathlete
# 🧮 Mathlete (Matiks)

A modern, full-stack web application designed for interactive mathematical, logic, arcade, and puzzle gaming. **Mathlete** combines glassmorphic UI aesthetics, gamified rank progression, real-time score calculation, daily challenge automation, and social friend management into a unified learning and gaming portal.

---

## 🚀 Technologies & Frameworks

### **Backend Frameworks & Runtime**
- **Node.js**: Asynchronous JavaScript runtime environment.
- **Express.js (`v5`)**: Core web application framework for REST APIs, routing, and session management.
- **Mongoose (`v9`) / MongoDB**: NoSQL database and Object Data Modeling (ODM) for user profiles, friend connections, game logs, and daily challenges.
- **Passport.js & Express-Session**: Local authentication strategy using PBKDF2 salted hash encryption and secure session cookies.
- **Node-Cron (`v4`)**: Background task scheduler executing automated daily challenge resets at midnight.

### **Frontend & User Interface**
- **EJS (Embedded JavaScript Templates)**: Server-side rendering engine for dynamic UI generation.
- **Vanilla JavaScript (ES6+)**: Custom client-side state management, rule-based AI engines, stopwatch mechanics, and interactive UI controls.
- **Vanilla CSS3**: Custom design system featuring glassmorphism, glowing micro-animations, clean typography (`Outfit`), and curated color palettes.
- **Bootstrap 5**: Modal dialogs, layout grids, and responsive components.
- **HTML5 Audio API**: Native sound effects and ambient background soundtracks.

---

## 🎮 Included Games

1. **💡 Lights Out**: A 5x5 matrix puzzle where toggling a cell flips its state and adjacent neighbors to clear the grid.
2. **🧠 Memory Match**: A card-matching memory game pairing mathematical symbols and equations against a countdown timer.
3. **🧩 Sudoku Challenge**: Interactive 9x9 logic grid featuring live number validation, automated hint mechanics, difficulty multipliers, and time-based score penalties.
4. **🐍 Snake Game**: Classic arcade game built with HTML canvas, featuring smooth directional controls, food spawning, and high score tracking.
5. **🚩 Tic-Tac-Toe**: Player vs Smart Computer AI built on rule-based logic:
   - *Rule 1*: Win Move (Takes 3rd cell to complete 3-in-a-row).
   - *Rule 2*: Block Move (Blocks opponent's 2-in-a-row threat).
   - *Rule 3*: Center Priority (Claims grid center at index 4).
   - *Rule 4*: Fallback (Selects a random available cell).

---

## 🔥 Key Features

### 1. **Time-Based Scoring System**
Games like Sudoku use a time-respective scoring formula where quicker completions yield higher points:
$$\text{Score} = \max(0, \text{BasePoints} - (\text{TimeTakenInSeconds} \times \text{PenaltyRate}) + \text{DifficultyBonus})$$

### 2. **Rank & Badge Progression**
- **Starting Stats**: New users begin at `0 XP`, `0 Rank Rating`, `500 Starting Coins`, and `NOVICE` badge tier.
- **1200-Point Milestone Unlocks**: Points accumulate into the user's overall `rankRating`. Hitting 1200-point thresholds dynamically unlocks higher rank badges:
  - **`NOVICE`**: 0 – 1,199 Rank Points
  - **`AMATEUR`**: 1,200 – 2,399 Rank Points
  - **`PRO`**: 2,400 – 3,599 Rank Points
  - **`MASTER`**: 3,600 – 4,799 Rank Points
  - **`CHAMPION`**: 4,800+ Rank Points

### 3. **Daily Streaks & Interviewer Testing Mode**
- Tracks user login timestamps (`lastLoginAt`). Consecutive 24-hour logins increment the streak and illuminate a bright red (`#f43f5e`) glowing fire icon in the navbar header.
- **Interviewer Demo Toggle**: Includes a configurable time multiplier (`MOCK_HOURS_PASSED` in `controllers/userController.js`) to easily simulate 24-hour time passages during live demonstrations.

### 4. **Friend & Public Profile Network**
- Search for users, send real-time friend requests, and view public profiles (`/profile/user/:username`).
- Calculates dynamic accepted friend counts directly from MongoDB.

### 5. **Robust Route Protection & Security**
- Strict `ensureAuthenticated` and `ensureGuest` middleware prevent unauthorized URL navigation.
- Disables browser back-button caching via `Cache-Control: no-store, no-cache, must-revalidate, private` headers.
- Session destruction and cookie clearing on logout.

---

## 📁 Repository Structure

```text
Mathlete/
├── config/
│   └── db.js                 # MongoDB connection setup
├── controllers/
│   ├── challengeController.js # Daily challenge API logic
│   ├── friendController.js    # Friend relationships & request handling
│   └── userController.js      # User profile, streak calculation, & game score logging
├── models/
│   ├── Challenge.js           # Challenge & GameLog schemas
│   ├── DailyChallenge.js      # Automated daily challenge configuration schema
│   ├── Friend.js              # Friend relationship schema
│   └── Profile.js             # User account, stats, & badge schema
├── public/
│   ├── assets/                # Audio files (mp3) and SVG icons
│   ├── css/                   # Stylesheets (dashboard.css, profile.css, find.css, etc.)
│   └── js/                    # Client-side scripts (lightsOut.js, sudoku.js, ticTacToe.js, etc.)
├── routes/
│   ├── authRoutes.js          # Authentication (Login, Register, Logout)
│   ├── challengeRoutes.js     # Daily challenge API endpoints
│   ├── friendRoutes.js         # Friend management endpoints
│   ├── gameRoutes.js           # Game view rendering routes
│   ├── tic-tac-toe_Routes.js  # Tic-Tac-Toe routing
│   └── userRoutes.js          # Profile API & game log submission routes
├── utils/
│   └── cronJobs.js            # Node-cron daily reset automation
├── views/
│   ├── auth/                  # Login & registration landing view
│   ├── dashboard/             # Left navigation, navbar, and main arena hero views
│   ├── friends/               # Find friends UI
│   ├── games/                 # EJS game templates
│   ├── history.ejs            # Match history log view
│   ├── profile.ejs            # User profile dashboard view
│   └── publicProfile.ejs      # Public user profile view
├── .env                       # Environment variables configuration
├── app.js                     # Main application entry point & Express server configuration
└── package.json               # Project dependencies and npm scripts
