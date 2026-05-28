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

let currentSentence = "";
let currentSource = "";
let currentMode = "sentence";
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;

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
    getRandomSentence();
  } else {
    currentSentence = "";
    currentSource = "free-recording";
    transcriptBox.value = "";
    sentenceCard.textContent = "";
    sourceLabel.textContent = "";
    setStatus("Record your own Yiddish, then type the exact words you said.");
  }

  updateSubmitButton();
}

async function getRandomSentence() {
  setStatus("Loading sentence...");

  const response = await fetch("/api/random-sentence");
  const result = await response.json();

  if (!result.ok) {
    setStatus(result.error || "Could not load a sentence.");
    sentenceCard.textContent = "No sentence found.";
    return;
  }

  currentSentence = result.sentence;
  currentSource = result.source;
  sentenceCard.textContent = currentSentence;
  sourceLabel.textContent = "From: " + currentSource;
  transcriptBox.value = currentSentence;
  recordedBlob = null;
  audioChunks = [];
  audioPreview.hidden = true;
  setStatus("Read the sentence, then submit.");
  updateSubmitButton();
}

loginButton.addEventListener("click", () => {
  const email = loginEmail.value.trim();
  const name = loginName.value.trim();

  if (!emailLooksValid(email)) {
    loginStatus.textContent = "Please enter a valid email address.";
    return;
  }

  localStorage.setItem("mamelushen_email", email);
  localStorage.setItem("mamelushen_name", name);
  loginStatus.textContent = "";
  requireLogin();
});

changeAccountButton.addEventListener("click", () => {
  const user = currentUser();
  loginEmail.value = user.email;
  loginName.value = user.name;
  loginOverlay.classList.remove("hidden");
});

recordButton.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Microphone recording is not available in this browser.");
    return;
  }

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setStatus("Microphone blocked or not found. Please allow the microphone.");
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
    setStatus("Recording ready. Listen back if you want, then submit.");
    updateSubmitButton();
  };

  mediaRecorder.start();
  recordButton.disabled = true;
  stopButton.disabled = false;
  submitButton.disabled = true;
  setStatus("Recording...");
});

stopButton.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  recordButton.disabled = false;
  stopButton.disabled = true;
});

clearButton.addEventListener("click", () => {
  recordedBlob = null;
  audioChunks = [];
  audioPreview.hidden = true;
  consentBox.checked = false;
  if (currentMode === "free") transcriptBox.value = "";
  setStatus("Cleared.");
  updateSubmitButton();
});

submitButton.addEventListener("click", async () => {
  const user = currentUser();

  if (!emailLooksValid(user.email)) {
    loginOverlay.classList.remove("hidden");
    return;
  }

  if (!recordedBlob) {
    setStatus("Record audio first.");
    return;
  }

  const text = transcriptBox.value.trim();

  if (!text) {
    setStatus("Text is missing.");
    return;
  }

  if (!consentBox.checked) {
    setStatus("Please check the permission box.");
    return;
  }

  submitButton.disabled = true;
  setStatus("Submitting...");

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
      setStatus("Saved: " + result.sample);
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
      setStatus("Submit failed: " + result.error);
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
