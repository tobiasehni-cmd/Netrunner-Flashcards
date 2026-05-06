// ── Configuration ──────────────────────────────────────
const API_BASE = "https://netrunnerdb.com/api/2.0/public";
const TARGET_SETS = [
    "sg", "system-gateway", 
    "elev", "elevation", 
    "vp", "vantage-point"
];
const SET_NAMES = {
    "sg": "System Gateway",
    "system-gateway": "System Gateway",
    "elev": "Elevation",
    "elevation": "Elevation",
    "vp": "Vantage Point",
    "vantage-point": "Vantage Point"
};

const DB_NAME = "netrunner-flashcards";
const DB_VERSION = 1;
const STORE_NAME = "cards";

// ── IndexedDB ──────────────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "code" });
                store.createIndex("set_code", "set_code", { unique: false });
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
        store.put({
            code: card.code,
            title: card.title,
            text: card.text || "",
            set_code: card.set_code,
            side_code: card.side_code || "",
            faction_code: card.faction_code || "",
            type_code: card.type_code || ""
        });
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getAllCards() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
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

// ── API Fetching ───────────────────────────────────────
async function fetchCards() {
    const response = await fetch(`${API_BASE}/cards`);
    if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
    }
    const json = await response.json();
    const allCards = json.data || [];

    // Filter to our target sets only
    return allCards.filter(card => TARGET_SETS.includes(card.set_code));
}

// ── UI Logic ───────────────────────────────────────────
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

async function init() {
    const count = await getCardCount();
    if (count > 0) {
        syncSection.classList.add("hidden");
        cardSection.classList.remove("hidden");
        statusDiv.textContent = `${count} cards stored locally`;
        cardList = await getAllCards();
        showCard(0);
    } else {
        syncSection.classList.remove("hidden");
        cardSection.classList.add("hidden");
    }
}

syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = "Downloading...";
    syncInfo.textContent = "Fetching from NetrunnerDB...";

    try {
        const cards = await fetchCards();
        syncInfo.textContent = `Got ${cards.length} cards. Saving locally...`;

        await saveCards(cards);

        syncInfo.textContent = `Saved ${cards.length} cards!`;
        statusDiv.textContent = `${cards.length} cards stored locally`;

        // Switch to card view
        setTimeout(() => {
            cardList = cards;
            syncSection.classList.add("hidden");
            cardSection.classList.remove("hidden");
            showCard(0);
        }, 500);

    } catch (err) {
        syncBtn.disabled = false;
        syncBtn.textContent = "Download Cards";
        syncInfo.textContent = `Error: ${err.message}. Try again.`;
        console.error(err);
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
    cardTitle.textContent = card.title;
    cardSet.textContent = SET_NAMES[card.set_code] || card.set_code;
    cardText.textContent = card.text;
    cardBack.classList.add("hidden");
    revealBtn.classList.remove("hidden");
    cardCounter.textContent = `${index + 1} / ${cardList.length}`;
    currentIndex = index;
}

revealBtn.addEventListener("click", () => {
    cardBack.classList.remove("hidden");
    revealBtn.textContent = "Next Card";

    // On second tap, advance
    revealBtn.onclick = () => {
        revealBtn.textContent = "Reveal Text";
        revealBtn.onclick = null;
        // Re-attach original listener for next card
        showCard(currentIndex + 1);
    };
});

// ── Start ──────────────────────────────────────────────
init();
