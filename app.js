// ── Configuration ──────────────────────────────────────
const API_BASE = "https://netrunnerdb.com/api/2.0/public";
const DB_NAME = "netrunner-flashcards";
const DB_VERSION = 1;
const STORE_NAME = "cards";

// ── IndexedDB Helpers ──────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "code" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveCards(cards) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const card of cards) {
        store.put(card);
    }
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function saveCard(card) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(card);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getAllCardsDueToday() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const today = new Date().toISOString().slice(0, 10);
            resolve(request.result.filter(card => !card.sm2_nextReview || card.sm2_nextReview <= today));
        };
        request.onerror = () => reject(request.error);
    });
}

// ── UI Elements ────────────────────────────────────────
const syncBtn = document.getElementById("sync-btn");
const syncInfo = document.getElementById("sync-info");
const syncSection = document.getElementById("sync-section");
const cardSection = document.getElementById("card-section");
const cardTitle = document.getElementById("card-title");
const cardSet = document.getElementById("card-set");
const cardText = document.getElementById("card-text");
const cardBack = document.getElementById("card-back");
const cardCounter = document.getElementById("card-counter");
const revealBtn = document.getElementById("reveal-btn");
const statusDiv = document.getElementById("status");
const sm2RatingDiv = document.getElementById("sm2-rating");

let cardList = [];
let currentIndex = 0;

// ── Main Logic ─────────────────────────────────────────
async function init() {
    console.log("App initialized.");
    cardList = await getAllCardsDueToday();
    const count = cardList.length;
    console.log("Current card count for review today:", count);

    if (count > 0) {
        syncSection.classList.add("hidden");
        cardSection.classList.remove("hidden");
        statusDiv.textContent = `${count} cards scheduled for review today`;
        showCard(0);
    } else {
        syncSection.classList.remove("hidden");
        cardSection.classList.add("hidden");
        statusDiv.textContent = `No cards to review today, or not loaded yet.`;
    }
}

syncBtn.addEventListener("click", async () => {
    console.log("Button clicked. Starting fetch...");
    syncBtn.disabled = true;
    syncBtn.textContent = "Downloading...";
    syncInfo.textContent = "Fetching from NetrunnerDB...";

    try {
        console.log("Fetching from:", API_BASE + "/cards");
        const response = await fetch(`${API_BASE}/cards`);

        console.log("Response Status:", response.status);

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        console.log("JSON received. Keys:", Object.keys(json));
        console.log("Total items in 'data'?", json.data ? json.data.length : "No 'data' key");

        if (!json.data || !Array.isArray(json.data)) {
            throw new Error("Unexpected API format: 'data' array not found");
        }

        const allowedPackCodes = ["sg", "sge", "vp"];
        const filteredCards = json.data
            .filter(card => allowedPackCodes.includes(card.pack_code))
            .map(card => ({
                ...card,
                sm2_repetitions: 0,
                sm2_interval: 1,
                sm2_easeFactor: 2.5,
                sm2_nextReview: new Date().toISOString().slice(0, 10)
            }));

        console.log("Saving", filteredCards.length, "cards to IndexedDB...");
        await saveCards(filteredCards);
        syncInfo.textContent = `Saved ${filteredCards.length} cards!`;
        statusDiv.textContent = `${filteredCards.length} cards stored locally`;
        syncSection.classList.add("hidden");
        cardSection.classList.remove("hidden");
        cardList = filteredCards;
        showCard(0);
    } catch (err) {
        console.error("CRITICAL ERROR:", err);
        syncBtn.disabled = false;
        syncBtn.textContent = "Download Cards";
        syncInfo.textContent = `Error: ${err.message}. Check Console.`;
    }
});

function showCard(index) {
    if (index >= cardList.length) {
        cardTitle.textContent = "End of Stack";
        cardSet.textContent = "";
        cardText.textContent = "You've browsed all cards scheduled for today!";
        cardBack.classList.remove("hidden");
        revealBtn.classList.add("hidden");
        sm2RatingDiv.classList.add("hidden");
        return;
    }

    const card = cardList[index];
    // Try multiple possible field names just in case
    const title = card.title || "Unknown Title";
    const setCode = card.set_code || card.pack_code || "Unknown Set";
    const text = card.text || card.rules_text || card.flavor || "No text";

    cardTitle.textContent = title;
    cardSet.textContent = setCode.toUpperCase();
    cardText.textContent = text;
    cardBack.classList.add("hidden");
    revealBtn.classList.remove("hidden");
    sm2RatingDiv.classList.add("hidden");
    cardCounter.textContent = `${index + 1} / ${cardList.length}`;
    currentIndex = index;
}

revealBtn.addEventListener("click", () => {
    cardBack.classList.remove("hidden");
    revealBtn.classList.add("hidden");
    sm2RatingDiv.classList.remove("hidden");
});

sm2RatingDiv.addEventListener('click', async e => {
    if (!e.target.dataset.q) return;
    const score = parseInt(e.target.dataset.q, 10);
    let card = cardList[currentIndex];
    card = updateSM2(card, score);
    await saveCard(card);
    // Remove card from today's review list
    cardList.splice(currentIndex, 1);
    if (currentIndex >= cardList.length) currentIndex = 0;
    showCard(currentIndex);
});

function updateSM2(card, quality) {
    // quality: 0-5
    let {
        sm2_repetitions,
        sm2_interval,
        sm2_easeFactor
    } = card;
    if (quality >= 3) {
        sm2_repetitions = (sm2_repetitions || 0) + 1;
        if (sm2_repetitions === 1) {
            sm2_interval = 1;
        } else if (sm2_repetitions === 2) {
            sm2_interval = 6;
        } else {
            sm2_interval = Math.round(sm2_interval * sm2_easeFactor);
        }
    } else {
        sm2_repetitions = 0;
        sm2_interval = 1;
    }
    sm2_easeFactor = sm2_easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (sm2_easeFactor < 1.3) sm2_easeFactor = 1.3;
    let nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + sm2_interval);
    return {
        ...card,
        sm2_repetitions,
        sm2_interval,
        sm2_easeFactor,
        sm2_nextReview: nextDate.toISOString().slice(0, 10)
    };
}

// Start
init();
