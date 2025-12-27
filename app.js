/* =========================================================
   EduBotic • ESFM 2026 • Comprensión Lectora
   app.js (ROBUSTO: JSON array/objeto/temas + examen por tema)
   ========================================================= */

(() => {
  // -------- helpers
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const fmtTime = (sec) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const escapeHtml = (str) =>
    String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // -------- UI bindings (compatibles con tus index anteriores)
  const UI = {
    // screens
    screenStart: $("screenStart"),
    screenExam: $("screenExam"),
    screenResults: $("screenResults"),

    // start controls
    topicSelect: $("topicSelect"), // (si existe)
    topicCount: $("topicCount"),   // (si existe)
    bankCount: $("bankCount"),     // (si existe)
    timeLimit: $("timeLimit"),
    qCount: $("qCount"),
    shuffleOptions: $("shuffleOptions"),
    showExplanation: $("showExplanation"),
    lockOnAnswer: $("lockOnAnswer"),
    btnStart: $("btnStart"),
    btnHow: $("btnHow"),
    btnRead: $("btnRead"),         // (si existe)

    // exam
    qIndex: $("qIndex"),
    qTotal: $("qTotal"),
    timeLeft: $("timeLeft"),
    progressBar: $("progressBar"),
    qMeta: $("qMeta"),
    qText: $("qText"),
    optionsBox: $("optionsBox"),
    explainBox: $("explainBox"),
    qExplain: $("qExplain"),

    btnPrev: $("btnPrev"),
    btnNext: $("btnNext"),
    btnFinish: $("btnFinish"),

    navGrid: $("navGrid"),
    answeredCount: $("answeredCount"),
    navTotal: $("navTotal"),
    btnClear: $("btnClear"),
    btnSave: $("btnSave"),

    // results
    score: $("score"),
    scoreTotal: $("scoreTotal"),
    percent: $("percent"),
    timeUsed: $("timeUsed"),
    reviewList: $("reviewList"),
    btnRetry: $("btnRetry"),
    btnBackHome: $("btnBackHome"),

    // optional: modal lectura
    readModal: $("readModal"),
    readModalTitle: $("readModalTitle"),
    readModalBody: $("readModalBody"),
    btnStartAfterRead: $("btnStartAfterRead"),
  };

  // -------- state
  let BANK = [];     // [{topic, reading, question, options[], answerIndex, explanation, id}]
  let TOPICS = [];   // [{key,name,reading,items[]}]
  let EXAM = [];
  let answers = [];     // real option index (del arreglo original)
  let optionMaps = [];  // mapeo visualIndex -> realIndex
  let current = 0;

  let timer = null;
  let totalSeconds = 0;
  let remainingSeconds = 0;
  let startedAt = 0;

  // -------- modals/toast (si existen)
  let howModal = null;
  let lecturaModal = null;

  function initBootstrapHelpers() {
    try {
      const m = $("howModal");
      if (m && window.bootstrap) howModal = new bootstrap.Modal(m);
    } catch {}

    try {
      if (UI.readModal && window.bootstrap) lecturaModal = new bootstrap.Modal(UI.readModal);
    } catch {}
  }

  function toast(msg) {
    // si tienes toast en tu HTML, úsalo; sino console
    const tEl = $("appToast");
    const msgEl = $("toastMsg");
    if (!tEl || !msgEl || !window.bootstrap) {
      console.log(msg);
      return;
    }
    msgEl.textContent = msg;
    try {
      new bootstrap.Toast(tEl).show();
    } catch {
      console.log(msg);
    }
  }

  // =========================================================
  // 1) CARGA DEL BANCO (ACEPTA MUCHOS FORMATOS)
  // =========================================================
  async function loadBank() {
    try {
      const res = await fetch(`questions.json?ts=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} al cargar questions.json`);

      let txt = await res.text();
      txt = txt.replace(/^\uFEFF/, ""); // quita BOM
      const data = JSON.parse(txt);

      const arr = extractQuestionsArray(data);
      if (!Array.isArray(arr)) {
        throw new Error("questions.json no tiene una lista de preguntas reconocible.");
      }

      BANK = arr
        .map(normalizeQuestion)
        .filter(q => q.question && Array.isArray(q.options) && q.options.length >= 2);

      if (!BANK.length) throw new Error("Banco vacío o sin preguntas válidas.");

      buildTopics();
      paintTopicSelect();

      // contadores
      if (UI.bankCount) UI.bankCount.textContent = BANK.length;

      // (compatibilidad con tu index anterior que mostraba en un span cualquiera)
      const bc = $("bankCount");
      if (bc) bc.textContent = BANK.length;

    } catch (err) {
      console.error(err);
      alert(
        "Error cargando el banco.\n\n" +
        "Verifica que estás usando Live Server y que questions.json esté bien.\n\n" +
        "Detalle: " + err.message
      );
    }
  }

  // Extrae una lista de preguntas desde múltiples esquemas
  function extractQuestionsArray(data) {
    // A) ya es arreglo
    if (Array.isArray(data)) return data;

    // B) es objeto con propiedades típicas
    if (data && typeof data === "object") {
      if (Array.isArray(data.questions)) return data.questions;
      if (Array.isArray(data.preguntas)) return data.preguntas;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.bank)) return data.bank;

      // C) viene por temas: {temas:[{tema,lectura,preguntas:[...]}]}
      if (Array.isArray(data.temas)) {
        const flat = [];
        data.temas.forEach(t => {
          const tema = t.tema ?? t.topic ?? t.nombre ?? "Sin tema";
          const lectura = t.lectura ?? t.reading ?? t.texto ?? "";
          const preguntas = t.preguntas ?? t.questions ?? t.items ?? t.bank ?? [];
          if (Array.isArray(preguntas)) {
            preguntas.forEach(q => flat.push({ tema, lectura, ...q }));
          }
        });
        return flat;
      }
    }

    return null;
  }

  // Normaliza nombres de campos (para no depender de un solo JSON)
  function normalizeQuestion(raw) {
    const topic = raw.tema ?? raw.topic ?? raw.Tema ?? raw.TEMA ?? "Sin tema";
    const reading = raw.lectura ?? raw.reading ?? raw.texto ?? raw.Texto ?? "";

    const question = raw.pregunta ?? raw.question ?? raw.Pregunta ?? raw.item ?? raw.enunciado ?? "";
    const options = raw.opciones ?? raw.options ?? raw.alternativas ?? raw.Alternativas ?? raw.respuestas ?? [];
    const answerIndex =
      raw.respuesta ?? raw.answerIndex ?? raw.correctIndex ?? raw.correct ?? raw.correct_answer ?? 0;

    const explanation = raw.sustento ?? raw.explanation ?? raw.justificacion ?? raw.Sustento ?? "";

    return {
      id: raw.id ?? raw.ID ?? null,
      topic: String(topic).trim(),
      reading: String(reading ?? "").trim(),
      question: String(question).trim(),
      options: Array.isArray(options) ? options.map(x => String(x).trim()) : [],
      answerIndex: Number.isFinite(+answerIndex) ? +answerIndex : 0,
      explanation: String(explanation ?? "").trim(),
    };
  }

  // =========================================================
  // 2) TEMAS + LECTURAS
  // =========================================================
  function buildTopics() {
    const map = new Map();
    for (const q of BANK) {
      const key = q.topic || "Sin tema";
      if (!map.has(key)) map.set(key, { key, name: key, reading: "", items: [] });
      const t = map.get(key);
      if (!t.reading && q.reading) t.reading = q.reading;
      t.items.push(q);
    }
    TOPICS = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  function paintTopicSelect() {
    if (!UI.topicSelect) return;

    UI.topicSelect.innerHTML = `<option value="" selected disabled>Selecciona un tema...</option>`;
    TOPICS.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = `${t.name} (${t.items.length})`;
      UI.topicSelect.appendChild(opt);
    });

    UI.topicSelect.addEventListener("change", () => {
      const t = getSelectedTopic();
      if (UI.topicCount) UI.topicCount.textContent = t ? t.items.length : 0;
    });

    // set counts init
    if (UI.topicCount) UI.topicCount.textContent = 0;
  }

  function getSelectedTopic() {
    if (!UI.topicSelect) return null;
    const key = UI.topicSelect.value;
    return TOPICS.find(t => t.key === key) || null;
  }

  // =========================================================
  // 3) INICIAR: LECTURA -> EXAMEN
  // =========================================================
  function startFlow() {
    // si hay selector de tema, obligar elegir
    if (UI.topicSelect) {
      const t = getSelectedTopic();
      if (!t) return toast("Selecciona un tema primero.");

      // mostrar lectura si hay modal (mejor UX)
      if (lecturaModal && UI.readModalTitle && UI.readModalBody && UI.btnStartAfterRead) {
        UI.readModalTitle.textContent = t.name;
        UI.readModalBody.innerHTML = `<div style="white-space:pre-line">${escapeHtml(t.reading || "Lectura no encontrada.")}</div>`;
        UI.btnStartAfterRead.onclick = () => {
          lecturaModal.hide();
          startExam();
        };
        lecturaModal.show();
        return;
      }

      // si no hay modal, mostrar alert simple
      const lectura = t.reading || "Lectura no encontrada en el banco.";
      alert(`LECTURA DEL TEMA:\n\n${t.name}\n\n${lectura}`);
      // y empezar
      startExam();
      return;
    }

    // sin selector -> empieza directo
    startExam();
  }

  function startExam() {
    // pool por tema
    let pool = BANK;
    if (UI.topicSelect) {
      const t = getSelectedTopic();
      pool = t ? t.items : [];
    }

    if (!pool.length) return toast("No hay preguntas para este tema.");

    const minutes = clamp(parseInt(UI.timeLimit?.value || "30", 10), 1, 180);
    const requested = clamp(parseInt(UI.qCount?.value || "30", 10), 1, 3000);
    const count = Math.min(requested, pool.length);

    EXAM = shuffle([...pool]).slice(0, count);
    answers = Array(count).fill(null);
    optionMaps = Array(count).fill(null);
    current = 0;

    totalSeconds = minutes * 60;
    remainingSeconds = totalSeconds;
    startedAt = Date.now();

    showScreen("exam");
    buildNav();
    startTimer();
    paintQuestion();
  }

  function showScreen(which) {
    if (UI.screenStart) UI.screenStart.classList.add("d-none");
    if (UI.screenExam) UI.screenExam.classList.add("d-none");
    if (UI.screenResults) UI.screenResults.classList.add("d-none");

    if (which === "start" && UI.screenStart) UI.screenStart.classList.remove("d-none");
    if (which === "exam" && UI.screenExam) UI.screenExam.classList.remove("d-none");
    if (which === "results" && UI.screenResults) UI.screenResults.classList.remove("d-none");
  }

  // =========================================================
  // 4) TIMER
  // =========================================================
  function startTimer() {
    stopTimer();
    paintTimer();
    timer = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        remainingSeconds = 0;
        paintTimer();
        finishExam();
      } else {
        paintTimer();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function paintTimer() {
    if (!UI.timeLeft) return;
    UI.timeLeft.innerHTML = `<i class="bi bi-clock"></i> ${fmtTime(remainingSeconds)}`;
  }

  // =========================================================
  // 5) PINTAR PREGUNTAS + OPCIONES
  // =========================================================
  function paintQuestion() {
    const q = EXAM[current];
    if (!q) return;

    if (UI.qIndex) UI.qIndex.textContent = current + 1;
    if (UI.qTotal) UI.qTotal.textContent = EXAM.length;
    if (UI.navTotal) UI.navTotal.textContent = EXAM.length;

    if (UI.qMeta) UI.qMeta.textContent = q.id ? `ID #${q.id}` : `Tema: ${q.topic}`;
    if (UI.qText) UI.qText.textContent = q.question;

    if (UI.progressBar) {
      UI.progressBar.style.width = `${((current + 1) / EXAM.length) * 100}%`;
    }

    // opciones (con mezcla)
    let opts = q.options.map((text, idx) => ({ text, idx }));
    if (UI.shuffleOptions?.checked) opts = shuffle(opts);

    optionMaps[current] = opts.map(o => o.idx);

    if (UI.optionsBox) {
      UI.optionsBox.innerHTML = "";
      opts.forEach((o, visualIndex) => {
        const letter = String.fromCharCode(65 + visualIndex);

        const div = document.createElement("div");
        div.className = "option d-flex align-items-start gap-2";
        div.innerHTML = `
          <span class="badge">${letter}</span>
          <div class="flex-grow-1">${escapeHtml(o.text)}</div>
        `;

        // marcar guardada
        const saved = answers[current];
        const realIndex = optionMaps[current][visualIndex];
        if (saved !== null && realIndex === saved) div.classList.add("selected");

        div.addEventListener("click", () => pickAnswer(visualIndex));
        UI.optionsBox.appendChild(div);
      });
    }

    // explicación (oculta hasta que corresponda)
    if (UI.explainBox) UI.explainBox.classList.add("d-none");
    if (UI.qExplain) UI.qExplain.textContent = q.explanation || "—";

    updateNavUI();
    updateNavButtons();
  }

  function pickAnswer(visualIndex) {
    const q = EXAM[current];
    if (!q) return;

    const realIndex = optionMaps[current][visualIndex];
    answers[current] = realIndex;

    // marcar UI
    if (UI.optionsBox) {
      const all = [...UI.optionsBox.querySelectorAll(".option")];
      all.forEach(x => x.classList.remove("selected"));
      if (all[visualIndex]) all[visualIndex].classList.add("selected");

      // bloquear si está activado
      if (UI.lockOnAnswer?.checked) {
        all.forEach(o => {
          o.style.pointerEvents = "none";
          o.style.opacity = "0.95";
        });
      }
    }

    // mostrar sustento si está activado
    if (UI.showExplanation?.checked && UI.explainBox) {
      UI.explainBox.classList.remove("d-none");
    }

    updateNavUI();
  }

  function updateNavButtons() {
    if (UI.btnPrev) UI.btnPrev.disabled = current === 0;
    if (UI.btnNext) UI.btnNext.disabled = current === EXAM.length - 1;
  }

  // =========================================================
  // 6) NAV
  // =========================================================
  function buildNav() {
    if (!UI.navGrid) return;
    UI.navGrid.innerHTML = "";

    for (let i = 0; i < EXAM.length; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nav-question";
      b.textContent = i + 1;

      b.addEventListener("click", () => {
        current = i;
        paintQuestion();
      });

      UI.navGrid.appendChild(b);
    }

    updateNavUI();
  }

  function updateNavUI() {
    if (!UI.navGrid) return;

    const btns = UI.navGrid.querySelectorAll(".nav-question");
    let answered = 0;

    btns.forEach((b, i) => {
      b.classList.remove("active", "answered");
      if (i === current) b.classList.add("active");
      if (answers[i] !== null) {
        b.classList.add("answered");
        answered++;
      }
    });

    if (UI.answeredCount) UI.answeredCount.textContent = answered;
    if (UI.navTotal) UI.navTotal.textContent = EXAM.length;
  }

  // =========================================================
  // 7) FINALIZAR + RESULTADOS
  // =========================================================
  function finishExam() {
    stopTimer();

    const total = EXAM.length;
    let score = 0;

    for (let i = 0; i < total; i++) {
      const q = EXAM[i];
      if (answers[i] !== null && answers[i] === q.answerIndex) score++;
    }

    const percent = total ? Math.round((score / total) * 100) : 0;
    const used = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

    showScreen("results");

    if (UI.score) UI.score.textContent = score;
    if (UI.scoreTotal) UI.scoreTotal.textContent = total;
    if (UI.percent) UI.percent.textContent = percent;
    if (UI.timeUsed) UI.timeUsed.textContent = fmtTime(used);

    paintReview();
  }

  function paintReview() {
    if (!UI.reviewList) return;
    UI.reviewList.innerHTML = "";

    EXAM.forEach((q, i) => {
      const picked = answers[i];
      const correct = q.answerIndex;

      const pickedText = picked === null ? "No respondida" : (q.options[picked] || "—");
      const correctText = q.options[correct] || "—";
      const ok = picked !== null && picked === correct;

      const card = document.createElement("div");
      card.className = "card-inner p-3";

      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div class="small-muted mb-1"><strong>Pregunta ${i + 1}</strong> · ${escapeHtml(q.topic)}</div>
            <div class="text-strong mb-2">${escapeHtml(q.question)}</div>

            <div class="small-muted">Tu respuesta:</div>
            <div class="${ok ? "text-success" : "text-danger"} fw-bold mb-2">${escapeHtml(pickedText)}</div>

            <div class="small-muted">Correcta:</div>
            <div class="fw-bold mb-2">${escapeHtml(correctText)}</div>

            <div class="small-muted"><strong>Sustento</strong></div>
            <div style="white-space:pre-line">${escapeHtml(q.explanation || "—")}</div>
          </div>
          <div class="badge-soft">${ok ? "✔" : "✖"}</div>
        </div>
      `;

      UI.reviewList.appendChild(card);
    });
  }

  function goHome() {
    stopTimer();
    EXAM = [];
    answers = [];
    optionMaps = [];
    current = 0;
    showScreen("start");
  }

  // =========================================================
  // 8) GUARDAR/ LIMPIAR
  // =========================================================
  function clearCurrentAnswer() {
    if (!EXAM.length) return;
    answers[current] = null;
    paintQuestion();
    toast("Respuesta limpiada.");
  }

  function saveAttempt() {
    if (!EXAM.length) return toast("No hay intento activo.");

    const payload = {
      createdAt: new Date().toISOString(),
      total: EXAM.length,
      answers,
      questions: EXAM.map(q => ({
        topic: q.topic,
        reading: q.reading,
        question: q.question,
        options: q.options,
        correctIndex: q.answerIndex,
        explanation: q.explanation
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `respuestas_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    toast("Respuestas guardadas.");
  }

  // =========================================================
  // 9) LECTURA (botón Ver lectura)
  // =========================================================
  function showReadingOnly() {
    if (!UI.topicSelect) return toast("No hay selector de tema en tu index.");
    const t = getSelectedTopic();
    if (!t) return toast("Selecciona un tema.");

    if (lecturaModal && UI.readModalTitle && UI.readModalBody) {
      UI.readModalTitle.textContent = t.name;
      UI.readModalBody.innerHTML = `<div style="white-space:pre-line">${escapeHtml(t.reading || "Lectura no encontrada.")}</div>`;
      // Si existe botón dentro del modal para iniciar:
      if (UI.btnStartAfterRead) {
        UI.btnStartAfterRead.onclick = () => {
          lecturaModal.hide();
          startExam();
        };
      }
      lecturaModal.show();
      return;
    }

    alert(`LECTURA DEL TEMA:\n\n${t.name}\n\n${t.reading || "Lectura no encontrada."}`);
  }

  // =========================================================
  // 10) EVENTS
  // =========================================================
  function wireEvents() {
    if (UI.btnStart) UI.btnStart.addEventListener("click", startFlow);

    if (UI.btnHow && howModal) UI.btnHow.addEventListener("click", () => howModal.show());

    if (UI.btnPrev) UI.btnPrev.addEventListener("click", () => {
      if (current > 0) { current--; paintQuestion(); }
    });

    if (UI.btnNext) UI.btnNext.addEventListener("click", () => {
      if (current < EXAM.length - 1) { current++; paintQuestion(); }
    });

    if (UI.btnFinish) UI.btnFinish.addEventListener("click", finishExam);

    if (UI.btnClear) UI.btnClear.addEventListener("click", clearCurrentAnswer);

    if (UI.btnSave) UI.btnSave.addEventListener("click", saveAttempt);

    if (UI.btnRetry) UI.btnRetry.addEventListener("click", () => {
      goHome();
      startFlow();
    });

    if (UI.btnBackHome) UI.btnBackHome.addEventListener("click", goHome);

    if (UI.btnRead) UI.btnRead.addEventListener("click", showReadingOnly);
  }

  // =========================================================
  // INIT
  // =========================================================
  document.addEventListener("DOMContentLoaded", async () => {
    initBootstrapHelpers();
    wireEvents();
    await loadBank();
  });

})();
