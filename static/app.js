const newSentenceButton = document.getElementById("newSentenceButton");
const skipButton = document.getElementById("skipButton");
const sentenceCard = document.getElementById("sentenceCard");
const sourceLabel = document.getElementById("sourceLabel");
const speakerInput = document.getElementById("speaker");
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
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;

function setStatus(text) {
  statusBox.textContent = text;
}

function updateSubmitButton() {
  submitButton.disabled = !(recordedBlob && transcriptBox.value.trim() && consentBox.checked);
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
  setStatus("Cleared.");
  updateSubmitButton();
});

submitButton.addEventListener("click", async () => {
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
        speaker: speakerInput.value.trim(),
        source: currentSource,
        consent: consentBox.checked
      })
    });

    const result = await response.json();

    if (result.ok) {
      setStatus("Saved: " + result.sample);
      consentBox.checked = false;
      await getRandomSentence();
    } else {
      setStatus("Submit failed: " + result.error);
      updateSubmitButton();
    }
  };

  reader.readAsDataURL(recordedBlob);
});

newSentenceButton.addEventListener("click", getRandomSentence);
skipButton.addEventListener("click", getRandomSentence);
transcriptBox.addEventListener("input", updateSubmitButton);
consentBox.addEventListener("change", updateSubmitButton);

getRandomSentence();
