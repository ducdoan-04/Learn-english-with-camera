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
  activeTab: 'type',
  cfg: {
    autoRead: true,
    autoTranslate: true,
    autoPin: false,
    speed: 0.85,
    voicePersona: 'google',
    saveHistory: true,
    fontSize: 'md'
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

// Zero-delay touch shutter (0ms lag, eliminates 300ms mobile tap delay)
btnCapture.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    e.preventDefault();
    captureNow();
  }
}, { passive: false });

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
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };
    S.stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Bật continuous autofocus nếu phần cứng hỗ trợ để chữ luôn rõ nét
    try {
      const track = S.stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() || {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
    } catch (_) { }
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

  // 1. Phản hồi rung haptic ngay lập tức khi ngón tay vừa chạm nút
  if (navigator.vibrate) {
    try { navigator.vibrate(35); } catch (_) { }
  }

  // 2. Chớp màn trập camera tức thì
  scanFrame.classList.add('flash');
  setTimeout(() => scanFrame.classList.remove('flash'), 220);

  // 3. ĐÓNG BĂNG HÌNH ẢNH CAMERA TỨC THÌ (0ms lag)
  // Khóa khung hình tĩnh ngay t=0ms, triệt tiêu 100% hiện tượng rung/nhòe do tay chuyển động
  if (S.camOn && !video.paused) {
    try { video.pause(); } catch (_) { }
  }

  S.processing = true;
  btnCapture.disabled = true;
  btnCapture.classList.add('spinning');
  btnCapture.textContent = '';
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
    // Mở lại live camera sau khi phân tích xong
    if (S.camOn && video.paused) {
      video.play().catch(() => {});
    }
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
// MANUAL TEXT INPUT
// ═══════════════════════════════════════════════════════════
async function submitText() {
  const input = document.getElementById('typeInput');
  if (!input) return;
  const rawVal = input.value.trim();
  if (!rawVal) {
    input.focus();
    return;
  }

  // Allow any text (not just English)
  const text = rawVal.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!text) return;

  const btn = document.querySelector('.type-submit-btn');
  if (btn) { btn.classList.add('loading'); btn.textContent = '…'; }
  input.disabled = true;

  try {
    updateStatusCard('Đang dịch và tra từ...');

    let vi = '';
    if (S.cfg.autoTranslate) {
      vi = await translate(text);
    }

    const r = {
      id: Date.now(),
      english: text,
      vietnamese: vi,
      confidence: 100,
      pinned: S.cfg.autoPin,
      thumb: null,
      source: 'typed',
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    S.results.unshift(r);
    renderCard(r);

    if (S.cfg.autoRead) setTimeout(() => speak(text, r.id), 200);
    showToast('✅ Đã tra từ!', 'ok');

    input.value = '';
    clearStatusCard();
  } catch (err) {
    console.error(err);
    showToast('❌ ' + (err.message || 'Lỗi, thử lại'), 'err');
    clearStatusCard();
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.textContent = '→'; }
    input.disabled = false;
    input.focus();
  }
}

// ═══════════════════════════════════════════════════════════
// TRANSLATION (GOOGLE TRANSLATE API + FALLBACK)
// ═══════════════════════════════════════════════════════════
async function translate(text) {
  const cleanText = text.slice(0, 1000).trim();
  if (!cleanText) return '';

  // 1. Google Translate API chính hãng (chuẩn xác tự nhiên 100%)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(cleanText)}`;
    const r = await fetch(url);
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const trans = data[0].map(item => item[0]).filter(Boolean).join('');
        if (trans.trim()) return trans.trim();
      }
    }
  } catch (err) {
    console.warn('Google Translate API error, falling back:', err);
  }

  // 2. Dự phòng qua MyMemory nếu mạng hạn chế Google
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText.slice(0, 400))}&langpair=en|vi`
    );
    const j = await r.json();
    if (j.responseStatus === 200 && j.responseData.translatedText) {
      return j.responseData.translatedText;
    }
  } catch (_) { }

  return '(Không thể dịch – kiểm tra mạng)';
}

// ═══════════════════════════════════════════════════════════
// TTS (TEXT TO SPEECH) - GOOGLE TRANSLATE VOICE & PERSONAS
// ═══════════════════════════════════════════════════════════
let currentAudio = null;

function getVoiceProfile() {
  const persona = S.cfg.voicePersona || 'google';
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
  } else if (persona === 'female') {
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
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_) { }
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
  }
  if (cardId) {
    const bNormal = document.querySelector(`[data-speak="${cardId}"]`);
    const bSlow = document.querySelector(`[data-speak-slow="${cardId}"]`);
    const bVi = document.querySelector(`[data-speak-vi="${cardId}"]`);
    if (bNormal) { bNormal.classList.remove('playing'); bNormal.textContent = '🔊'; }
    if (bSlow) { bSlow.classList.remove('playing'); bSlow.textContent = '🐢'; }
    if (bVi) { bVi.classList.remove('playing'); }
  }
}

// Phát âm dùng trực tiếp âm thanh chuẩn của Google Translate TTS
function playGoogleTts(text, lang = 'en', slow = false, cardId = null, btnType = 'normal') {
  stopAllAudio(cardId);
  const q = encodeURIComponent(text.slice(0, 200).trim());
  const directUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${q}`;
  const proxyUrl = `/api/tts?tl=${lang}&q=${q}`;

  const audio = new Audio();
  audio.referrerPolicy = 'no-referrer';
  audio.playbackRate = slow ? 0.6 : (S.cfg.speed || 1.0);
  currentAudio = audio;

  let btn = null;
  if (cardId) {
    if (btnType === 'normal') btn = document.querySelector(`[data-speak="${cardId}"]`);
    else if (btnType === 'slow') btn = document.querySelector(`[data-speak-slow="${cardId}"]`);
    else if (btnType === 'vi') btn = document.querySelector(`[data-speak-vi="${cardId}"]`);
  }

  if (btn) {
    btn.classList.add('playing');
    if (btnType === 'normal' || btnType === 'slow') btn.textContent = '⏸';
  }

  const cleanup = () => {
    if (btn) {
      btn.classList.remove('playing');
      if (btnType === 'normal') btn.textContent = '🔊';
      else if (btnType === 'slow') btn.textContent = '🐢';
    }
    if (currentAudio === audio) currentAudio = null;
  };

  audio.onended = cleanup;

  let triedProxy = false;
  const tryFallback = () => {
    // If direct Google fails and we're not on standalone localhost, try Vercel /api/tts proxy
    if (!triedProxy && location.protocol.startsWith('http')) {
      triedProxy = true;
      audio.src = proxyUrl;
      audio.play().catch(() => {
        cleanup();
        if (lang === 'en') speakWithSpeechSynthesis(text, cardId, slow);
      });
      return;
    }
    cleanup();
    if (lang === 'en') speakWithSpeechSynthesis(text, cardId, slow);
  };

  audio.onerror = tryFallback;

  audio.src = directUrl;
  audio.play().catch(tryFallback);

  if (slow) showToast('🐢 Đang đọc chậm Google (0.6x)');
}

function speakWithSpeechSynthesis(text, cardId, slow = false) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  const profile = getVoiceProfile();
  u.lang = S.cfg.voicePersona === 'british' ? 'en-GB' : 'en-US';
  u.pitch = profile.pitch;
  u.rate = slow ? 0.55 : profile.rate;
  if (profile.voice) u.voice = profile.voice;

  let btn = null;
  if (cardId) {
    btn = document.querySelector(slow ? `[data-speak-slow="${cardId}"]` : `[data-speak="${cardId}"]`);
    if (btn) {
      btn.classList.add('playing');
      btn.textContent = '⏸';
    }
    const end = () => {
      if (btn) {
        btn.classList.remove('playing');
        btn.textContent = slow ? '🐢' : '🔊';
      }
    };
    u.onend = end;
    u.onerror = end;
  }

  speechSynthesis.speak(u);
  if (slow) showToast('🐢 Đang đọc chậm (0.55x)');
}

function speak(text, cardId) {
  if (!text) return;
  stopAllAudio(cardId);

  const persona = S.cfg.voicePersona || 'google';
  if (persona === 'google') {
    playGoogleTts(text, 'en', false, cardId, 'normal');
  } else {
    speakWithSpeechSynthesis(text, cardId, false);
  }
}

function speakSlow(text, cardId) {
  if (!text) return;
  stopAllAudio(cardId);

  const persona = S.cfg.voicePersona || 'google';
  if (persona === 'google') {
    playGoogleTts(text, 'en', true, cardId, 'slow');
  } else {
    speakWithSpeechSynthesis(text, cardId, true);
  }
}

function speakVi(text, cardId) {
  if (!text || text.startsWith('(')) return;
  stopAllAudio(cardId);
  playGoogleTts(text, 'vi', false, cardId, 'vi');
}

function setVoicePersona(persona) {
  S.cfg.voicePersona = persona;
  const names = {
    google: '🌐 Google Dịch (Chuẩn quốc tế, tự nhiên nhất)',
    female: '👩‍🏫 Cô giáo (Chuẩn Mỹ, rõ ràng)',
    kids: '👧 Trẻ em (Trong trẻo, đọc chậm)',
    male: '👨‍🏫 Thầy giáo (Trầm ấm, chuẩn Mỹ)',
    british: '🇬🇧 Anh - Anh (Chuẩn Oxford)'
  };
  showToast('Đã chọn: ' + (names[persona] || persona));
  testVoice();
}

function testVoice() {
  const persona = S.cfg.voicePersona || 'google';
  const msgs = {
    google: "Hello! This is Google Translate voice. Practice English every single day!",
    female: "Hello! Welcome to English learning. Practice pronunciation with me.",
    kids: "Hello! Let's learn English together! Apple, Cat, Dog!",
    male: "Good day! Speaking English clearly and confidently every single day.",
    british: "Hello! Splendid job practicing your English pronunciation."
  };
  const text = msgs[persona] || msgs.google;
  if (persona === 'google') {
    playGoogleTts(text, 'en', false, null, 'normal');
  } else {
    speakWithSpeechSynthesis(text, null, false);
  }
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
       <div class="vi-row">
         <div class="vi-text">${esc(r.vietnamese)}</div>
         <button class="vi-speak-btn" data-speak-vi="${r.id}" onclick="speakVi('${escJs(r.vietnamese)}', ${r.id})" title="Nghe đọc tiếng Việt (Google)">🔊</button>
       </div>`
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
      <span class="badge">${r.source === 'typed' ? '✏️ Nhập tay' : '🇬🇧 Tiếng Anh'}</span>
      <div class="card-head-right">
        ${r.source === 'typed' ? '' : `<span class="conf ${cls}">${lbl} ${r.confidence}%</span>`}
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
  const lbl = document.getElementById('speedVal');
  if (lbl) lbl.textContent = parseFloat(v).toFixed(2).replace('.00','');
}

function setInterval_(v) {
  S.autoSeconds = parseInt(v);
  const lbl = document.getElementById('intervalVal');
  if (lbl) lbl.textContent = v;
  if (S.autoOn) {
    S.countdown = S.autoSeconds;
  }
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
  S.activeTab = tab;
  const tabType   = document.getElementById('tabType');
  const tabCam    = document.getElementById('tabCam');
  const panelType = document.getElementById('panelType');
  const panelCam  = document.getElementById('panelCam');

  if (tab === 'type') {
    tabType.classList.add('active');
    tabCam.classList.remove('active');
    panelType.classList.remove('hidden');
    panelCam.classList.add('hidden');
    setTimeout(() => {
      const inp = document.getElementById('typeInput');
      if (inp) inp.focus();
    }, 150);
  } else {
    tabCam.classList.add('active');
    tabType.classList.remove('active');
    panelCam.classList.remove('hidden');
    panelType.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// FONT SIZE
// ═══════════════════════════════════════════════════════════
function setFontSize(size) {
  S.cfg.fontSize = size;
  document.body.classList.remove('fs-sm', 'fs-lg');
  if (size !== 'md') document.body.classList.add('fs-' + size);
  document.querySelectorAll('.fs-btn').forEach((b, i) => {
    const sizes = ['sm', 'md', 'lg'];
    b.classList.toggle('active', sizes[i] === size);
  });
  showToast('Cỡ chữ: ' + (size === 'sm' ? 'Nhỏ' : size === 'lg' ? 'Lớn' : 'Bình thường'));
}

// ═══════════════════════════════════════════════════════════
// EXPORT HISTORY
// ═══════════════════════════════════════════════════════════
function exportHistory() {
  if (!S.results.length) {
    showToast('Chưa có kết quả để xuất', 'err');
    return;
  }
  const lines = S.results.map(r => {
    const vi  = r.vietnamese ? ` → ${r.vietnamese}` : '';
    const src = r.source === 'typed' ? '[Nhập]' : '[Quét]';
    return `${src} ${r.english}${vi}`;
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `scanspeak_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📤 Đã xuất ${S.results.length} từ`, 'ok');
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
