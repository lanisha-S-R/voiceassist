# VoiceAssist

Accessible voice-based form filling website (Flask + SQLite + Web Speech API).

## Run it in VS Code (Windows / Mac / Linux)

1. Install **Python 3.9 or newer** and open this `VoiceAssist` folder in VS Code (File > Open Folder).
2. Open the terminal in VS Code (Terminal > New Terminal) and run:

   **Windows (PowerShell):**
   ```
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   python app.py
   ```
   If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process Bypass` first.

   **Mac / Linux:**
   ```
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python app.py
   ```
3. Open **http://127.0.0.1:5000** in **Google Chrome or Microsoft Edge** (voice recognition needs one of these, plus internet).

The database (`instance/voiceassist.db`) is created automatically the first time you start the app.
To create it without starting the site: `flask --app app init-db`.

## Test it

* **Login:** click Register, create an account (password: 8+ characters with a letter and a number), then log in.
* **Voice:** open a form, press **Start Voice**, allow the microphone when the browser asks, and answer each question.
  Try: "My name is Sharalin", "23AI01", "sharalin at gmail dot com", "nine eight seven six five four three two one zero",
  "AI and DS", "third year". Say "yes" to confirm each answer.
  On the dashboard press **Start Voice Assistant** and say "Open feedback form".
* **Submit:** after the last question you reach the Review page. Press **Confirm Details** (or say "confirm").
  You get a reference number, and the data appears under **My Submissions**.
* **Forgot password:** the reset link is printed in the VS Code terminal (there is no email server).

## Files

* `app.py` routes, login, security, review and submit
* `database.py` SQLite tables
* `forms.py` form questions and server-side validation
* `templates/` all pages, `static/css/style.css`, `static/js/voice.js` (speech engine), `static/js/app.js` (form filling, commands)

Use `http://127.0.0.1:5000` or `http://localhost:5000` (browsers only allow the microphone on these or on HTTPS).
