"""VoiceAssist - accessible voice-based form filling website (Flask + SQLite)."""
import hashlib
import json
import os
import secrets
import sqlite3
import time
from datetime import timedelta
from functools import wraps

from flask import (Flask, abort, flash, g, redirect, render_template, request,
                   session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

try:  # optional: load values from a .env file
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import database
from forms import (FORMS, public_config, reference, speak_value, validate_email_value,
                   validate_form, validate_password, validate_person_name)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__, instance_path=os.path.join(BASE_DIR, "instance"))
os.makedirs(app.instance_path, exist_ok=True)


def load_secret_key():
    """Use SECRET_KEY from the environment, otherwise create one and keep it in instance/."""
    key = os.environ.get("SECRET_KEY")
    if key:
        return key
    path = os.path.join(app.instance_path, "secret_key")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read().strip()
    key = secrets.token_hex(32)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(key)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


app.config.update(
    SECRET_KEY=load_secret_key(),
    DATABASE=os.path.join(app.instance_path, "voiceassist.db"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=2),
    MAX_CONTENT_LENGTH=64 * 1024,
    TEMPLATES_AUTO_RELOAD=True,
)

database.init_app(app)
with app.app_context():
    database.init_db()


# ------------------------------------------------------------ security setup
def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_hex(32)
    return session["_csrf"]


@app.context_processor
def inject_globals():
    return {"csrf_token": csrf_token, "FORMS": FORMS}


@app.before_request
def load_user_and_check_csrf():
    g.user = None
    user_id = session.get("user_id")
    if user_id is not None:
        g.user = database.get_db().execute(
            "SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
        if g.user is None:
            session.clear()

    if request.method == "POST":
        sent = request.form.get("csrf_token", "")
        expected = session.get("_csrf", "")
        if not sent or not expected or not secrets.compare_digest(sent, expected):
            abort(400, "Your session expired or the form was invalid. Please go back and try again.")


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        "frame-ancestors 'none'; form-action 'self'; base-uri 'self'")
    if g.get("user"):
        response.headers["Cache-Control"] = "no-store"
    return response


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("Please log in to continue.", "error")
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped


# Very small brute-force protection for the login form (kept in memory).
FAILED_LOGINS = {}
MAX_ATTEMPTS = 5
LOCK_SECONDS = 300


def login_locked(key):
    attempts = [t for t in FAILED_LOGINS.get(key, []) if time.time() - t < LOCK_SECONDS]
    FAILED_LOGINS[key] = attempts
    return len(attempts) >= MAX_ATTEMPTS


# -------------------------------------------------------------------- drafts
def save_draft(kind, values):
    db = database.get_db()
    db.execute(
        "INSERT INTO drafts (user_id, kind, data) VALUES (?, ?, ?) "
        "ON CONFLICT(user_id, kind) DO UPDATE SET data = excluded.data, "
        "updated_at = datetime('now', 'localtime')",
        (g.user["id"], kind, json.dumps(values)))
    db.commit()


def get_draft(kind):
    row = database.get_db().execute(
        "SELECT data FROM drafts WHERE user_id = ? AND kind = ?", (g.user["id"], kind)).fetchone()
    return json.loads(row["data"]) if row else None


def clear_draft(kind):
    db = database.get_db()
    db.execute("DELETE FROM drafts WHERE user_id = ? AND kind = ?", (g.user["id"], kind))
    db.commit()


# ---------------------------------------------------------------------- auth
@app.route("/")
def index():
    return redirect(url_for("dashboard" if g.user else "login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if g.user:
        return redirect(url_for("dashboard"))
    errors, email = {}, ""
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if not email:
            errors["email"] = "Please enter your email address."
        elif not validate_email_value(email):
            errors["email"] = "Please enter a valid email address."
        if not password:
            errors["password"] = "Please enter your password."
        if not errors:
            key = (request.remote_addr, email)
            if login_locked(key):
                errors["form"] = "Too many failed attempts. Please wait five minutes and try again."
            else:
                user = database.get_db().execute(
                    "SELECT * FROM users WHERE email = ?", (email,)).fetchone()
                if user and check_password_hash(user["password_hash"], password):
                    FAILED_LOGINS.pop(key, None)
                    session.clear()  # new session id after login
                    session["user_id"] = user["id"]
                    session.permanent = True
                    flash(f"Welcome back, {user['name']}!", "success")
                    return redirect(url_for("dashboard"))
                FAILED_LOGINS.setdefault(key, []).append(time.time())
                errors["form"] = "Invalid email or password. Please try again."
    return render_template("login.html", errors=errors, email=email)


@app.route("/register", methods=["GET", "POST"])
def register():
    if g.user:
        return redirect(url_for("dashboard"))
    errors, values = {}, {"name": "", "email": ""}
    if request.method == "POST":
        name = " ".join(request.form.get("name", "").split())
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        values = {"name": name, "email": email}

        if not name:
            errors["name"] = "Full name is required."
        elif not validate_person_name(name):
            errors["name"] = "Please enter a valid name using letters only."
        if not email:
            errors["email"] = "Email is required."
        elif not validate_email_value(email):
            errors["email"] = "Please enter a valid email address."
        if not password:
            errors["password"] = "Password is required."
        else:
            problem = validate_password(password)
            if problem:
                errors["password"] = problem
        if not confirm:
            errors["confirm_password"] = "Please confirm your password."
        elif password != confirm:
            errors["confirm_password"] = "Passwords do not match."

        if not errors:
            db = database.get_db()
            if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                errors["email"] = "An account with this email already exists. Please log in."
            else:
                try:
                    db.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                               (name, email, generate_password_hash(password)))
                    db.commit()
                except sqlite3.IntegrityError:
                    errors["email"] = "An account with this email already exists. Please log in."
                else:
                    flash("Registration successful! Please log in with your new account.", "success")
                    return redirect(url_for("login"))
    return render_template("register.html", errors=errors, values=values)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("You have been logged out. Goodbye!", "success")
    return redirect(url_for("login"))


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


@app.route("/forgot", methods=["GET", "POST"])
def forgot_password():
    errors, email, sent = {}, "", False
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        if not validate_email_value(email):
            errors["email"] = "Please enter a valid email address."
        else:
            db = database.get_db()
            user = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if user:
                token = secrets.token_urlsafe(32)
                db.execute("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
                           (user["id"], hash_token(token), time.time() + 1800))
                db.commit()
                link = url_for("reset_password", token=token, _external=True)
                # No email server in this mini project: the link is printed in the terminal.
                print("\n" + "=" * 60)
                print(f"PASSWORD RESET LINK for {email} (valid 30 minutes):\n{link}")
                print("=" * 60 + "\n", flush=True)
            sent = True  # same answer whether or not the account exists
    return render_template("forgot.html", errors=errors, email=email, sent=sent)


@app.route("/reset/<token>", methods=["GET", "POST"])
def reset_password(token):
    db = database.get_db()
    row = db.execute("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0",
                     (hash_token(token),)).fetchone()
    if row is None or row["expires_at"] < time.time():
        flash("This reset link is invalid or has expired. Please request a new one.", "error")
        return redirect(url_for("forgot_password"))
    errors = {}
    if request.method == "POST":
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        problem = validate_password(password)
        if problem:
            errors["password"] = problem
        elif password != confirm:
            errors["confirm_password"] = "Passwords do not match."
        if not errors:
            db.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                       (generate_password_hash(password), row["user_id"]))
            db.execute("UPDATE password_resets SET used = 1 WHERE user_id = ?", (row["user_id"],))
            db.commit()
            flash("Your password was changed. Please log in.", "success")
            return redirect(url_for("login"))
    return render_template("reset.html", errors=errors, token=token)


# ----------------------------------------------------------------- dashboard
def submission_rows(kind):
    spec = FORMS[kind]
    # spec["table"] is a constant defined in forms.py, never user input.
    return database.get_db().execute(
        f"SELECT * FROM {spec['table']} WHERE user_id = ? ORDER BY id DESC", (g.user["id"],)).fetchall()


@app.route("/dashboard")
@login_required
def dashboard():
    db = database.get_db()
    uid = g.user["id"]
    counts = {kind: db.execute(f"SELECT COUNT(*) FROM {spec['table']} WHERE user_id = ?",
                               (uid,)).fetchone()[0] for kind, spec in FORMS.items()}
    recent = db.execute(
        "SELECT 'student' AS kind, id, submitted_at FROM student_submissions WHERE user_id = ? "
        "UNION ALL SELECT 'feedback', id, submitted_at FROM feedback_submissions WHERE user_id = ? "
        "UNION ALL SELECT 'contact', id, submitted_at FROM contact_submissions WHERE user_id = ? "
        "ORDER BY submitted_at DESC, id DESC LIMIT 3", (uid, uid, uid)).fetchall()
    recent = [{"kind": r["kind"], "id": r["id"], "title": FORMS[r["kind"]]["title"],
               "reference": reference(r["kind"], r["id"]), "submitted_at": r["submitted_at"]}
              for r in recent]
    return render_template("dashboard.html", counts=counts, total=sum(counts.values()), recent=recent)


@app.route("/submissions")
@login_required
def submissions():
    groups = []
    for kind, spec in FORMS.items():
        items = []
        for row in submission_rows(kind):
            items.append({
                "id": row["id"], "reference": reference(kind, row["id"]),
                "submitted_at": row["submitted_at"],
                "details": [(f["label"], row[f["name"]]) for f in spec["fields"]],
            })
        groups.append({"kind": kind, "title": spec["title"], "entries": items})
    return render_template("submissions.html", groups=groups)


# --------------------------------------------------------------------- forms
def get_spec(kind):
    spec = FORMS.get(kind)
    if spec is None:
        abort(404)
    return spec


@app.route("/form/<kind>", methods=["GET", "POST"])
@login_required
def form_page(kind):
    spec = get_spec(kind)
    errors, values = {}, {}
    if request.method == "POST":
        values, errors = validate_form(spec, request.form)
        if not errors:
            save_draft(kind, values)
            return redirect(url_for("review", kind=kind))
        flash("Some answers need your attention. Please correct them and try again.", "error")
    elif request.args.get("edit"):
        values = get_draft(kind) or {}
    else:
        clear_draft(kind)  # opening a form from the dashboard starts fresh
    config = public_config(kind)
    config["focus"] = request.args.get("focus", "")
    return render_template(f"{kind}_form.html", kind=kind, spec=spec, values=values,
                           errors=errors, cfg=config)


@app.route("/review/<kind>")
@login_required
def review(kind):
    spec = get_spec(kind)
    draft = get_draft(kind)
    if not draft:
        flash("There is nothing to review yet. Please fill in the form first.", "error")
        return redirect(url_for("form_page", kind=kind))
    items, sentences = [], []
    for f in spec["fields"]:
        value = draft.get(f["name"], "")
        shown = next((o["label"] for o in f.get("options", []) if o["value"] == value), value)
        items.append({"name": f["name"], "label": f["label"], "value": shown})
        sentences.append(f["say"].format(speak_value(f["kind"], value)))
    return render_template("review.html", kind=kind, spec=spec, items=items, sentences=sentences)


@app.route("/submit/<kind>", methods=["POST"])
@login_required
def submit(kind):
    spec = get_spec(kind)
    if request.form.get("confirmed") != "yes":
        abort(400, "Please confirm your details before submitting.")
    draft = get_draft(kind)
    if not draft:
        flash("Nothing to submit. Your form may already have been submitted.", "error")
        return redirect(url_for("dashboard"))
    values, errors = validate_form(spec, draft)
    if errors:
        flash("Some details are not valid. Please edit them.", "error")
        return redirect(url_for("form_page", kind=kind, edit=1))

    columns = [f["name"] for f in spec["fields"]]  # column names come from forms.py only
    if "rating" in values:
        values["rating"] = int(values["rating"])
    db = database.get_db()
    cursor = db.execute(
        f"INSERT INTO {spec['table']} (user_id, {', '.join(columns)}) "
        f"VALUES (?, {', '.join('?' for _ in columns)})",
        [g.user["id"]] + [values[c] for c in columns])
    db.commit()
    clear_draft(kind)
    return redirect(url_for("success", kind=kind, sub_id=cursor.lastrowid))


@app.route("/cancel/<kind>", methods=["POST"])
@login_required
def cancel(kind):
    get_spec(kind)
    clear_draft(kind)
    flash("The form was cancelled. Nothing was saved.", "success")
    return redirect(url_for("dashboard"))


@app.route("/success/<kind>/<int:sub_id>")
@login_required
def success(kind, sub_id):
    spec = get_spec(kind)
    row = database.get_db().execute(
        f"SELECT id FROM {spec['table']} WHERE id = ? AND user_id = ?", (sub_id, g.user["id"])).fetchone()
    if row is None:
        abort(404)
    return render_template("success.html", kind=kind, spec=spec, sub_id=sub_id,
                           ref=reference(kind, sub_id))


# ------------------------------------------------------------------- errors
@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(405)
@app.errorhandler(413)
@app.errorhandler(500)
def handle_error(error):
    code = getattr(error, "code", 500)
    messages = {404: "We could not find that page.", 405: "That action is not allowed.",
                413: "The submitted data was too large.", 500: "Something went wrong on our side."}
    message = getattr(error, "description", None) if code == 400 else messages.get(code)
    return render_template("error.html", code=code, message=message or "Something went wrong."), code


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=os.environ.get("FLASK_DEBUG", "0") == "1")
