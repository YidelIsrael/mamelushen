const loginOverlay = document.getElementById("loginOverlay");
const loginEmail = document.getElementById("loginEmail");
const loginName = document.getElementById("loginName");
const loginButton = document.getElementById("loginButton");
const loginStatus = document.getElementById("loginStatus");
const accountLabel = document.getElementById("accountLabel");
const changeAccountButton = document.getElementById("changeAccountButton");

const sentenceModeButton = document.getElementById("sentenceModeButton");
const freeModeButton = document.getElementById("freeModeButton");
const sentencePanel = document.getElementById("sentencePanel");
const freePanel = document.getElementById("freePanel");

const newSentenceButton = document.getElementById("newSentenceButton");
const skipButton = document.getElementById("skipButton");
const sentenceCard = document.getElementById("sentenceCard");
const sourceLabel = document.getElementById("sourceLabel");
const recordButton = document.getElementById("recordButton");
const stopButton = document.getElementById("stopButton");
const clearButton = document.getElementById("clearButton");
const submitButton = document.getElementById("submitButton");
const statusBox = document.getElementById("status");
const audioPreview = document.getElementById("audioPreview");
const transcriptBox = document.getElementById("transcript");
const consentBox = document.getElementById("consent");
const meter = document.getElementById("meter");
const symbolBubble = document.getElementById("symbolBubble");

let currentSentence = "";
let currentSource = "";
let currentMode = "sentence";
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let symbolTimer = null;

const symbolMessages = [
  "איך בין דא מיט דיר. לאמיר נעמען איין קלארן זאץ.",
  "רעד פשוט און נאטירליך, אזוי ווי דו רעדסט יעדן טאג.",
  "יעדע רעקארדירונג העלפט די מאמע־לשון וואקסן.",
  "קוק איבער די ווערטער פאר'ן שיקן. ריכטיגקייט איז וויכטיג.",
  "אויב דער זאץ איז שווער, דריק סקיפ און נעם א נייעם."
];

function emailLooksValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function currentUser() {
  return {
    email: localStorage.getItem("mamelushen_email") || "",
    name: localStorage.getItem("mamelushen_name") || ""
  };
}

function requireLogin() {
  const user = currentUser();

  if (emailLooksValid(user.email)) {
    accountLabel.textContent = user.name ? `${user.name} (${user.email})` : user.email;
    loginOverlay.classList.add("hidden");
    return;
  }

  loginOverlay.classList.remove("hidden");
}

function setStatus(text) {
  statusBox.textContent = text;
}

function symbolSay(text) {
  if (!symbolBubble) return;

  symbolBubble.textContent = text;
  symbolBubble.classList.remove("talking");
  void symbolBubble.offsetWidth;
  symbolBubble.classList.add("talking");
}

function startSymbolMessages() {
  if (!symbolBubble || symbolTimer) return;

  let messageIndex = 0;
  symbolTimer = setInterval(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") return;
    messageIndex = (messageIndex + 1) % symbolMessages.length;
    symbolSay(symbolMessages[messageIndex]);
  }, 9000);
}

function updateSubmitButton() {
  submitButton.disabled = !(recordedBlob && transcriptBox.value.trim() && consentBox.checked && emailLooksValid(currentUser().email));
}

function setMode(mode) {
  currentMode = mode;
  const isSentence = mode === "sentence";
  sentencePanel.classList.toggle("active", isSentence);
  freePanel.classList.toggle("active", !isSentence);
  sentenceModeButton.classList.toggle("active", isSentence);
  freeModeButton.classList.toggle("active", !isSentence);

  recordedBlob = null;
  audioChunks = [];
  audioPreview.hidden = true;
  consentBox.checked = false;

  if (isSentence) {
    symbolSay("איך וועל דיר געבן א זאץ. ליין עס קלאר און רואיג.");
    getRandomSentence();
  } else {
    currentSentence = "";
    currentSource = "free-recording";
    transcriptBox.value = "";
    sentenceCard.textContent = "";
    sourceLabel.textContent = "";
    setStatus("רעקארדיר דיין אייגענע אידיש, נאכדעם שרייב גענוי וואס דו האסט געזאגט.");
    symbolSay("יעצט קענסטו זאגן דיין אייגענע זאץ. שרייב עס נאכדעם גענוי.");
  }

  updateSubmitButton();
}

async function getRandomSentence() {
  setStatus("לאדט א נייעם זאץ...");
  symbolSay("איך זוך יעצט א גוטן זאץ פאר דיר...");
  sentenceCard.classList.add("loading");

  const response = await fetch("/api/random-sentence");
  const result = await response.json();

  if (!result.ok) {
    setStatus(result.error || "מען קען נישט לאדן א זאץ.");
    sentenceCard.textContent = "מען האט נישט געטראפן קיין זאץ.";
    sentenceCard.classList.remove("loading");
    return;
  }

  currentSentence = result.sentence;
  currentSource = result.source;
  sentenceCard.textContent = currentSentence;
  sourceLabel.textContent = "מקור: " + currentSource;
  transcriptBox.value = currentSentence;
  recordedBlob = null;
  audioChunks = [];
  audioPreview.hidden = true;
  sentenceCard.classList.remove("loading");
  setStatus("לייען דעם זאץ, נאכדעם שיק אריין.");
  symbolSay("גרייט. ליין דעם זאץ ווי א מענטש רעדט עס טאקע.");
  updateSubmitButton();
}

loginButton.addEventListener("click", () => {
  const email = loginEmail.value.trim();
  const name = loginName.value.trim();

  if (!emailLooksValid(email)) {
    loginStatus.textContent = "ביטע שרייב א ריכטיגע אימעיל אדרעס.";
    return;
  }

  localStorage.setItem("mamelushen_email", email);
  localStorage.setItem("mamelushen_name", name);
  loginStatus.textContent = "";
  requireLogin();
  symbolSay("שלום עליכם. מיר קענען אנהייבן.");
});

changeAccountButton.addEventListener("click", () => {
  const user = currentUser();
  loginEmail.value = user.email;
  loginName.value = user.name;
  loginOverlay.classList.remove("hidden");
});

recordButton.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("מייקראפאן רעקארדירונג ארבעט נישט אין דעם בראוזער.");
    return;
  }

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setStatus("דער מייקראפאן איז פארמאכט אדער נישט געפונען. ביטע לאז צו דעם מייקראפאן.");
    return;
  }

  audioChunks = [];
  recordedBlob = null;
  audioPreview.hidden = true;

  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(audioChunks, { type: "audio/webm" });
    audioPreview.src = URL.createObjectURL(recordedBlob);
    audioPreview.hidden = false;
    stream.getTracks().forEach(track => track.stop());
    meter.classList.remove("recording");
    setStatus("די רעקארדירונג איז גרייט. הער איבער אויב דו ווילסט, נאכדעם שיק אריין.");
    symbolSay("שיין. יעצט קוק איבער די טעקסט און שיק עס אריין.");
    updateSubmitButton();
  };

  mediaRecorder.start();
  recordButton.disabled = true;
  stopButton.disabled = false;
  submitButton.disabled = true;
  meter.classList.add("recording");
  setStatus("רעקארדירט...");
  symbolSay("איך הער. רעד קלאר, אבער נאטירליך.");
});

stopButton.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  recordButton.disabled = false;
  stopButton.disabled = true;
  meter.classList.remove("recording");
});

clearButton.addEventListener("click", () => {
  recordedBlob = null;
  audioChunks = [];
  audioPreview.hidden = true;
  consentBox.checked = false;
  if (currentMode === "free") transcriptBox.value = "";
  setStatus("אויסגעמעקט.");
  symbolSay("אויסגעמעקט. מען קען אנהייבן נאכאמאל.");
  updateSubmitButton();
});

submitButton.addEventListener("click", async () => {
  const user = currentUser();

  if (!emailLooksValid(user.email)) {
    loginOverlay.classList.remove("hidden");
    return;
  }

  if (!recordedBlob) {
    setStatus("קודם רעקארדיר אודיא.");
    return;
  }

  const text = transcriptBox.value.trim();

  if (!text) {
    setStatus("עס פעלט טעקסט.");
    return;
  }

  if (!consentBox.checked) {
    setStatus("ביטע צייכן אן דעם רשות קעסטל.");
    return;
  }

  submitButton.disabled = true;
  setStatus("שיקט אריין...");

  const reader = new FileReader();

  reader.onloadend = async () => {
    const base64Audio = reader.result.split(",")[1];
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio: base64Audio,
        text,
        speaker: user.name,
        email: user.email,
        mode: currentMode,
        source: currentMode === "sentence" ? currentSource : "free-recording",
        consent: consentBox.checked
      })
    });

    const result = await response.json();

    if (result.ok) {
      setStatus("געסעיווט: " + result.sample);
      symbolSay("געסעיווט. יישר כח, דאס העלפט זייער.");
      consentBox.checked = false;
      if (currentMode === "sentence") {
        await getRandomSentence();
      } else {
        recordedBlob = null;
        audioChunks = [];
        audioPreview.hidden = true;
        transcriptBox.value = "";
        updateSubmitButton();
      }
    } else {
      setStatus("שיקן איז דורכגעפאלן: " + result.error);
      symbolSay("עס איז נישט דורך. פרוביר נאכאמאל אין א מינוט.");
      updateSubmitButton();
    }
  };

  reader.readAsDataURL(recordedBlob);
});

sentenceModeButton.addEventListener("click", () => setMode("sentence"));
freeModeButton.addEventListener("click", () => setMode("free"));
newSentenceButton.addEventListener("click", getRandomSentence);
skipButton.addEventListener("click", getRandomSentence);
transcriptBox.addEventListener("input", updateSubmitButton);
consentBox.addEventListener("change", updateSubmitButton);

requireLogin();
getRandomSentence();
startSymbolMessages();
