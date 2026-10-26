"""Form definitions and server-side validation for VoiceAssist.

The same definitions are sent to the browser so the voice assistant knows which
question to ask for each field.
"""
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
PHONE_RE = re.compile(r"^\+?\d{10,13}$")
REGNO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-/]{2,19}$")


def opt(value, label=None, aliases=()):
    return {"value": value, "label": label or value, "aliases": list(aliases)}


DEPARTMENTS = [
    opt("Computer Science and Engineering",
        aliases=["cse", "c s e", "computer science", "computer science engineering"]),
    opt("Information Technology", aliases=["it", "i t", "information tech"]),
    opt("Artificial Intelligence and Data Science",
        aliases=["ai", "a i", "ai and ds", "ai ds", "aids", "a i d s", "ai and data science",
                 "ai data science", "artificial intelligence", "data science"]),
    opt("Electronics and Communication Engineering",
        aliases=["ece", "e c e", "electronics and communication", "electronics"]),
    opt("Electrical and Electronics Engineering",
        aliases=["eee", "e e e", "electrical and electronics", "electrical"]),
    opt("Mechanical Engineering", aliases=["mech", "mechanical"]),
    opt("Civil Engineering", aliases=["civil"]),
    opt("Business Administration", aliases=["bba", "mba", "business", "management"]),
    opt("Other", aliases=["others", "something else"]),
]

YEARS = [
    opt("1st Year", aliases=["1", "1st", "one", "first", "first year"]),
    opt("2nd Year", aliases=["2", "2nd", "two", "second", "second year"]),
    opt("3rd Year", aliases=["3", "3rd", "three", "third", "third year"]),
    opt("4th Year", aliases=["4", "4th", "four", "fourth", "fourth year", "final year"]),
]

CATEGORIES = [
    opt("General Feedback", aliases=["general", "feedback"]),
    opt("Website Design", aliases=["design", "website", "look"]),
    opt("Voice Assistant", aliases=["voice", "assistant", "voice assistance"]),
    opt("Accessibility", aliases=["accessible", "access"]),
    opt("Suggestion", aliases=["suggest", "idea"]),
    opt("Bug Report", aliases=["bug", "problem", "error", "issue"]),
    opt("Other", aliases=["others"]),
]

RATINGS = [
    opt("1", "1 - Very poor", ["one", "very poor", "1 star"]),
    opt("2", "2 - Poor", ["two", "poor", "2 stars"]),
    opt("3", "3 - Average", ["three", "average", "okay", "3 stars"]),
    opt("4", "4 - Good", ["four", "good", "4 stars"]),
    opt("5", "5 - Excellent", ["five", "excellent", "great", "5 stars"]),
]

FORMS = {
    "student": {
        "title": "Student Registration Form",
        "table": "student_submissions",
        "prefix": "STU",
        "fields": [
            {"name": "name", "label": "Full Name", "kind": "name",
             "question": "What is your full name?", "say": "Your name is {}.",
             "autocomplete": "name", "type": "text"},
            {"name": "register_number", "label": "Register Number", "kind": "regno",
             "question": "What is your register number?", "say": "Your register number is {}.",
             "autocomplete": "off", "type": "text"},
            {"name": "email", "label": "Email", "kind": "email",
             "question": "What is your email address? You can say, name at gmail dot com.",
             "say": "Your email is {}.", "autocomplete": "email", "type": "email"},
            {"name": "phone", "label": "Phone Number", "kind": "phone",
             "question": "What is your phone number?", "say": "Your phone number is {}.",
             "autocomplete": "tel", "type": "tel", "inputmode": "tel"},
            {"name": "department", "label": "Department", "kind": "select",
             "question": "Which department are you studying?",
             "say": "Your department is {}.", "options": DEPARTMENTS},
            {"name": "year", "label": "Year of Study", "kind": "select",
             "question": "What is your year of study?",
             "say": "Your year of study is {}.", "options": YEARS},
        ],
    },
    "feedback": {
        "title": "Feedback Form",
        "table": "feedback_submissions",
        "prefix": "FBK",
        "fields": [
            {"name": "name", "label": "Name", "kind": "name",
             "question": "What is your name?", "say": "Your name is {}.",
             "autocomplete": "name", "type": "text"},
            {"name": "department", "label": "Department", "kind": "select",
             "question": "Which department are you from?",
             "say": "Your department is {}.", "options": DEPARTMENTS},
            {"name": "category", "label": "Feedback Category", "kind": "select",
             "question": "Which category is your feedback about?",
             "say": "Your feedback category is {}.", "options": CATEGORIES},
            {"name": "rating", "label": "Rating", "kind": "select",
             "question": "How would you rate your experience, from 1 to 5?",
             "say": "Your rating is {} out of 5.", "options": RATINGS},
            {"name": "message", "label": "Feedback Message", "kind": "textarea",
             "question": "Please tell us your feedback.", "say": "Your feedback is: {}",
             "min": 5, "max": 1000},
        ],
    },
    "contact": {
        "title": "Contact Form",
        "table": "contact_submissions",
        "prefix": "CON",
        "fields": [
            {"name": "name", "label": "Name", "kind": "name",
             "question": "What is your name?", "say": "Your name is {}.",
             "autocomplete": "name", "type": "text"},
            {"name": "email", "label": "Email", "kind": "email",
             "question": "What is your email address? You can say, name at gmail dot com.",
             "say": "Your email is {}.", "autocomplete": "email", "type": "email"},
            {"name": "phone", "label": "Phone Number", "kind": "phone",
             "question": "What is your phone number?", "say": "Your phone number is {}.",
             "autocomplete": "tel", "type": "tel", "inputmode": "tel"},
            {"name": "subject", "label": "Subject", "kind": "text",
             "question": "What is the subject of your message?", "say": "Your subject is {}.",
             "min": 3, "max": 150, "type": "text"},
            {"name": "message", "label": "Message", "kind": "textarea",
             "question": "What is your message?", "say": "Your message is: {}",
             "min": 5, "max": 1000},
        ],
    },
}


# ---------------------------------------------------------------- validation
def validate_value(field, raw):
    """Return (clean_value, error_message). error_message is '' when valid."""
    value = (raw or "").strip() if isinstance(raw, str) else ""
    label = field["label"]
    kind = field["kind"]

    if not value:
        if kind == "select":
            return "", f"Please choose {label}."
        return "", f"{label} is required."

    if kind == "name":
        value = re.sub(r"\s+", " ", value)
        ok = (2 <= len(value) <= 100 and value[0].isalpha()
              and all(ch.isalpha() or ch in " .'-" for ch in value))
        if not ok:
            return value, f"Please enter a valid {label.lower()} using letters only."
    elif kind == "regno":
        value = re.sub(r"\s+", "", value).upper()
        if not REGNO_RE.match(value):
            return value, "Please enter a valid register number (3 to 20 letters or digits)."
    elif kind == "email":
        value = value.lower()
        if len(value) > 254 or not EMAIL_RE.match(value):
            return value, "Please enter a valid email address, for example name@example.com."
    elif kind == "phone":
        value = re.sub(r"[\s\-().]", "", value)
        if not PHONE_RE.match(value):
            return value, "Please enter a valid phone number with 10 to 13 digits."
    elif kind == "select":
        match = next((o for o in field["options"] if o["value"].lower() == value.lower()), None)
        if match is None:
            return value, f"Please choose a valid {label.lower()} from the list."
        value = match["value"]
    else:  # text / textarea
        value = re.sub(r"[ \t]+", " ", value)
        low, high = field.get("min", 1), field.get("max", 500)
        if not (low <= len(value) <= high):
            return value, f"{label} must be between {low} and {high} characters."
    return value, ""


def validate_form(spec, data):
    """Validate a whole form. Returns (clean_values, errors)."""
    clean, errors = {}, {}
    for field in spec["fields"]:
        value, error = validate_value(field, data.get(field["name"], ""))
        clean[field["name"]] = value
        if error:
            errors[field["name"]] = error
    return clean, errors


def validate_email_value(email):
    return bool(email) and len(email) <= 254 and bool(EMAIL_RE.match(email))


def validate_person_name(name):
    name = (name or "").strip()
    return (2 <= len(name) <= 100 and name[0].isalpha()
            and all(ch.isalpha() or ch in " .'-" for ch in name))


def validate_password(password):
    """Return an error message or '' when the password is acceptable."""
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain at least one letter and one number."
    if len(password) > 128:
        return "Password is too long."
    return ""


# ------------------------------------------------------------------- helpers
def speak_value(kind, value):
    """Make a value easy to pronounce for text-to-speech."""
    value = str(value)
    if kind == "email":
        return value.replace("@", " at ").replace(".", " dot ").replace("_", " underscore ") \
                    .replace("-", " dash ")
    if kind == "phone":
        return " ".join("plus" if c == "+" else c for c in value)
    if kind == "regno":
        return " ".join(value)
    return value


def reference(kind, submission_id):
    return f"VA-{FORMS[kind]['prefix']}-{submission_id:05d}"


def public_config(kind):
    """JSON-safe description of a form for the browser."""
    spec = FORMS[kind]
    fields = []
    for f in spec["fields"]:
        item = {k: f[k] for k in ("name", "label", "kind", "question") if k in f}
        for extra in ("min", "max", "options"):
            if extra in f:
                item[extra] = f[extra]
        fields.append(item)
    return {"kind": kind, "title": spec["title"], "fields": fields}
