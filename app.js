// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const S = {
  worker: null,
  workerReady: false,
  stream: null,
  camOn: false,
  facing: 'environment',
  processing: false,
  autoOn: false,
  autoTimer: null,
  autoSeconds: 4,
  countdown: 0,
  countdownTimer: null,
  results: [],
  fileMode: false,
  cfg: {
    autoRead: true,
    autoTranslate: true,
    autoPin: false,
    speed: 0.85,
    voicePersona: 'female'
  }
};

// ═══════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════
const video = document.getElementById('video');
const camOff = document.getElementById('camOff');
const camOverlay = document.getElementById('camOverlay');
const scanFrame = document.getElementById('scanFrame');
const scanLine = document.getElementById('scanLine');
const autoBadge = document.getElementById('autoBadge');
const autoCountdown = document.getElementById('autoCountdown');
const camLabel = document.getElementById('camLabel');
const btnCam = document.getElementById('btnCam');
const btnCamIcon = document.getElementById('btnCamIcon');
const btnCamText = document.getElementById('btnCamText');
const btnCapture = document.getElementById('btnCapture');
const btnAuto = document.getElementById('btnAuto');
const btnAutoText = document.getElementById('btnAutoText');
const ocrCanvas = document.getElementById('ocrCanvas');
const results = document.getElementById('results');
const emptyState = document.getElementById('emptyState');
const fileInput = document.getElementById('fileInput');

// ═══════════════════════════════════════════════════════════
// TESSERACT OCR INIT
// ═══════════════════════════════════════════════════════════
(async () => {
  try {
    S.worker = await Tesseract.createWorker('eng', 1, {
      logger: m => { }
    });
    await S.worker.setParameters({ tessedit_pageseg_mode: '6' });
    S.workerReady = true;
    showToast('✅ OCR sẵn sàng');
  } catch (e) {
    console.error(e);
    showToast('❌ Không tải được OCR', 'err');
  }
})();

// TTS voices init
if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = () => { };
}

// ═══════════════════════════════════════════════════════════
// HTTPS CHECK
// ═══════════════════════════════════════════════════════════
function isSecureContext_() {
  return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

// ═══════════════════════════════════════════════════════════
// CAMERA CONTROLS
// ═══════════════════════════════════════════════════════════
async function toggleCam() {
  if (S.camOn) {
    stopCam();
  } else {
    // Check secure context
    if (!isSecureContext_() && !S.fileMode) {
      document.getElementById('httpsNotice').classList.remove('hidden');
      return;
    }
    await startCam();
  }
}

async function startCam() {
  try {
    const constraints = {
      video: {
        facingMode: S.facing,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    S.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = S.stream;
    video.style.display = 'block';
    camOff.style.display = 'none';
    camOverlay.style.display = 'flex';
    btnCam.classList.add('on');
    btnCamIcon.textContent = '⏹';
    btnCamText.textContent = 'Tắt camera';
    btnCapture.disabled = false;
    btnAuto.disabled = false;
    S.camOn = true;
    document.getElementById('httpsNotice').classList.add('hidden');
  } catch (err) {
    console.error(err);
    if (err.name === 'NotAllowedError') {
      showToast('⛔ Bị từ chối quyền camera. Vào Cài đặt trình duyệt để cấp quyền.', 'err');
    } else if (err.name === 'NotFoundError') {
      showToast('📵 Không tìm thấy camera trên thiết bị này', 'err');
    } else if (err.name === 'NotSupportedError' || !isSecureContext_()) {
      document.getElementById('httpsNotice').classList.remove('hidden');
    } else {
      showToast('❌ Lỗi camera: ' + err.message, 'err');
    }
  }
}

function stopCam() {
  if (S.stream) {
    S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
  }
  video.style.display = 'none';
  camOff.style.display = 'flex';
  camOverlay.style.display = 'none';
  btnCam.classList.remove('on');
  btnCamIcon.textContent = '📷';
  btnCamText.textContent = 'Bật camera';
  btnCapture.disabled = true;
  btnAuto.disabled = true;
  S.camOn = false;
  if (S.autoOn) stopAuto();
}

async function flipCam() {
  S.facing = S.facing === 'environment' ? 'user' : 'environment';
  if (S.camOn) {
    stopCam();
    await startCam();
  }
  showToast(S.facing === 'environment' ? '📷 Camera sau' : '🤳 Camera trước');
}

// ═══════════════════════════════════════════════════════════
// AUTO-SCAN
// ═══════════════════════════════════════════════════════════
function toggleAuto() {
  if (S.autoOn) stopAuto(); else startAuto();
}

function startAuto() {
  S.autoOn = true;
  btnAuto.classList.add('on');
  btnAutoText.textContent = 'Dừng tự động';
  autoBadge.classList.add('show');
  scanFrame.classList.add('scanning');
  scanLine.classList.add('scanning');
  if (camLabel) camLabel.textContent = 'Chế độ quét tự động đang bật';

  // Start countdown
  S.countdown = S.autoSeconds;
  updateCountdown();
  S.countdownTimer = setInterval(() => {
    S.countdown--;
    if (S.countdown <= 0) {
      S.countdown = S.autoSeconds;
      captureNow();
    }
    updateCountdown();
  }, 1000);
}

function stopAuto() {
  S.autoOn = false;
  btnAuto.classList.remove('on');
  btnAutoText.textContent = 'Tự động';
  autoBadge.classList.remove('show');
  scanFrame.classList.remove('scanning');
  scanLine.classList.remove('scanning');
  if (camLabel) camLabel.textContent = 'Trỏ camera vào chữ cần quét';
  clearInterval(S.countdownTimer);
  S.countdownTimer = null;
}

function updateCountdown() {
  autoCountdown.textContent = `Quét sau ${S.countdown}s`;
}

// ═══════════════════════════════════════════════════════════
// CAPTURE & OCR
// ═══════════════════════════════════════════════════════════
// Switch frame size mode (word vs sentence)
function setFrameMode(mode, silent = false) {
  const isWord = mode === 'word';
  const sf = document.getElementById('scanFrame');
  const hint = document.getElementById('frameHint');
  sf.classList.toggle('word-mode', isWord);
  document.getElementById('fModeWord').classList.toggle('active', isWord);
  document.getElementById('fModeSentence').classList.toggle('active', !isWord);
  if (hint) hint.textContent = isWord ? '🎯 1 TỪ / 1 DÒNG' : '🎯 CHỈ QUÉT CHỮ TRONG Ô NÀY';
  if (!silent) showToast(isWord ? '🔤 Ô quét 1 từ (nhỏ gọn)' : '📝 Ô quét cả câu (tiêu chuẩn)');
}

async function captureNow() {
  if (S.processing) return;
  if (!S.workerReady) { showToast('⏳ OCR chưa sẵn sàng', 'err'); return; }
  if (!S.camOn && !S.fileMode) return;

  S.processing = true;
  btnCapture.disabled = true;
  btnCapture.classList.add('spinning');
  btnCapture.textContent = '';
  scanFrame.classList.add('flash');
  setTimeout(() => scanFrame.classList.remove('flash'), 350);
  showStatusCard('Đang quét chữ trong ô xanh...');

  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) {
      showToast('⏳ Camera chưa sẵn sàng, thử lại', 'err');
      return;
    }

    // ── CHỈ CẮT VÙNG TRONG KHUNG XANH (SCAN FRAME) ─────────────
    const videoRect = video.getBoundingClientRect();
    const frameRect = scanFrame.getBoundingClientRect();

    const cw = videoRect.width || video.clientWidth;
    const ch = videoRect.height || video.clientHeight;

    // Tỷ lệ scale khi dùng object-fit: cover
    const scale = Math.max(cw / vw, ch / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;

    // Độ lệch do căn giữa video (object-position: center)
    const renderX = (cw - renderedW) / 2;
    const renderY = (ch - renderedH) / 2;

    // Vị trí khung xanh tính theo thẻ video
    const frameX = frameRect.left - videoRect.left;
    const frameY = frameRect.top - videoRect.top;
    const frameW = frameRect.width;
    const frameH = frameRect.height;

    // Tọa độ tương ứng trên khung hình camera gốc
    const cropX = (frameX - renderX) / scale;
    const cropY = (frameY - renderY) / scale;
    const cropW = frameW / scale;
    const cropH = frameH / scale;

    // Giới hạn trong kích thước thật của video
    const finalX = Math.max(0, Math.min(vw - 1, Math.round(cropX)));
    const finalY = Math.max(0, Math.min(vh - 1, Math.round(cropY)));
    const finalW = Math.max(20, Math.min(Math.round(cropW), vw - finalX));
    const finalH = Math.max(20, Math.min(Math.round(cropH), vh - finalY));

    // Phóng to ảnh crop nếu kích thước nhỏ để Tesseract đọc nét nhất
    const zoom = Math.max(1, Math.min(2.5, 900 / finalW));
    ocrCanvas.width = Math.round(finalW * zoom);
    ocrCanvas.height = Math.round(finalH * zoom);
    const ctx = ocrCanvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, finalX, finalY, finalW, finalH, 0, 0, ocrCanvas.width, ocrCanvas.height);

    // Lưu ảnh thumbnail của đúng vùng trong ô xanh
    let thumbUrl = '';
    try {
      thumbUrl = ocrCanvas.toDataURL('image/jpeg', 0.7);
    } catch (_) { }

    // ── Preprocess (tăng tương phản cho chữ trong ô) ───────────
    preprocess(ctx, ocrCanvas.width, ocrCanvas.height);

    // PSM 6 = Assume a single uniform block of text (chuẩn nhất cho ô chữ crop)
    await S.worker.setParameters({ tessedit_pageseg_mode: '6' });

    // ── OCR ─────────────────────────────────────────────────
    const { data } = await S.worker.recognize(ocrCanvas);
    const rawText = data.text.trim();
    const confidence = Math.round(data.confidence);

    // ── Validate ────────────────────────────────────────────
    const text = clean(rawText);
    const letters = (text.match(/[a-zA-Z]/g) || []).length;

    if (!text || letters < 2) {
      showToast('❓ Không thấy chữ trong ô. Hãy căn chỉnh chữ vào giữa ô xanh!', 'err');
      return;
    }
    if (confidence < 25) {
      showToast(`⚠️ Chữ hơi mờ (${confidence}%). Hãy giữ điện thoại ổn định`, 'warn');
    }

    // Deduplicate: skip if same as last result
    if (S.results.length > 0 && similar(S.results[0].english, text)) {
      showToast('↩️ Giống kết quả trước trong ô, bỏ qua', '');
      return;
    }

    // ── Translate ────────────────────────────────────────────
    let vi = '';
    if (S.cfg.autoTranslate) {
      updateStatusCard('Đang dịch sang tiếng Việt...');
      vi = await translate(text);
    }

    // ── Result ──────────────────────────────────────────────
    const r = {
      id: Date.now(),
      english: text,
      vietnamese: vi,
      confidence,
      pinned: S.cfg.autoPin,
      thumb: thumbUrl,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
    S.results.unshift(r);
    renderCard(r);

    if (S.cfg.autoRead) setTimeout(() => speak(text, r.id), 300);
    showToast('✅ Đã quét chữ trong ô!', 'ok');

  } catch (err) {
    console.error(err);
    showToast('❌ ' + (err.message || 'Lỗi quét, thử lại'), 'err');
  } finally {
    S.processing = false;
    btnCapture.disabled = !S.camOn;
    btnCapture.classList.remove('spinning');
    btnCapture.textContent = '🔍';
    clearStatusCard();
  }
}

// ─── Image preprocessing: grayscale + contrast ──────────────
function preprocess(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const k = 2.0; // contrast factor
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    let c = (g - 128) * k + 128;
    c = Math.max(0, Math.min(255, c));
    px[i] = px[i + 1] = px[i + 2] = c;
  }
  ctx.putImageData(d, 0, 0);
}

function clean(t) {
  return t
    .replace(/[^a-zA-Z0-9 .,!?'"():;\-\/\n]/g, '')
    .replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Simple similarity check (avoid duplicate consecutive results)
function similar(a, b) {
  if (!a || !b) return false;
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  // Jaccard similarity on words
  const wa = new Set(na.split(' ')), wb = new Set(nb.split(' '));
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return (inter / union) > 0.75;
}

// ═══════════════════════════════════════════════════════════
// TRANSLATION
// ═══════════════════════════════════════════════════════════
async function translate(text) {
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|vi`
    );
    const j = await r.json();
    if (j.responseStatus === 200 && j.responseData.translatedText) return j.responseData.translatedText;
  } catch (e) { }
  return '(Không thể dịch – kiểm tra mạng)';
}

// ═══════════════════════════════════════════════════════════
// TTS (TEXT TO SPEECH) - VOICE PERSONAS FOR KIDS & ADULTS
// ═══════════════════════════════════════════════════════════
function getVoiceProfile() {
  const persona = S.cfg.voicePersona || 'female';
  const vv = window.speechSynthesis ? speechSynthesis.getVoices() : [];

  let selectedVoice = null;
  let pitch = 1.0;
  let rate = S.cfg.speed;

  if (persona === 'kids') {
    // Giọng trẻ em: âm điệu trong trẻo, cao hơn (pitch 1.35), đọc chậm và rõ từng âm tiết
    pitch = 1.35;
    rate = Math.min(rate, 0.82);
    selectedVoice = vv.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Natural') || v.name.includes('Google')))
      || vv.find(v => v.lang.startsWith('en-US'));
  } else if (persona === 'male') {
    // Giọng nam người lớn: trầm ấm, rõ ràng
    pitch = 0.90;
    rate = S.cfg.speed;
    selectedVoice = vv.find(v => v.lang.startsWith('en') && (v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Guy') || v.name.includes('Alex') || v.name.includes('Male')))
      || vv.find(v => v.lang.startsWith('en'));
  } else if (persona === 'british') {
    // Giọng Anh - Anh chuẩn Oxford / RP
    pitch = 1.0;
    rate = S.cfg.speed;
    selectedVoice = vv.find(v => (v.lang === 'en-GB' || v.lang.startsWith('en-GB') || v.name.includes('UK') || v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Hazel')))
      || vv.find(v => v.lang.startsWith('en'));
  } else {
    // Giọng nữ cô giáo người lớn chuẩn Mỹ (female)
    pitch = 1.05;
    rate = S.cfg.speed;
    selectedVoice = vv.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Jenny') || v.name.includes('Zira') || v.name.includes('Google US') || v.name.includes('Female')))
      || vv.find(v => v.lang.startsWith('en-US'))
      || vv.find(v => v.lang.startsWith('en'));
  }

  if (!selectedVoice) {
    selectedVoice = vv.find(v => v.lang.startsWith('en')) || null;
  }

  return { voice: selectedVoice, pitch, rate };
}

function stopAllAudio(cardId) {
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (cardId) {
    const bNormal = document.querySelector(`[data-speak="${cardId}"]`);
    const bSlow = document.querySelector(`[data-speak-slow="${cardId}"]`);
    if (bNormal) { bNormal.classList.remove('playing'); bNormal.textContent = '🔊'; }
    if (bSlow) { bSlow.classList.remove('playing'); bSlow.textContent = '🐢'; }
  }
}

function speak(text, cardId) {
  if (!window.speechSynthesis) return;
  stopAllAudio(cardId);

  const u = new SpeechSynthesisUtterance(text);
  const profile = getVoiceProfile();
  u.lang = S.cfg.voicePersona === 'british' ? 'en-GB' : 'en-US';
  u.pitch = profile.pitch;
  u.rate = profile.rate;
  if (profile.voice) u.voice = profile.voice;

  if (cardId) {
    const btn = document.querySelector(`[data-speak="${cardId}"]`);
    if (btn) { btn.classList.add('playing'); btn.textContent = '⏸'; }
    u.onend = () => { if (btn) { btn.classList.remove('playing'); btn.textContent = '🔊'; } };
    u.onerror = () => { if (btn) { btn.classList.remove('playing'); btn.textContent = '🔊'; } };
  }
  speechSynthesis.speak(u);
}

function speakSlow(text, cardId) {
  if (!window.speechSynthesis) return;
  stopAllAudio(cardId);

  const u = new SpeechSynthesisUtterance(text);
  const profile = getVoiceProfile();
  u.lang = S.cfg.voicePersona === 'british' ? 'en-GB' : 'en-US';
  u.pitch = profile.pitch;
  // Đọc chậm rõ từng âm (0.55x) để học phát âm / cho trẻ nhỏ
  u.rate = 0.55;
  if (profile.voice) u.voice = profile.voice;

  if (cardId) {
    const btn = document.querySelector(`[data-speak-slow="${cardId}"]`);
    if (btn) { btn.classList.add('playing'); btn.textContent = '⏸'; }
    u.onend = () => { if (btn) { btn.classList.remove('playing'); btn.textContent = '🐢'; } };
    u.onerror = () => { if (btn) { btn.classList.remove('playing'); btn.textContent = '🐢'; } };
  }
  speechSynthesis.speak(u);
  showToast('🐢 Đang đọc chậm (0.55x)');
}

function setVoicePersona(persona) {
  S.cfg.voicePersona = persona;
  const names = {
    kids: '👧 Trẻ em (Trong trẻo, đọc chậm)',
    female: '👩‍🏫 Cô giáo (Chuẩn Mỹ, rõ ràng)',
    male: '👨‍🏫 Thầy giáo (Trầm ấm, chuẩn Mỹ)',
    british: '🇬🇧 Anh - Anh (Chuẩn Oxford)'
  };
  showToast('Đã chọn: ' + (names[persona] || persona));
  testVoice();
}

function testVoice() {
  const msgs = {
    kids: "Hello! Let's learn English together! Apple, Cat, Dog!",
    female: "Hello! Welcome to English learning. Practice pronunciation with me.",
    male: "Good day! Speaking English clearly and confidently every single day.",
    british: "Hello! Splendid job practicing your English pronunciation."
  };
  const text = msgs[S.cfg.voicePersona] || msgs.female;
  speak(text, null);
}

async function speakWord(word) {
  speak(word, null);
  if (S.cfg.autoTranslate) {
    const vi = await translate(word);
    showToast(`"${word}" → ${vi}`);
  }
}

// ═══════════════════════════════════════════════════════════
// RENDER CARD
// ═══════════════════════════════════════════════════════════
function renderCard(r) {
  emptyState.style.display = 'none';
  clearStatusCard();
  const cls = r.confidence >= 75 ? 'hi' : r.confidence >= 45 ? 'mid' : 'lo';
  const lbl = r.confidence >= 75 ? 'Tốt' : r.confidence >= 45 ? 'Khá' : 'Thấp';

  const words = r.english.split(' ').filter(w => /^[a-zA-Z]{2,20}$/.test(w)).slice(0, 10);
  const chipsHtml = words.length > 1
    ? `<div class="chips">${words.map(w => `<div class="chip" onclick="speakWord('${esc(w)}')">${esc(w)}</div>`).join('')}</div>`
    : '';

  const viHtml = r.vietnamese
    ? `<div class="divider"><div class="div-line"></div><div class="div-ico">🇻🇳</div><div class="div-line"></div></div>
       <div class="vi-text">${esc(r.vietnamese)}</div>`
    : '';

  const thumbHtml = r.thumb
    ? `<div class="card-thumb-row">
         <img src="${r.thumb}" class="card-thumb" alt="Ảnh trong ô xanh" />
         <span class="card-thumb-lbl">Ảnh cắt từ ô xanh</span>
       </div>`
    : '';

  const el = document.createElement('div');
  el.className = 'card fresh' + (r.pinned ? ' pinned' : '');
  el.id = `c${r.id}`;
  el.innerHTML = `
    <div class="card-head">
      <span class="badge">🇬🇧 Tiếng Anh</span>
      <div class="card-head-right">
        <span class="conf ${cls}">${lbl} ${r.confidence}%</span>
        <div class="head-act-btn ${r.pinned ? 'pinned' : ''}" data-pin="${r.id}" onclick="togglePin(${r.id})" title="Ghim">${r.pinned ? '📌' : '📍'}</div>
        <div class="head-act-btn btn-del" onclick="delCard(${r.id})" title="Xóa">🗑</div>
      </div>
    </div>
    <div class="card-main">
      <div class="card-content">
        ${thumbHtml}
        <div class="en-text">${esc(r.english)}</div>
        ${chipsHtml}
        ${viHtml}
      </div>
      <div class="card-side-acts">
        <div class="act-btn" data-speak="${r.id}" onclick="speak('${escJs(r.english)}',${r.id})" title="Đọc bình thường">🔊</div>
        <div class="act-btn btn-slow" data-speak-slow="${r.id}" onclick="speakSlow('${escJs(r.english)}',${r.id})" title="Đọc chậm từng chữ (0.55x)">🐢</div>
      </div>
    </div>
    <div class="card-foot"><span class="card-time">${r.time}</span></div>
  `;
  results.insertBefore(el, results.firstChild);
  // Remove "fresh" glow after 3s
  setTimeout(() => el.classList.remove('fresh'), 3000);
}

// ── Status card ──────────────────────────────────────────
function showStatusCard(msg) {
  clearStatusCard();
  const el = document.createElement('div');
  el.className = 'status-bar';
  el.id = 'statusCard';
  el.innerHTML = `<div class="s-dot"></div><span id="sMsg">${msg}</span><div class="spinner"></div>`;
  results.insertBefore(el, results.firstChild);
}

function updateStatusCard(m) {
  const e = document.getElementById('sMsg');
  if (e) e.textContent = m;
}

function clearStatusCard() {
  document.getElementById('statusCard')?.remove();
}

// ═══════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════
function togglePin(id) {
  const r = S.results.find(x => x.id === id);
  if (!r) return;
  r.pinned = !r.pinned;
  const el = document.getElementById(`c${id}`);
  if (el) {
    el.classList.toggle('pinned', r.pinned);
    const btn = el.querySelector(`[data-pin="${id}"]`);
    if (btn) {
      btn.classList.toggle('pinned', r.pinned);
      btn.textContent = r.pinned ? '📌' : '📍';
    }
  }
  showToast(r.pinned ? '📌 Đã ghim' : '📍 Đã bỏ ghim');
}

function delCard(id) {
  S.results = S.results.filter(x => x.id !== id);
  const el = document.getElementById(`c${id}`);
  if (el) {
    el.style.cssText = 'opacity:0;transform:translateX(100%);transition:all .28s;';
    setTimeout(() => {
      el.remove();
      checkEmpty();
    }, 280);
  }
}

function clearAll() {
  S.results.filter(r => !r.pinned).forEach(r => {
    S.results = S.results.filter(x => x.id !== r.id);
    document.getElementById(`c${r.id}`)?.remove();
  });
  checkEmpty();
  showToast('🗑️ Đã xóa');
}

function checkEmpty() {
  emptyState.style.display = S.results.length ? 'none' : 'flex';
}

// ═══════════════════════════════════════════════════════════
// HTTPS NOTICE ACTIONS
// ═══════════════════════════════════════════════════════════
async function tryAnyway() {
  document.getElementById('httpsNotice').classList.add('hidden');
  await startCam();
}

function switchToFileMode() {
  S.fileMode = true;
  document.getElementById('httpsNotice').classList.add('hidden');

  // Switch capture button to use file input
  btnCapture.disabled = false;
  btnCapture.onclick = () => {
    fileInput.setAttribute('capture', 'environment');
    fileInput.value = '';
    fileInput.click();
  };
  btnCamText.textContent = 'Camera (file)';
  btnCam.onclick = () => {
    fileInput.setAttribute('capture', 'environment');
    fileInput.value = '';
    fileInput.click();
  };

  fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    await runOCRonImage(url);
  };
  showToast('📷 Chế độ chụp ảnh đã bật');
}

async function runOCRonImage(src) {
  if (S.processing) return;
  S.processing = true;
  btnCapture.disabled = true;
  btnCapture.classList.add('spinning');
  btnCapture.textContent = '';
  showStatusCard('Đang nhận diện chữ...');
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    ocrCanvas.width = img.naturalWidth;
    ocrCanvas.height = img.naturalHeight;
    const ctx = ocrCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    preprocess(ctx, ocrCanvas.width, ocrCanvas.height);
    const { data } = await S.worker.recognize(ocrCanvas);
    const text = clean(data.text.trim());
    const confidence = Math.round(data.confidence);
    const letters = (text.match(/[a-zA-Z]/g) || []).length;
    if (!text || letters < 2) {
      showToast('❓ Không đọc được chữ', 'err');
      return;
    }
    let vi = '';
    if (S.cfg.autoTranslate) {
      updateStatusCard('Đang dịch...');
      vi = await translate(text);
    }
    const r = {
      id: Date.now(),
      english: text,
      vietnamese: vi,
      confidence,
      pinned: S.cfg.autoPin,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
    S.results.unshift(r);
    renderCard(r);
    if (S.cfg.autoRead) setTimeout(() => speak(text, r.id), 300);
    showToast('✅ Quét xong!', 'ok');
  } catch (e) {
    showToast('❌ ' + e.message, 'err');
  } finally {
    S.processing = false;
    btnCapture.disabled = false;
    btnCapture.classList.remove('spinning');
    btnCapture.textContent = '🔍';
    clearStatusCard();
  }
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════
function openSettings() {
  document.getElementById('sheetWrap').classList.add('open');
}

function closeSettings() {
  document.getElementById('sheetWrap').classList.remove('open');
}

function tog(k, el) {
  S.cfg[k] = !S.cfg[k];
  el.classList.toggle('on', S.cfg[k]);
}

function setSpeed(v) {
  S.cfg.speed = parseFloat(v);
  speak('Hello', null);
}

function setInterval_(v) {
  S.autoSeconds = parseInt(v);
  if (S.autoOn) {
    S.countdown = S.autoSeconds;
  }
}

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
let _tt;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.remove('show'), 3200);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJs(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// Default to single word mode on launch
setFrameMode('word', true);
