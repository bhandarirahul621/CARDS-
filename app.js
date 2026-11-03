/*
 * Blackjack on top of the Deck of Cards API (https://deckofcardsapi.com/).
 *
 * The API is only our "dealer's shoe": it shuffles and hands out cards.
 * Everything that makes this Blackjack (scoring, rules, betting) lives here.
 */

const API = "https://deckofcardsapi.com/api/deck";
const CARD_BACK = "https://deckofcardsapi.com/static/img/back.png";
const DECK_COUNT = 6;              // casinos usually deal Blackjack from a 6-deck shoe
const RESHUFFLE_BELOW = 78;        // reshuffle when ~25% of the shoe is left
const STARTING_BANK = 1000;
const BANK_KEY = "blackjack.bank";

// ---------------------------------------------------------------------------
// Game state: one object that describes "where we are" in the game.
// ---------------------------------------------------------------------------
const state = {
  deckId: null,
  remaining: null,
  bank: loadBank(),
  bet: 0,
  player: [],
  dealer: [],
  doubled: false,   // did the player double down this round?
  phase: "betting", // betting -> player -> dealer -> done -> betting ...
  busy: false,      // true while we wait for the API, to block double-clicks
};

// ---------------------------------------------------------------------------
// Talking to the API
// ---------------------------------------------------------------------------
async function api(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function newShoe() {
  const data = await api(`new/shuffle/?deck_count=${DECK_COUNT}`);
  state.deckId = data.deck_id;
  state.remaining = data.remaining;
}

/** Make sure we have a shoe, and reshuffle it when it's running low. */
async function prepareShoe() {
  if (!state.deckId) return newShoe();
  if (state.remaining < RESHUFFLE_BELOW) {
    // /shuffle/ puts every card back in the shoe and shuffles it.
    const data = await api(`${state.deckId}/shuffle/`);
    if (!data.success) return newShoe(); // deck expired on the server
    state.remaining = data.remaining;
    flash("Shuffling the shoe…");
  }
}

async function draw(count) {
  let data = await api(`${state.deckId}/draw/?count=${count}`);
  if (!data.success) {
    // The API deletes decks after 2 weeks of inactivity, or the shoe ran dry.
    await newShoe();
    data = await api(`${state.deckId}/draw/?count=${count}`);
  }
  state.remaining = data.remaining;
  return data.cards;
}

// ---------------------------------------------------------------------------
// Blackjack rules
// ---------------------------------------------------------------------------
function cardPoints(card) {
  if (card.value === "ACE") return 11;
  if (["KING", "QUEEN", "JACK"].includes(card.value)) return 10;
  return Number(card.value); // "2".."10"
}

/** Best total for a hand. Aces count 11, dropping to 1 when the hand would bust. */
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardPoints(card);
    if (card.value === "ACE") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const isBlackjack = (cards) => cards.length === 2 && handValue(cards) === 21;

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
async function deal() {
  if (state.bet <= 0) return flash("Place a bet first.");
  if (state.bet > state.bank) return flash("You can't bet more than your bank.");

  await busy(async () => {
    await prepareShoe();
    state.bank -= state.bet;
    state.player = [];
    state.dealer = [];
    state.doubled = false;
    state.phase = "player";

    // Deal in casino order: player, dealer, player, dealer (hole card).
    const [p1, d1, p2, d2] = await draw(4);
    state.player.push(p1, p2);
    state.dealer.push(d1, d2);

    if (isBlackjack(state.player) || isBlackjack(state.dealer)) {
      return finishRound();
    }
    flash("Hit or stand?");
  });
}

async function hit() {
  await busy(async () => {
    const [card] = await draw(1);
    state.player.push(card);
    const total = handValue(state.player);
    if (total > 21) return finishRound();
    if (total === 21) return dealerTurn();
  });
}

async function stand() {
  await busy(dealerTurn);
}

async function doubleDown() {
  if (state.bank < state.bet) return flash("Not enough in the bank to double.");
  await busy(async () => {
    state.bank -= state.bet;
    state.bet *= 2;
    state.doubled = true;
    const [card] = await draw(1);
    state.player.push(card);
    if (handValue(state.player) > 21) return finishRound();
    return dealerTurn();
  });
}

/** Dealer reveals the hole card and must hit until reaching 17 or more. */
async function dealerTurn() {
  state.phase = "dealer";
  render();
  while (handValue(state.dealer) < 17) {
    await pause(500);
    const [card] = await draw(1);
    state.dealer.push(card);
    render();
  }
  finishRound();
}

/** Compare hands and pay out. A payout includes the original bet coming back. */
function finishRound() {
  state.phase = "done";
  const p = handValue(state.player);
  const d = handValue(state.dealer);
  const bet = state.bet;
  let outcome, payout;

  if (p > 21) {
    [outcome, payout] = ["lose", 0];
    flash(`Bust! You lose $${bet}.`, "lose");
  } else if (isBlackjack(state.player) && isBlackjack(state.dealer)) {
    [outcome, payout] = ["push", bet];
    flash("Both have Blackjack. Push.");
  } else if (isBlackjack(state.player)) {
    const bonus = Math.floor(bet * 1.5); // 3:2, rounded down to whole dollars
    [outcome, payout] = ["win", bet + bonus];
    flash(`Blackjack! You win $${bonus}.`, "win");
  } else if (isBlackjack(state.dealer)) {
    [outcome, payout] = ["lose", 0];
    flash("Dealer has Blackjack.", "lose");
  } else if (d > 21) {
    [outcome, payout] = ["win", bet * 2];
    flash(`Dealer busts! You win $${bet}.`, "win");
  } else if (p > d) {
    [outcome, payout] = ["win", bet * 2];
    flash(`${p} beats ${d}. You win $${bet}.`, "win");
  } else if (p < d) {
    [outcome, payout] = ["lose", 0];
    flash(`${d} beats ${p}. You lose $${bet}.`, "lose");
  } else {
    [outcome, payout] = ["push", bet];
    flash(`Push at ${p}.`);
  }

  state.bank += payout;
  saveBank();

  // Undo a double for the next round, and keep the bet only if it's affordable.
  if (state.doubled) state.bet /= 2;
  if (state.bet > state.bank) state.bet = 0;
  if (state.bank <= 0) flash("You're out of money. Hit “Reset bank” to play again.", "lose");

  state.phase = "betting";
  render();

  // Let the profile code record this hand in the database.
  document.dispatchEvent(new CustomEvent("blackjack:round", { detail: { outcome, bank: state.bank } }));
}

// ---------------------------------------------------------------------------
// Rendering: turn `state` into what you see on screen
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function cardImg(card, faceDown = false) {
  const img = document.createElement("img");
  img.className = "card";
  img.src = faceDown ? CARD_BACK : card.image;
  img.alt = faceDown ? "Face-down card" : `${card.value} of ${card.suit}`;
  return img;
}

function render() {
  const hideHole = state.phase === "player";

  $("player-cards").replaceChildren(...state.player.map((c) => cardImg(c)));
  $("dealer-cards").replaceChildren(
    ...state.dealer.map((c, i) => cardImg(c, hideHole && i === 1))
  );

  $("player-score").textContent = state.player.length ? handValue(state.player) : "";
  $("dealer-score").textContent = !state.dealer.length
    ? ""
    : hideHole
      ? handValue([state.dealer[0]])
      : handValue(state.dealer);

  $("bank").textContent = `$${state.bank}`;
  $("bet").textContent = `$${state.bet}`;
  $("remaining").textContent = state.remaining ?? "–";

  const betting = state.phase === "betting";
  const playing = state.phase === "player";
  const b = state.busy;

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.disabled = b || !betting || state.bet + Number(chip.dataset.amount) > state.bank;
  });
  $("clear-bet").disabled = b || !betting || state.bet === 0;
  $("deal").disabled = b || !betting || state.bet === 0;
  $("hit").disabled = b || !playing;
  $("stand").disabled = b || !playing;
  $("double").disabled = b || !playing || state.player.length !== 2 || state.bank < state.bet;
  $("reset-bank").disabled = b || !betting;
}

function flash(text, tone = "") {
  const el = $("message");
  el.textContent = text;
  el.className = `message ${tone}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run an async action while locking the buttons, and report network errors. */
async function busy(fn) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await fn();
  } catch (err) {
    console.error(err);
    flash("Couldn't reach the card dealer. Check your connection and try again.", "lose");
    // Refund the bet if the round never really started.
    if (state.phase === "player" && state.player.length < 2) {
      state.bank += state.bet;
      state.phase = "betting";
    }
  } finally {
    state.busy = false;
    render();
  }
}

function loadBank() {
  try {
    const saved = Number(localStorage.getItem(BANK_KEY));
    return saved > 0 ? saved : STARTING_BANK;
  } catch {
    return STARTING_BANK;
  }
}

function saveBank() {
  try {
    localStorage.setItem(BANK_KEY, String(state.bank));
  } catch {
    /* storage unavailable (private mode): the bank just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Wire up the buttons
// ---------------------------------------------------------------------------
document.querySelectorAll(".chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    state.bet += Number(chip.dataset.amount);
    render();
  })
);
$("clear-bet").addEventListener("click", () => { state.bet = 0; render(); });
$("deal").addEventListener("click", deal);
$("hit").addEventListener("click", hit);
$("stand").addEventListener("click", stand);
$("double").addEventListener("click", doubleDown);
$("reset-bank").addEventListener("click", () => {
  state.bank = STARTING_BANK;
  state.bet = 0;
  saveBank();
  flash("Bank reset to $1000. Place your bet.");
  render();
  document.dispatchEvent(new CustomEvent("blackjack:bank", { detail: { bank: state.bank } }));
});

// Called by profile.js when a player signs in: start a fresh table with their saved bank.
window.Blackjack = {
  loadPlayer(bank) {
    state.bank = bank;
    state.bet = 0;
    state.player = [];
    state.dealer = [];
    state.doubled = false;
    state.phase = "betting";
    saveBank();
    flash(bank > 0 ? "Place your bet to begin." : "You're out of money. Hit “Reset bank” to play again.", bank > 0 ? "" : "lose");
    render();
  },
};

render();
