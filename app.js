
const app = document.getElementById('app');
let subjects = [];
let state = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function save() {
  localStorage.setItem('revision-progress', JSON.stringify(state));
}

function load() {
  try {
    state = JSON.parse(localStorage.getItem('revision-progress')) || {};
  } catch {
    state = {};
  }
}

function normalizeAnswer(value) {
  if (value === true) return 'vrai';
  if (value === false) return 'faux';
  return String(value ?? '').trim().toLowerCase();
}

function key(s, q) {
  return s.subject + '|' + s.name + '|' + q.id;
}

// A question is playable if it has something to check against:
// - MCQ / TF: needs a real answer letter/bool
// - open questions: just need an explanation to reveal as "correction"
function hasContent(q) {
  if (q.type === 'tf') {
    return q.answer !== null && q.answer !== undefined && q.answer !== '';
  }
  if (q.type === 'mcq') {
    return !!(q.choices && q.choices.length) && q.answer !== null && q.answer !== undefined && q.answer !== '';
  }
  return !!(q.explanation && String(q.explanation).trim());
}

function home() {
  app.innerHTML = `
    <div class="top">
      <div class="brand">📚 Révisions Examens</div>
    </div>
    <main class="wrap">
      <section class="hero">
        <h1>Choisis ta matière</h1>
        <p class="muted">Correction immédiate, score et progression sauvegardés sur cet appareil.</p>
      </section>
      <div class="grid">
        ${['Java', 'Android', 'Flutter'].map(subject => {
          const list = subjects.filter(s => s.subject === subject);
          return `
            <div class="card">
              <h2>${subject}</h2>
              <p class="muted">${list.length} sujets · ${list.reduce((n, s) => n + s.question_count, 0)} questions</p>
              ${list.map((s, i) => `
                <button onclick="start(${subjects.indexOf(s)}, false)" style="margin-top:8px">Sujet ${i + 1} <span style="opacity:.65;font-weight:500">${s.source_origin === 'chatgpt' ? '· ChatGPT' : '· Claude'} (${s.question_count}q)</span></button>
              `).join('')}
              <button class="secondary" onclick="randomQuiz('${subject}')" style="margin-top:8px">🎲 30 questions aléatoires</button>
            </div>`;
        }).join('')}
      </div>
    </main>`;
}

function start(si, exam, custom = null) {
  const s = custom || subjects[si];
  let qs = [...s.questions].filter(hasContent);

  if (custom) qs = custom.questions;
  else if (qs.length > 30) qs = qs.slice(0, 30);

  state.current = {
    si,
    subject: s.subject,
    name: s.name,
    exam,
    questions: qs.map(q => q.id),
    answers: {},
    idx: 0,
    score: 0,
    checked: false
  };

  save();
  renderQuiz(s, qs);
}

function randomQuiz(subject) {
  const all = subjects
    .filter(s => s.subject === subject)
    .flatMap(s => s.questions
      .filter(hasContent)
      .map(q => ({ ...q, source: s.name })));

  all.sort(() => Math.random() - 0.5);
  const qs = all.slice(0, 30);

  start(-1, false, {
    subject,
    name: 'Aléatoire ' + subject,
    questions: qs,
    question_count: qs.length
  });
}

function currentSubject() {
  const c = state.current;
  if (c?.si >= 0 && subjects[c.si]) return subjects[c.si];
  return { subject: c?.subject || '', name: c?.name || '' };
}

function renderQuiz(s, qs) {
  const c = state.current;
  const q = qs[c.idx];
  const answer = c.answers[q.id];
  const checked = c.checked;
  const isTF = q.type === 'tf' || /\bvrai\s+ou\s+faux\b/i.test(q.question || '');
  const isOpen = q.type === 'open' && !isTF;
  const correct = normalizeAnswer(answer) === normalizeAnswer(q.answer);

  let answerUI = '';

  if (isTF) {
    const choices = [
      ['vrai', 'Vrai'],
      ['faux', 'Faux']
    ];

    answerUI = choices.map(([value, label]) => `
      <button
        class="choice ${normalizeAnswer(answer) === value ? 'selected' : ''} ${checked && value === normalizeAnswer(q.answer) ? 'correct' : ''} ${checked && value === normalizeAnswer(answer) && value !== normalizeAnswer(q.answer) ? 'wrong' : ''}"
        ${checked ? 'disabled' : ''}
        onclick="choose('${value}')">
        <b>${label}</b>
      </button>
    `).join('');
  } else if (!isOpen && q.choices?.length) {
    answerUI = q.choices.map(([k, text]) => `
      <button
        class="choice ${answer === k ? 'selected' : ''} ${checked && k === q.answer ? 'correct' : ''} ${checked && answer === k && answer !== q.answer ? 'wrong' : ''}"
        ${checked ? 'disabled' : ''}
        onclick="choose('${k}')">
        <b>${k.toUpperCase()}.</b> ${esc(text)}
      </button>
    `).join('');
  } else {
    answerUI = `<p class="muted">Question ouverte : réponds sur papier ou mentalement, puis affiche la correction.</p>`;
  }

  app.innerHTML = `
    <div class="top">
      <button class="secondary" onclick="home()">← Accueil</button>
      <div>${esc(s.subject)}</div>
    </div>
    <main class="wrap">
      <div class="quiz-head">
        <b>Question ${c.idx + 1} / ${qs.length}</b>
        <span class="muted">${c.score} bonne${c.score > 1 ? 's' : ''}</span>
      </div>
      <div class="progress"><div style="width:${((c.idx) / qs.length) * 100}%"></div></div>

      <div class="card">
        <h2 class="question">${esc(q.question)}</h2>

        ${answerUI}

        ${checked ? `
          <div class="feedback ${correct ? 'ok' : 'no'}">
            <b>${correct ? '✅ Bonne réponse' : '❌ Mauvaise réponse'}</b><br>
            Bonne réponse : <b>${esc(formatAnswer(q))}</b>
            <br><br>
            ${esc(q.explanation || 'Aucune explication fournie.')}
          </div>
        ` : ''}

        <div class="actions">
          ${!checked
            ? `<button class="primary" onclick="check()">${isOpen ? 'Voir la correction' : 'Valider'}</button>`
            : `<button class="primary" onclick="next()">${c.idx === qs.length - 1 ? 'Voir mon résultat' : 'Question suivante →'}</button>`}
        </div>
      </div>
    </main>`;
}

function formatAnswer(q) {
  if (q.type === 'tf') return normalizeAnswer(q.answer) === 'vrai' ? 'Vrai' : 'Faux';
  if (q.choices?.length) {
    const choice = q.choices.find(([k]) => k === q.answer);
    return choice ? `${String(q.answer).toUpperCase()}. ${choice[1]}` : String(q.answer).toUpperCase();
  }
  return q.answer || 'Voir l’explication';
}

function choose(value) {
  if (state.current.checked) return;
  const id = state.current.questions[state.current.idx];
  state.current.answers[id] = value;
  save();

  const qs = state.current.questions.map(findQ).filter(Boolean);
  renderQuiz(currentSubject(), qs);
}

function findQ(id) {
  for (const s of subjects) {
    const q = s.questions.find(x => x.id === id);
    if (q) return q;
  }
  return null;
}

function check() {
  const c = state.current;
  const q = findQ(c.questions[c.idx]);

  c.checked = true;
  if (normalizeAnswer(c.answers[q.id]) === normalizeAnswer(q.answer)) c.score++;

  save();
  renderQuiz(currentSubject(), c.questions.map(findQ).filter(Boolean));
}

function next() {
  const c = state.current;

  if (c.idx < c.questions.length - 1) {
    c.idx++;
    c.checked = false;
    save();
    renderQuiz(currentSubject(), c.questions.map(findQ).filter(Boolean));
  } else {
    result();
  }
}

function result() {
  const c = state.current;
  const total = c.questions.length;
  const pct = total ? Math.round(c.score / total * 100) : 0;

  app.innerHTML = `
    <div class="top"><div class="brand">📊 Résultat</div></div>
    <main class="wrap">
      <div class="card result">
        <div class="muted">${total} questions</div>
        <div class="score">${c.score}/${total}</div>
        <h2>${pct}%</h2>
        <div class="stats">
          <div class="stat"><b>${c.score}</b>Bonnes réponses</div>
          <div class="stat"><b>${total - c.score}</b>Erreurs</div>
          <div class="stat"><b>${pct}%</b>Réussite</div>
        </div>
        <button class="primary" onclick="retryErrors()">🔁 Refaire mes erreurs</button>
        <div style="height:10px"></div>
        <button class="secondary" onclick="home()">← Retour aux sujets</button>
      </div>
    </main>`;
}

function retryErrors() {
  const c = state.current;
  const qs = c.questions
    .map(findQ)
    .filter(q => q && normalizeAnswer(c.answers[q.id]) !== normalizeAnswer(q.answer));

  if (!qs.length) return home();

  start(-1, false, {
    subject: 'Révision des erreurs',
    name: 'Erreurs',
    questions: qs,
    question_count: qs.length
  });
}

fetch('questions.json')
  .then(r => r.json())
  .then(d => {
    subjects = d;
    load();
    home();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  })
  .catch(err => {
    app.innerHTML = `<main class="wrap"><div class="card"><h2>Impossible de charger les questions</h2><p class="muted">${esc(err.message)}</p></div></main>`;
  });
