const els = {
  roundSelect: document.getElementById('roundSelect'),
  countSelect: document.getElementById('countSelect'),
  timerSelect: document.getElementById('timerSelect'),
  startBtn: document.getElementById('startBtn'),
  sayBtn: document.getElementById('sayBtn'),
  repeatBtn: document.getElementById('repeatBtn'),
  hintBtn: document.getElementById('hintBtn'),
  answer: document.getElementById('answer'),
  submitBtn: document.getElementById('submitBtn'),
  nextBtn: document.getElementById('nextBtn'),
  endBtn: document.getElementById('endBtn'),
  status: document.getElementById('status'),
  feedback: document.getElementById('feedback'),
  correct: document.getElementById('correct'),
  wrong: document.getElementById('wrong'),
  progress: document.getElementById('progress'),
  strictToggle: document.getElementById('strictToggle'),
  history: document.getElementById('history'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
};

let data = null;
let session = null;
let ttsVoice = null;
let timerId = null;

function qs(name){ return document.querySelector(`input[name="${name}"]:checked`).value; }

function normalise(s, strict){
  const x = String(s ?? '').trim();
  if (strict) return x;
  return x.replace(/[-\s]+/g,'').toLowerCase();
}

function pickVoice(){
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  const preferred = voices.find(v => /en-GB/i.test(v.lang));
  return preferred || voices.find(v => /^en/i.test(v.lang)) || voices[0];
}

function speak(text){
  if (!window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1.0;
  u.lang = ttsVoice?.lang || 'en-GB';
  if (ttsVoice) u.voice = ttsVoice;
  speechSynthesis.speak(u);
  return true;
}

function setFeedback(html){ els.feedback.innerHTML = html; }

function setControls(enabled){
  els.sayBtn.disabled = !enabled;
  els.repeatBtn.disabled = !enabled;
  els.hintBtn.disabled = !enabled;
  els.answer.disabled = !enabled;
  els.submitBtn.disabled = !enabled;
  els.nextBtn.disabled = true;
  els.endBtn.disabled = !enabled;
}

function updateScore(){
  els.correct.textContent = session.correct;
  els.wrong.textContent = session.wrong;
  els.progress.textContent = `${session.index}/${session.items.length}`;
}

function saveHistory(entry){
  const key = 'bolalat_spell_history_v1';
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  arr.unshift(entry);
  localStorage.setItem(key, JSON.stringify(arr.slice(0, 200)));
  renderHistory();
}

function renderHistory(){
  const key = 'bolalat_spell_history_v1';
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  if (!arr.length){
    els.history.innerHTML = '<div class="small">No history saved on this device yet.</div>';
    return;
  }
  els.history.innerHTML = arr.map(x => {
    const left = `${x.mode} | ${x.round} | ${x.score.correct}/${x.score.total}`;
    const right = new Date(x.endedAt).toLocaleString('en-GB');
    return `<div class="item"><div>${left}</div><div class="small">${right}</div></div>`;
  }).join('');
}

function clearHistory(){
  localStorage.removeItem('bolalat_spell_history_v1');
  renderHistory();
}

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startSession(){
  const mode = qs('mode');
  const round = els.roundSelect.value;
  const words = (data.rounds[round] || []).slice();
  const count = parseInt(els.countSelect.value, 10);
  const perWord = parseInt(els.timerSelect.value, 10);

  if (!words.length){
    els.status.textContent = 'No words found for this round.';
    return;
  }

  shuffle(words);
  const items = words.slice(0, Math.min(count, words.length)).map(w => ({
    word: w,
    attempts: 0,
    correct: null,
  }));

  session = {
    mode,
    round,
    perWord,
    items,
    index: 0,
    correct: 0,
    wrong: 0,
    startedAt: Date.now(),
    current: null,
  };

  els.status.textContent = `Ready. Round: ${round}. Mode: ${mode}.`;
  setFeedback('');
  setControls(true);
  els.startBtn.disabled = true;

  nextItem(true);
}

function endSession(){
  if (!session) return;

  stopTimer();

  const total = session.items.length;
  const entry = {
    mode: session.mode,
    round: session.round,
    score: { correct: session.correct, total },
    endedAt: Date.now(),
  };
  saveHistory(entry);

  els.status.textContent = `Session ended. Score: ${session.correct}/${total}.`;
  setFeedback('');
  setControls(false);
  els.startBtn.disabled = false;
  els.answer.value = '';
  session = null;
}

function startTimer(){
  stopTimer();
  if (!session || session.mode !== 'test') return;
  if (!session.perWord) return;

  let left = session.perWord;
  els.status.textContent = `Time left: ${left}s | Round: ${session.round} | Q ${session.index}/${session.items.length}`;
  timerId = setInterval(() => {
    left -= 1;
    if (left <= 0){
      stopTimer();
      markWrong('Time up.');
      return;
    }
    els.status.textContent = `Time left: ${left}s | Round: ${session.round} | Q ${session.index}/${session.items.length}`;
  }, 1000);
}

function stopTimer(){
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function nextItem(first){
  if (!session) return;

  stopTimer();
  els.answer.value = '';
  setFeedback('');

  if (!first && session.index >= session.items.length){
    endSession();
    return;
  }

  session.index += 1;
  if (session.index > session.items.length){
    endSession();
    return;
  }

  session.current = session.items[session.index - 1];
  updateScore();

  const intro = session.mode === 'practice' ? 'New word loaded.' : 'New test word loaded.';
  els.status.textContent = `${intro} Round: ${session.round} | Q ${session.index}/${session.items.length}`;
  els.nextBtn.disabled = true;

  speakCurrent();
  startTimer();
}

function speakCurrent(){
  if (!session?.current) return;
  speak(session.current.word);
}

function hintFor(word){
  const w = String(word);
  const len = w.length;
  const first = w[0];
  const last = w[len - 1];
  const vowels = (w.match(/[aeiou]/gi) || []).length;
  return `Starts with: ${first}. Ends with: ${last}. Letters: ${len}. Vowels: ${vowels}.`;
}

function markCorrect(){
  stopTimer();
  session.current.correct = true;
  session.correct += 1;
  updateScore();
  setFeedback(`<div class="good">Correct.</div><div class="small">${session.current.word}</div>`);
  els.nextBtn.disabled = false;
}

function markWrong(reason){
  stopTimer();
  session.current.correct = false;
  session.wrong += 1;
  updateScore();
  const r = reason ? `<div class="small">${reason}</div>` : '';
  setFeedback(`<div class="bad">Wrong.</div>${r}<div class="small">Correct spelling: ${session.current.word}</div>`);
  els.nextBtn.disabled = false;
}

function submit(){
  if (!session?.current) return;
  const strict = els.strictToggle.checked;

  session.current.attempts += 1;
  const typed = els.answer.value;

  const ok = normalise(typed, strict) === normalise(session.current.word, strict);

  if (ok){
    markCorrect();
    return;
  }

  if (session.mode === 'practice' && session.current.attempts === 1){
    setFeedback(`<div class="bad">Not correct.</div><div class="small">Try once more. Use Repeat or Hint.</div>`);
    return;
  }

  markWrong('');
}

async function init(){
  renderHistory();

  els.status.textContent = 'Loading word list...';
  const res = await fetch('words.json', { cache: 'no-store' });
  data = await res.json();

  els.roundSelect.innerHTML = Object.keys(data.rounds)
    .map(r => `<option value="${r}">${r}</option>`)
    .join('');

  els.status.textContent = 'Select a mode and round, then press Start.';
  els.startBtn.disabled = false;

  if (window.speechSynthesis){
    ttsVoice = pickVoice();
    speechSynthesis.onvoiceschanged = () => { ttsVoice = pickVoice(); };
  }
}

els.startBtn.addEventListener('click', startSession);
els.sayBtn.addEventListener('click', speakCurrent);
els.repeatBtn.addEventListener('click', speakCurrent);
els.hintBtn.addEventListener('click', () => {
  if (!session?.current) return;
  setFeedback(`<div class="small">${hintFor(session.current.word)}</div>`);
});
els.submitBtn.addEventListener('click', submit);
els.answer.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
els.nextBtn.addEventListener('click', () => nextItem(false));
els.endBtn.addEventListener('click', endSession);
els.clearHistoryBtn.addEventListener('click', clearHistory);

window.addEventListener('load', init);
