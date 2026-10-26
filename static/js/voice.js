/* VoiceAssist - voice engine (Web Speech API)
 *
 *  VA.speak(text)   -> reads text aloud, resolves when finished
 *  VA.listen()      -> turns the microphone on ONCE, resolves with the recognised text
 *  VA.abort()       -> turns the microphone off
 *
 * The microphone is never started by itself: it only starts when a page calls
 * VA.listen() in response to a button press, and it stops after one answer.
 */
(function () {
  'use strict';

  var SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis;
  var LANG = 'en-IN';

  var muted = false;
  try { muted = localStorage.getItem('va_muted') === '1'; } catch (e) { /* storage not available */ }

  var recognition = null;
  var state = 'idle';
  var voices = [];

  function loadVoices() { if (synth) { voices = synth.getVoices() || []; } }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) { synth.addEventListener('voiceschanged', loadVoices); }
  }

  function pickVoice() {
    if (!voices.length) { return null; }
    var exact = voices.filter(function (v) { return v.lang === LANG; });
    if (exact.length) { return exact[0]; }
    var english = voices.filter(function (v) { return /^en/i.test(v.lang); });
    return english.length ? english[0] : null;
  }

  var LABELS = {
    idle: 'Microphone is off',
    speaking: 'Speaking…',
    listening: 'Listening… please speak now'
  };

  function setState(next) {
    state = next;
    var micEls = document.querySelectorAll('[data-mic]');
    for (var i = 0; i < micEls.length; i++) {
      micEls[i].classList.toggle('is-listening', next === 'listening');
      micEls[i].classList.toggle('is-speaking', next === 'speaking');
    }
    var statusEls = document.querySelectorAll('[data-mic-status]');
    for (var j = 0; j < statusEls.length; j++) { statusEls[j].textContent = LABELS[next]; }
  }

  /** Read text aloud. Resolves true when done, false if the browser blocked speech. */
  function speak(text) {
    return new Promise(function (resolve) {
      if (!synth || muted || !text) { resolve(true); return; }
      synth.cancel();
      var utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = LANG;
      utterance.rate = 0.95;
      var voice = pickVoice();
      if (voice) { utterance.voice = voice; }

      var finished = false;
      var timer = null;
      function finish(ok) {
        if (finished) { return; }
        finished = true;
        clearTimeout(timer);
        if (state === 'speaking') { setState('idle'); }
        resolve(ok);
      }
      utterance.onstart = function () { setState('speaking'); };
      utterance.onend = function () { finish(true); };
      utterance.onerror = function (event) { finish(event.error !== 'not-allowed'); };
      // Some browsers never fire "end": do not wait forever.
      timer = setTimeout(function () { finish(true); }, 4000 + String(text).length * 120);
      setTimeout(function () {
        try { synth.speak(utterance); } catch (e) { finish(true); }
      }, 40);
    });
  }

  function stopSpeaking() {
    if (synth) { synth.cancel(); }
    if (state === 'speaking') { setState('idle'); }
  }

  /** Turn the microphone on once. Resolves {ok:true, transcript} or {ok:false, error}. */
  function listen(options) {
    options = options || {};
    return new Promise(function (resolve) {
      if (!SpeechRecognitionAPI) { resolve({ ok: false, error: 'unsupported' }); return; }
      abort();
      stopSpeaking();

      var rec = new SpeechRecognitionAPI();
      rec.lang = LANG;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      recognition = rec;

      var finalText = '';
      var error = '';
      var settled = false;

      function done(result) {
        if (settled) { return; }
        settled = true;
        if (recognition === rec) { recognition = null; }
        setState('idle');
        resolve(result);
      }

      rec.onstart = function () { setState('listening'); };
      rec.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) { finalText += piece; } else { interim += piece; }
        }
        if (options.onInterim) { options.onInterim((finalText + interim).trim()); }
      };
      rec.onerror = function (event) { error = event.error || 'error'; };
      rec.onend = function () {
        if (error === 'aborted') { done({ ok: false, error: 'aborted' }); }
        else if (error && error !== 'no-speech') { done({ ok: false, error: error }); }
        else if (!finalText.trim()) { done({ ok: false, error: 'no-speech' }); }
        else { done({ ok: true, transcript: finalText.trim() }); }
      };

      try { rec.start(); } catch (e) { done({ ok: false, error: 'start-failed' }); }
    });
  }

  function abort() {
    if (recognition) {
      try { recognition.abort(); } catch (e) { /* already stopped */ }
      recognition = null;
    }
    if (state === 'listening') { setState('idle'); }
  }

  function errorMessage(code) {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone permission was denied. Please allow the microphone in your browser settings, or type your answer.';
      case 'audio-capture':
        return 'No microphone was found. Please connect a microphone, or type your answer.';
      case 'network':
        return 'Speech recognition needs an internet connection. Please check your connection, or type your answer.';
      case 'no-speech':
        return 'I did not hear anything.';
      case 'unsupported':
        return 'Voice input is not supported in this browser. Please use Google Chrome or Microsoft Edge, or type your answer.';
      case 'aborted':
        return '';
      default:
        return 'Sorry, voice recognition had a problem. Please try again, or type your answer.';
    }
  }

  window.VA = {
    canSpeak: !!synth && typeof SpeechSynthesisUtterance !== 'undefined',
    canListen: !!SpeechRecognitionAPI,
    speak: speak,
    stopSpeaking: stopSpeaking,
    listen: listen,
    abort: abort,
    errorMessage: errorMessage,
    isMuted: function () { return muted; },
    setMuted: function (value) {
      muted = !!value;
      try { localStorage.setItem('va_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (muted) { stopSpeaking(); }
    }
  };
})();
