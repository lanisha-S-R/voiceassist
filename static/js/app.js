/* VoiceAssist - page logic: accessibility tools, validation, voice form wizard,
 * dashboard / login voice commands, review and success pages. */
(function () {
  'use strict';

  var VA = window.VA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(key, value) {
    try {
      if (value === undefined) { return localStorage.getItem(key); }
      localStorage.setItem(key, value);
    } catch (e) { /* storage not available */ }
    return null;
  }

  function announce(text) {
    var box = $('#sr-status');
    if (!box) { return; }
    box.textContent = '';
    setTimeout(function () { box.textContent = text; }, 60);
  }

  /* ------------------------------------------------------------ preferences */
  var SIZES = ['100%', '112.5%', '125%', '143.75%'];
  var sizeIndex = parseInt(store('va_size'), 10);
  if (isNaN(sizeIndex) || sizeIndex < 0 || sizeIndex >= SIZES.length) { sizeIndex = 1; }

  function applySize() { document.documentElement.style.fontSize = SIZES[sizeIndex]; }
  applySize();

  var contrastBtn = $('#toggle-contrast');
  var soundBtn = $('#toggle-sound');

  function applyContrast(on) {
    document.body.classList.toggle('hc', on);
    if (contrastBtn) { contrastBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  }
  applyContrast(store('va_contrast') === '1');

  function applySound() {
    if (!soundBtn) { return; }
    var on = !VA.isMuted();
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.textContent = on ? 'Voice: On' : 'Voice: Off';
  }
  applySound();

  if ($('#text-smaller')) {
    $('#text-smaller').addEventListener('click', function () {
      sizeIndex = Math.max(0, sizeIndex - 1); store('va_size', String(sizeIndex)); applySize();
      announce('Text size decreased');
    });
    $('#text-larger').addEventListener('click', function () {
      sizeIndex = Math.min(SIZES.length - 1, sizeIndex + 1); store('va_size', String(sizeIndex)); applySize();
      announce('Text size increased');
    });
    contrastBtn.addEventListener('click', function () {
      var on = !document.body.classList.contains('hc');
      applyContrast(on); store('va_contrast', on ? '1' : '0');
      announce(on ? 'High contrast on' : 'High contrast off');
    });
    soundBtn.addEventListener('click', function () {
      VA.setMuted(!VA.isMuted()); applySound();
      announce(VA.isMuted() ? 'Spoken voice is off' : 'Spoken voice is on');
    });
  }

  /* Show / hide password */
  $$('[data-toggle-password]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-toggle-password'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });

  /* ------------------------------------------------------------- helpers */
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  var NUM = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

  function wordsToDigits(text) {
    return text
      .replace(/\b(double|triple)\s+(\w+)/gi, function (m, kind, word) {
        var w = word.toLowerCase();
        var digit = NUM.hasOwnProperty(w) ? NUM[w] : (/^\d$/.test(w) ? w : null);
        if (digit === null) { return m; }
        return String(digit).repeat(kind.toLowerCase() === 'double' ? 2 : 3);
      })
      .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, function (m) {
        return String(NUM[m.toLowerCase()]);
      });
  }

  /* Remove spoken lead-in phrases such as "my name is". */
  function stripLead(text, aggressive) {
    var t = String(text).trim().replace(/[.!?]+$/, '');
    t = t.replace(/^(?:(?:hi|hello|okay|ok|well|um|uh)[,\s]+)+/i, '');
    t = t.replace(/^(?:my|the|its|it's|it is|this is)\s+(?:full\s+name|name|register\s+number|registration\s+number|reg(?:ister)?\s*(?:no|number)|roll\s+number|email\s+address|email\s+id|email|e-mail|phone\s+number|mobile\s+number|contact\s+number|number|department|branch|year\s+of\s+study|year|subject|message|feedback|comment|rating)\s*(?:is|are|will be)?\s+/i, '');
    if (aggressive) {
      t = t.replace(/^(?:i\s+am|i'm|call\s+me|i\s+study\s+in|i\s+am\s+studying|i'm\s+studying|i\s+am\s+in|i\s+rate\s+it|i\s+would\s+rate\s+it|i\s+would\s+give\s+it|i\s+give\s+it)\s+/i, '');
      t = t.replace(/^(?:it'?s|it\s+is)\s+/i, '');
    }
    return t.trim();
  }

  function parseEmail(text) {
    var t = stripLead(text, true).toLowerCase();
    t = wordsToDigits(t)
      .replace(/\s+at\s+the\s+rate(?:\s+of)?\s+/g, '@')
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\bdot\b/g, '.')
      .replace(/\s*underscore\s*/g, '_')
      .replace(/\s*(?:dash|hyphen)\s*/g, '-')
      .replace(/\s+/g, '');
    return t;
  }

  function parsePhone(text) {
    var t = stripLead(text, true).toLowerCase();
    t = wordsToDigits(t).replace(/\bplus\b/g, '+').replace(/[^\d+]/g, '');
    return t;
  }

  function matchOption(field, text) {
    var spoken = ' ' + norm(text) + ' ';
    var best = null, bestScore = 0;
    field.options.forEach(function (o) {
      [o.label, o.value].concat(o.aliases || []).forEach(function (cand) {
        var c = norm(cand);
        if (c && spoken.indexOf(' ' + c + ' ') !== -1 && c.length > bestScore) { best = o; bestScore = c.length; }
      });
    });
    return best;
  }

  /* Turn a spoken sentence into a field value. */
  function parseAnswer(field, text) {
    var t;
    switch (field.kind) {
      case 'name':
        t = stripLead(text, true).replace(/[^\p{L} .'\-]/gu, ' ').replace(/\s+/g, ' ').trim();
        return { value: t.split(' ').map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }).join(' ') };
      case 'regno':
        t = wordsToDigits(stripLead(text, true)).replace(/[^A-Za-z0-9\-\/]/g, '').toUpperCase();
        return { value: t };
      case 'email':
        return { value: parseEmail(text) };
      case 'phone':
        return { value: parsePhone(text) };
      case 'select':
        var match = matchOption(field, text);
        if (!match) {
          return { error: 'I could not match that to ' + field.label + '. Please choose one of the options.' };
        }
        return { value: match.value };
      default:
        t = stripLead(text, false);
        return { value: t ? t.charAt(0).toUpperCase() + t.slice(1) : '' };
    }
  }

  /* Same rules as the server (forms.py). Returns an error message or ''. */
  function validateField(field, raw) {
    var v = String(raw || '').trim();
    var label = field.label;
    if (!v) { return field.kind === 'select' ? 'Please choose ' + label + '.' : label + ' is required.'; }
    switch (field.kind) {
      case 'name':
        if (!/^[\p{L}][\p{L} .'\-]{1,99}$/u.test(v)) { return 'Please enter a valid ' + label.toLowerCase() + ' using letters only.'; }
        break;
      case 'regno':
        if (!/^[A-Za-z0-9][A-Za-z0-9\-\/]{2,19}$/.test(v.replace(/\s+/g, ''))) {
          return 'Please enter a valid register number, 3 to 20 letters or digits.';
        }
        break;
      case 'email':
        if (v.length > 254 || !EMAIL_RE.test(v)) { return 'Please enter a valid email address, for example name@example.com.'; }
        break;
      case 'phone':
        if (!/^\+?\d{10,13}$/.test(v.replace(/[\s\-().]/g, ''))) { return 'Please enter a valid phone number with 10 to 13 digits.'; }
        break;
      case 'select':
        if (!field.options.some(function (o) { return o.value.toLowerCase() === v.toLowerCase(); })) {
          return 'Please choose a valid ' + label.toLowerCase() + ' from the list.';
        }
        break;
      default:
        var min = field.min || 1, max = field.max || 500;
        if (v.length < min || v.length > max) { return label + ' must be between ' + min + ' and ' + max + ' characters.'; }
    }
    return '';
  }

  /* Say a value so that text-to-speech pronounces it clearly. */
  function speakable(field, value) {
    var v = String(value);
    if (field.kind === 'select') {
      var o = field.options.filter(function (x) { return x.value === v; })[0];
      return o ? o.label.replace(/^(\d) - /, '$1, ') : v;
    }
    if (field.kind === 'email') {
      return v.replace(/@/g, ' at ').replace(/\./g, ' dot ').replace(/_/g, ' underscore ').replace(/-/g, ' dash ');
    }
    if (field.kind === 'phone') { return v.replace(/\+/g, 'plus ').split('').join(' ').replace(/\s+/g, ' '); }
    if (field.kind === 'regno') { return v.split('').join(' '); }
    return v;
  }

  function isYes(text) { return /\b(yes|yeah|yep|yup|correct|right|ok|okay|sure|next|continue|confirm)\b/i.test(text); }
  function isNo(text) { return /\b(no|nope|not|wrong|incorrect|change|edit|again|retry|redo)\b/i.test(text); }

  function showVoiceProblem(message) {
    var box = $('#voice-unsupported');
    if (box) { box.textContent = message; box.hidden = false; }
  }

  /* ------------------------------------------------------ form validation */
  /* Login / register / reset forms. */
  $$('form[data-validate]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var firstBad = null, firstMsg = '';
      $$('[data-rule]', form).forEach(function (input) {
        var rule = input.getAttribute('data-rule');
        var label = input.getAttribute('data-label') || 'This field';
        var value = input.value;
        var msg = '';
        if (!value.trim()) { msg = label + ' is required.'; }
        else if (rule === 'email' && !EMAIL_RE.test(value.trim())) { msg = 'Please enter a valid email address.'; }
        else if (rule === 'name' && !/^[\p{L}][\p{L} .'\-]{1,99}$/u.test(value.trim())) { msg = 'Please enter a valid name using letters only.'; }
        else if (rule === 'password-new' && (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value))) {
          msg = 'Password must be at least 8 characters with a letter and a number.';
        } else if (rule.indexOf('match:') === 0) {
          var other = document.getElementById(rule.slice(6));
          if (other && other.value !== value) { msg = 'Passwords do not match.'; }
        }
        var err = document.getElementById('err-' + input.id);
        if (err) { err.textContent = msg; }
        input.parentNode.classList.toggle('has-error', !!msg);
        input.closest('.field').classList.toggle('has-error', !!msg);
        if (msg) { input.setAttribute('aria-invalid', 'true'); } else { input.removeAttribute('aria-invalid'); }
        if (msg && !firstBad) { firstBad = input; firstMsg = msg; }
      });
      if (firstBad) {
        event.preventDefault();
        firstBad.focus();
        VA.speak(firstMsg);
      }
    });
  });

  /* Read important error messages aloud when a page loads with errors. */
  (function readServerErrors() {
    var page = document.body.getAttribute('data-page');
    if (page === 'form') { return; } // the form wizard reads its own errors
    var alertBox = $('.alert-error');
    var fieldErr = $$('.field-error').filter(function (e) { return e.textContent.trim(); })[0];
    var text = (alertBox && alertBox.textContent.trim()) || (fieldErr && fieldErr.textContent.trim());
    if (text) { VA.speak(text); }
  })();

  /* ---------------------------------------------------------- login page */
  function initLogin() {
    var btn = $('#btn-voice-login');
    if (!btn) { return; }
    if (!VA.canListen) {
      btn.addEventListener('click', function () {
        var msg = VA.errorMessage('unsupported');
        announce(msg); VA.speak(msg);
      });
      return;
    }
    btn.addEventListener('click', async function () {
      await VA.speak('Welcome to Voice Assist. Say your email address now. Or say register, or forgot password.');
      var res = await VA.listen();
      if (!res.ok) {
        var m = VA.errorMessage(res.error);
        if (m) { announce(m); await VA.speak(m); }
        return;
      }
      var lower = norm(res.transcript);
      if (/\bregister\b|\bsign up\b|\bcreate account\b/.test(lower)) {
        await VA.speak('Opening the registration page.'); window.location.href = '/register'; return;
      }
      if (/forgot/.test(lower)) {
        await VA.speak('Opening the forgot password page.'); window.location.href = '/forgot'; return;
      }
      var email = parseEmail(res.transcript);
      var input = $('#email');
      if (!EMAIL_RE.test(email)) {
        var bad = 'I heard ' + res.transcript + ', but that does not look like an email address. Please press the button and try again, or type it.';
        announce(bad); await VA.speak(bad); input.focus(); return;
      }
      input.value = email;
      $('#err-email').textContent = '';
      var next = 'Email entered: ' + speakable({ kind: 'email' }, email) + '. Now please type your password, then press the Log in button. For your safety, passwords are not entered by voice.';
      announce('Email entered: ' + email);
      $('#password').focus();
      await VA.speak(next);
    });
  }

  /* ------------------------------------------------------- dashboard page */
  function initDashboard() {
    var btn = $('#btn-voice-dashboard');
    if (!btn) { return; }
    var targets = {};
    $$('[data-voice-target]').forEach(function (a) { targets[a.getAttribute('data-voice-target')] = a.href; });

    btn.addEventListener('click', async function () {
      if (!VA.canListen) {
        var msg = VA.errorMessage('unsupported'); announce(msg); VA.speak(msg); return;
      }
      await VA.speak('What would you like to do? You can say: open student registration form, open feedback form, open contact form, or show my submissions.');
      var res = await VA.listen();
      if (!res.ok) {
        var m = VA.errorMessage(res.error);
        if (m) { announce(m); await VA.speak(m + ' Press the button to try again.'); }
        return;
      }
      var t = norm(res.transcript), key = null, say = '';
      if (/submission|history|my forms/.test(t)) { key = 'submissions'; say = 'Showing your submissions.'; }
      else if (/student|registration/.test(t)) { key = 'student'; say = 'Opening the student registration form.'; }
      else if (/feedback/.test(t)) { key = 'feedback'; say = 'Opening the feedback form.'; }
      else if (/contact/.test(t)) { key = 'contact'; say = 'Opening the contact form.'; }
      else if (/log ?out|sign out/.test(t)) {
        await VA.speak('Logging you out.'); $('.main-nav form button').click(); return;
      }
      if (!key) {
        var sorry = 'Sorry, I heard ' + res.transcript + ', but I do not know that command. Press the button and try again.';
        announce(sorry); await VA.speak(sorry); return;
      }
      announce(say);
      await VA.speak(say);
      window.location.href = targets[key];
    });
  }

  /* ----------------------------------------------------- voice form wizard */
  function FormWizard(root) {
    var self = this;
    this.cfg = JSON.parse(root.getAttribute('data-config'));
    this.fields = this.cfg.fields;
    this.form = $('#voice-form');
    this.idx = 0;
    this.active = false; // true while a voice session is running
    this.run = 0;        // changes whenever the running voice flow must stop
    this.attempts = 0;
    this.auto = $('#auto-listen');
    this.heard = $('#heard-text');
    this.statusEl = $('#current-question');

    if (!VA.canSpeak && !VA.canListen) {
      showVoiceProblem('Voice features are not supported in this browser. You can still fill in the form by typing. For voice, please use Google Chrome or Microsoft Edge.');
      ['btn-start', 'btn-stop', 'btn-repeat', 'btn-read', 'btn-edit', 'btn-mic'].forEach(function (id) { $('#' + id).disabled = true; });
    } else if (!VA.canListen) {
      showVoiceProblem('Voice input (speech recognition) is not supported in this browser, so the assistant can read questions aloud but you must type your answers. For full voice support use Google Chrome or Microsoft Edge.');
      $('#btn-mic').disabled = true;
      this.auto.checked = false; this.auto.disabled = true;
    }

    // Buttons
    $('#btn-start').addEventListener('click', function () { self.start(); });
    $('#btn-stop').addEventListener('click', function () { self.stop(true); });
    $('#btn-repeat').addEventListener('click', function () { self.cancelFlow(); self.askCurrent(); });
    $('#btn-read').addEventListener('click', function () { self.readAnswer(); });
    $('#btn-edit').addEventListener('click', function () { self.editAnswer(); });
    $('#btn-next').addEventListener('click', function () { self.next(); });
    $('#btn-prev').addEventListener('click', function () { self.prev(); });
    $('#btn-mic').addEventListener('click', function () { self.answerNow(); });

    // Typing / focusing fields
    this.fields.forEach(function (f, i) {
      var el = self.el(i);
      el.addEventListener('input', function () { self.clearError(i); self.updateProgress(); });
      el.addEventListener('change', function () { self.clearError(i); self.updateProgress(); });
      el.addEventListener('focus', function () {
        if (i === self.idx) { return; }
        self.cancelFlow();
        self.idx = i; self.attempts = 0;
        self.updateUI();
        if (self.active) { self.askCurrent(); }
      });
    });

    this.form.addEventListener('submit', function (event) {
      self.cancelFlow();
      var bad = self.firstInvalid();
      if (bad !== -1) {
        event.preventDefault();
        self.idx = bad; self.updateUI();
        var msg = self.showError(bad);
        self.el(bad).focus();
        VA.speak(msg);
      }
    });

    // Start on the field requested (e.g. from the review page "Change" link)
    var focusIdx = -1;
    this.fields.forEach(function (f, i) { if (f.name === self.cfg.focus) { focusIdx = i; } });
    if (focusIdx !== -1) { this.idx = focusIdx; }
    this.updateUI();
    this.readServerErrors(focusIdx);
  }

  FormWizard.prototype.el = function (i) { return this.form.elements[this.fields[i === undefined ? this.idx : i].name]; };
  FormWizard.prototype.value = function (i) { return String(this.el(i).value || '').trim(); };
  FormWizard.prototype.field = function () { return this.fields[this.idx]; };

  FormWizard.prototype.setHeard = function (text) { this.heard.textContent = text || 'Nothing yet'; };

  FormWizard.prototype.showError = function (i, message) {
    var f = this.fields[i];
    message = message || validateField(f, this.value(i)) || '';
    $('#err-' + f.name).textContent = message;
    $('#field-' + f.name).classList.toggle('has-error', !!message);
    if (message) { this.el(i).setAttribute('aria-invalid', 'true'); }
    return message;
  };

  FormWizard.prototype.clearError = function (i) {
    var f = this.fields[i];
    $('#err-' + f.name).textContent = '';
    $('#field-' + f.name).classList.remove('has-error');
    this.el(i).removeAttribute('aria-invalid');
  };

  FormWizard.prototype.firstInvalid = function () {
    for (var i = 0; i < this.fields.length; i++) {
      if (validateField(this.fields[i], this.value(i))) { return i; }
    }
    return -1;
  };

  FormWizard.prototype.answeredCount = function () {
    var n = 0, self = this;
    this.fields.forEach(function (f, i) { if (!validateField(f, self.value(i))) { n++; } });
    return n;
  };

  FormWizard.prototype.updateProgress = function () {
    var total = this.fields.length, done = this.answeredCount();
    $('#progress-fill').style.width = Math.round(done / total * 100) + '%';
    $('#progress').setAttribute('aria-valuenow', String(done));
    $('#progress').setAttribute('aria-valuetext', done + ' of ' + total + ' answered');
    $('#progress-text').textContent = 'Question ' + (this.idx + 1) + ' of ' + total + ' · ' + done + ' answered';
  };

  FormWizard.prototype.updateUI = function () {
    var self = this;
    this.fields.forEach(function (f, i) { $('#field-' + f.name).classList.toggle('is-current', i === self.idx); });
    this.statusEl.textContent = 'Question ' + (this.idx + 1) + ': ' + this.field().question;
    this.updateProgress();
  };

  FormWizard.prototype.focusField = function () {
    var el = this.el();
    el.focus();
    if (el.scrollIntoView) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };

  FormWizard.prototype.cancelFlow = function () { this.run++; VA.abort(); VA.stopSpeaking(); };

  FormWizard.prototype.readServerErrors = function (focusIdx) {
    var bad = -1, self = this;
    this.fields.forEach(function (f, i) { if (bad === -1 && $('#err-' + f.name).textContent.trim()) { bad = i; } });
    if (bad !== -1) {
      this.idx = bad; this.updateUI();
      this.el(bad).focus();
      VA.speak($('#err-' + this.fields[bad].name).textContent);
    } else if (focusIdx !== -1) {
      this.el(focusIdx).focus();
      VA.speak('Editing ' + this.fields[focusIdx].label + '. Type a new answer, or press Edit Answer to say it.');
    }
  };

  FormWizard.prototype.questionText = function (note) {
    var f = this.field(), q = f.question;
    if (f.kind === 'select') {
      q += ' The options are: ' + f.options.map(function (o) { return o.label.replace(/^(\d) - /, '$1, '); }).join(', ') + '.';
    }
    return (note ? note + ' ' : '') + q;
  };

  FormWizard.prototype.start = async function () {
    this.cancelFlow();
    this.active = true;
    var first = this.firstInvalid();
    this.idx = first !== -1 ? first : this.idx;
    this.attempts = 0;
    this.askCurrent('Voice form filling started. I will ask ' + this.fields.length +
      ' questions. After each answer I will ask you to confirm. You can press Stop Voice at any time.');
  };

  FormWizard.prototype.stop = function (announceIt) {
    this.cancelFlow();
    this.active = false;
    this.setHeard('Voice stopped');
    if (announceIt) { announce('Voice assistant stopped. You can type your answers.'); }
  };

  FormWizard.prototype.askCurrent = async function (note) {
    var run = ++this.run;
    VA.abort();
    this.updateUI();
    this.focusField();
    await VA.speak(this.questionText(note));
    if (run !== this.run) { return; }
    if (this.active && this.auto.checked && VA.canListen) { await this.listenAnswer(run); }
  };

  FormWizard.prototype.answerNow = async function () {
    this.cancelFlow();
    this.active = true;
    var run = this.run;
    this.focusField();
    await this.listenAnswer(run);
  };

  FormWizard.prototype.listenAnswer = async function (run) {
    var self = this;
    this.setHeard('Listening…');
    var res = await VA.listen({ onInterim: function (t) { if (run === self.run) { self.setHeard(t + '…'); } } });
    if (run !== this.run) { return; }
    if (!res.ok) { return this.voiceError(res.error, run); }
    return this.handleTranscript(res.transcript, run);
  };

  FormWizard.prototype.voiceError = async function (code, run) {
    if (code === 'aborted') { return; }
    var msg = VA.errorMessage(code);
    if (code === 'no-speech') {
      this.attempts++;
      this.setHeard('I did not hear anything');
      if (this.attempts < 3) {
        await VA.speak('I did not hear anything. Please say your answer again.');
        if (run !== this.run) { return; }
        return this.listenAnswer(run);
      }
      msg = 'I still could not hear you. You can type your answer, or press the microphone button to try again.';
    }
    this.active = false;
    this.setHeard(msg);
    announce(msg);
    await VA.speak(msg);
  };

  FormWizard.prototype.handleTranscript = async function (text, run) {
    var f = this.field(), lower = norm(text);
    this.setHeard('“' + text + '”');

    if (/^(repeat|say that again|repeat question|repeat the question)$/.test(lower)) { return this.askCurrent(); }
    if (/^(stop|stop listening|stop voice|cancel)$/.test(lower)) { this.stop(true); return VA.speak('Voice assistant stopped.'); }
    if (/^(back|previous|go back|previous question)$/.test(lower)) { return this.prev(); }

    var parsed = parseAnswer(f, text);
    var problem = parsed.error || validateField(f, parsed.value);
    if (problem) {
      this.attempts++;
      this.el().value = parsed.value && !parsed.error ? parsed.value : this.el().value;
      this.showError(this.idx, problem);
      announce(problem);
      if (this.attempts >= 3) {
        this.active = false;
        return VA.speak(problem + ' Please type your answer, or press Edit Answer to try again.');
      }
      await VA.speak(problem + ' Please say it again.');
      if (run !== this.run) { return; }
      return this.listenAnswer(run);
    }

    this.attempts = 0;
    this.el().value = parsed.value;
    this.clearError(this.idx);
    this.el().dispatchEvent(new Event('change', { bubbles: true }));
    this.setHeard('“' + text + '” → ' + parsed.value);
    announce(f.label + ' filled: ' + parsed.value);

    await VA.speak('Got it. ' + f.label + ': ' + speakable(f, parsed.value) + '.');
    if (run !== this.run) { return; }
    if (this.auto.checked && VA.canListen) { return this.confirmAnswer(run, 0); }
    await VA.speak('Press Next Question to continue, or Edit Answer to change it.');
  };

  FormWizard.prototype.confirmAnswer = async function (run, tries) {
    await VA.speak(tries === 0 ? 'Is that correct? Say yes or no.' : 'Please say yes or no.');
    if (run !== this.run) { return; }
    var res = await VA.listen();
    if (run !== this.run) { return; }
    if (res.ok) {
      this.setHeard('“' + res.transcript + '”');
      if (isNo(res.transcript)) { this.attempts = 0; return this.askCurrent('Okay, let us try again.'); }
      if (isYes(res.transcript)) { return this.advance(run); }
    } else if (res.error === 'aborted') { return; }
    if (tries < 1) { return this.confirmAnswer(run, tries + 1); }
    await VA.speak('I will wait. Press Next Question to continue, or Edit Answer to change it.');
  };

  FormWizard.prototype.advance = function (run) {
    if (run !== this.run) { return; }
    this.attempts = 0;
    if (this.idx >= this.fields.length - 1) { return this.finish(); }
    this.idx++;
    return this.askCurrent();
  };

  FormWizard.prototype.finish = async function () {
    var bad = this.firstInvalid();
    if (bad !== -1) {
      this.idx = bad; this.updateUI();
      var msg = this.showError(bad);
      this.focusField();
      this.active = false;
      return VA.speak('One answer still needs attention. ' + msg);
    }
    var run = ++this.run;
    if (this.active) {
      await VA.speak('All questions are answered. Opening the review page. Nothing will be saved until you confirm.');
      if (run !== this.run) { return; }
      this.active = false;
      this.form.submit();
    } else {
      $('#btn-review').focus();
      announce('All questions are answered. Press Review Details to continue.');
      VA.speak('All questions are answered. Press Review Details to continue.');
    }
  };

  FormWizard.prototype.next = function () {
    this.cancelFlow();
    var f = this.field();
    var msg = validateField(f, this.value());
    if (msg) {
      this.showError(this.idx, msg);
      this.focusField();
      announce(msg);
      VA.speak(msg);
      return;
    }
    this.clearError(this.idx);
    if (this.idx >= this.fields.length - 1) { return this.finish(); }
    this.idx++;
    this.attempts = 0;
    this.askCurrent();
  };

  FormWizard.prototype.prev = function () {
    this.cancelFlow();
    if (this.idx === 0) { VA.speak('This is the first question.'); return; }
    this.idx--;
    this.attempts = 0;
    this.askCurrent();
  };

  FormWizard.prototype.readAnswer = function () {
    this.cancelFlow();
    var f = this.field(), v = this.value();
    var text = v ? f.label + ': ' + speakable(f, v) + '.' : f.label + ' has not been answered yet.';
    this.setHeard(v || 'No answer yet');
    announce(text);
    VA.speak(text);
  };

  FormWizard.prototype.editAnswer = function () {
    this.cancelFlow();
    this.active = true;
    this.attempts = 0;
    this.askCurrent('Let us change your ' + this.field().label.toLowerCase() + '. You can also type the new answer.');
  };

  function initForm() {
    var root = $('#form-app');
    if (root) { window.voiceWizard = new FormWizard(root); }
  }

  /* ---------------------------------------------------------- review page */
  function initReview() {
    var root = $('#review-app');
    if (!root) { return; }
    var sentences = JSON.parse(root.getAttribute('data-sentences'));
    var heard = $('#heard-text');
    var run = 0;

    async function readAll() {
      var my = ++run;
      VA.abort();
      var ok = await VA.speak('Please review your details.');
      for (var i = 0; i < sentences.length && ok; i++) {
        if (my !== run) { return; }
        ok = await VA.speak(sentences[i]);
      }
      if (my !== run) { return; }
      if (ok) { await VA.speak('Are these details correct? Press Confirm Details, Edit Details, Read Again, or Cancel. Or press Answer by Voice.'); }
      else { announce('Press Read Again to hear your details.'); }
    }

    $('#btn-read-again').addEventListener('click', readAll);
    $('#cancel-form').addEventListener('submit', function () { run++; VA.stopSpeaking(); });
    $('#confirm-form').addEventListener('submit', function () { run++; VA.stopSpeaking(); });

    $('#btn-voice-answer').addEventListener('click', async function () {
      run++;
      if (!VA.canListen) { var m = VA.errorMessage('unsupported'); announce(m); VA.speak(m); return; }
      VA.stopSpeaking();
      await VA.speak('Say confirm, edit, read again, or cancel.');
      var res = await VA.listen();
      if (!res.ok) {
        var msg = VA.errorMessage(res.error);
        if (msg) { heard.textContent = msg; announce(msg); await VA.speak(msg); }
        return;
      }
      heard.textContent = '“' + res.transcript + '”';
      var t = norm(res.transcript);
      if (/\b(no|not|edit|change|wrong|incorrect)\b/.test(t)) {
        await VA.speak('Opening the form so you can edit.'); window.location.href = $('#link-edit').href;
      } else if (/\b(again|repeat|read)\b/.test(t)) {
        readAll();
      } else if (/\b(cancel|discard)\b/.test(t)) {
        await VA.speak('Cancelling. Nothing will be saved.'); $('#cancel-form').submit();
      } else if (/\b(yes|yeah|confirm|correct|right|submit|ok|okay)\b/.test(t)) {
        await VA.speak('Thank you. Submitting your details.'); $('#confirm-form').submit();
      } else {
        var sorry = 'Sorry, I did not understand. Please press Answer by Voice and try again.';
        announce(sorry); await VA.speak(sorry);
      }
    });

    readAll();
  }

  /* --------------------------------------------------------- success page */
  function initSuccess() {
    var root = $('#success-app');
    if (!root) { return; }
    var message = root.getAttribute('data-message');
    $('#btn-read-success').addEventListener('click', function () { VA.speak(message); });
    VA.speak(message).then(function (ok) { if (!ok) { announce('Press Read Aloud to hear your confirmation.'); } });
  }

  /* ------------------------------------------------------------- start up */
  switch (document.body.getAttribute('data-page')) {
    case 'login': initLogin(); break;
    case 'dashboard': initDashboard(); break;
    case 'form': initForm(); break;
    case 'review': initReview(); break;
    case 'success': initSuccess(); break;
    default: break;
  }
})();
