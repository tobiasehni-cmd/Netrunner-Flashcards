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

async function getCardCount() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
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

let cardList = [];
let currentIndex = 0;

// ── Main Logic ─────────────────────────────────────────
async function init() {
    console.log("App initialized.");
    const count = await getCardCount();
    console.log("Current card count in DB:", count);
    
    if (count > 0) {
        syncSection.classList.add("hidden");
        cardSection.classList.remove("hidden");
        statusDiv.textContent = `${count} cards stored locally`;
        // Load cards for display
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
            cardList = req.result;
            showCard(0);
        };
    } else {
        syncSection.classList.remove("hidden");
        cardSection.classList.add("hidden");
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

        const allCards = json.data;
        console.log("Raw card count:", allCards.length);

        // DEBUG: Log the FIRST card to see its structure
        if (allCards.length > 0) {
            console.log("=== SAMPLE CARD DATA ===");
            console.log(JSON.stringify(allCards[0], null, 2));
            console.log("========================");
        }

        // TEMPORARY FIX: Download ALL cards for now to prove it works
        // We will filter later once we see the data structure
        const filteredCards = allCards; 
        
        console.log("Saving", filteredCards.length, "cards to IndexedDB...");
        await saveCards(filteredCards);
        
        syncInfo.textContent = `Saved ${filteredCards.length} cards!`;
        statusDiv.textContent = `${filteredCards.length} cards stored locally`;

        cardList = filteredCards;
        syncSection.classList.add("hidden");
        cardSection.classList.remove("hidden");
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
        cardText.textContent = "You've browsed all cards. Restart to review again.";
        cardBack.classList.remove("hidden");
        revealBtn.classList.add("hidden");
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
    cardCounter.textContent = `${index + 1} / ${cardList.length}`;
    currentIndex = index;
}

revealBtn.addEventListener("click", () => {
    cardBack.classList.remove("hidden");
    revealBtn.textContent = "Next Card";

    revealBtn.onclick = () => {
        revealBtn.textContent = "Reveal Text";
        revealBtn.onclick = null;
        showCard(currentIndex + 1);
    };
});

// Start
init();
