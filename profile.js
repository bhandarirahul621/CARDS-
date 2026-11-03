/*
 * Player profiles, stored in the Supabase `profiles` table.
 *
 * - First visit after signing in: the player creates a profile (onboarding).
 * - After that: the Profile tab shows their card and stats and lets them edit it.
 * - Every finished hand is recorded with the `record_hand` database function,
 *   so the bank and stats follow the player to any device.
 *
 * Row Level Security in the database guarantees a player can only read and
 * change their own row, no matter what this browser code does.
 */

const Profile = (() => {
  let user = null;    // the Supabase auth user (from Google)
  let profile = null; // the row from public.profiles

  const $ = (id) => document.getElementById(id);
  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

  // ---------------------------------------------------------------- loading
  async function start(authUser) {
    user = authUser;
    showView("auth-loading");
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(); // null (not an error) when the row doesn't exist yet

    if (user?.id !== authUser.id) return; // signed out while we were loading
    if (error) {
      console.error(error);
      $("auth-loading").textContent = "Couldn't load your profile. Refresh to try again.";
      return;
    }
    data ? enterGame(data) : showOnboarding();
  }

  function stop() {
    user = null;
    profile = null;
  }

  // ------------------------------------------------------------- onboarding
  function googleInfo() {
    const meta = user.user_metadata || {};
    return {
      name: meta.full_name || meta.name || "",
      avatar: meta.avatar_url || meta.picture || null,
    };
  }

  /** Turn "Rahul Bhandari" / "rahul.b@gmail.com" into a valid username suggestion. */
  function suggestUsername() {
    const base = (user.email || googleInfo().name || "player").split("@")[0];
    let name = base.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    while (name.length < 3) name += Math.floor(Math.random() * 10);
    return name;
  }

  function showOnboarding() {
    const { name, avatar } = googleInfo();
    setAvatar($("ob-avatar"), $("ob-avatar-initial"), avatar, name || "?");
    $("ob-display-name").value = name;
    $("ob-username").value = suggestUsername();
    $("ob-bio").value = "";
    setStatus("ob-status", "");
    showView("onboarding");
    $("ob-display-name").focus();
  }

  async function createProfile(event) {
    event.preventDefault();
    const fields = readForm("ob");
    if (!fields) return;

    setBusy("onboarding-form", true);
    const { data, error } = await supabaseClient
      .from("profiles")
      .insert({ id: user.id, avatar_url: googleInfo().avatar, ...fields })
      .select()
      .single();
    setBusy("onboarding-form", false);

    if (error) return setStatus("ob-status", friendlyError(error), "error");
    enterGame(data);
  }

  // --------------------------------------------------------- game & profile
  function enterGame(row) {
    profile = row;
    Blackjack.loadPlayer(row.bank);
    renderProfile();
    selectTab("table");
    showView("game");
  }

  function renderProfile() {
    const p = profile;
    const firstName = p.display_name.split(" ")[0];

    // Greeting bar
    $("greeting").textContent = `Welcome, ${firstName}!`;
    $("user-handle").textContent = `@${p.username}`;
    setAvatar($("avatar"), $("avatar-initial"), p.avatar_url, p.display_name);

    // Profile card
    setAvatar($("p-avatar"), $("p-avatar-initial"), p.avatar_url, p.display_name);
    $("p-name").textContent = p.display_name;
    $("p-username").textContent = `@${p.username}`;
    $("p-since").textContent = `Member since ${new Date(p.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
    $("p-bio").textContent = p.bio || "No bio yet.";
    $("p-bio").classList.toggle("muted", !p.bio);

    const winRate = p.hands_played ? Math.round((p.hands_won / p.hands_played) * 100) : 0;
    $("p-bank").textContent = `$${p.bank.toLocaleString()}`;
    $("p-best").textContent = `$${p.best_bank.toLocaleString()}`;
    $("p-played").textContent = p.hands_played.toLocaleString();
    $("p-won").textContent = p.hands_won.toLocaleString();
    $("p-rate").textContent = `${winRate}%`;
  }

  function openEditor() {
    $("ed-display-name").value = profile.display_name;
    $("ed-username").value = profile.username;
    $("ed-bio").value = profile.bio;
    setStatus("ed-status", "");
    $("profile-card").hidden = true;
    $("edit-form").hidden = false;
    $("ed-display-name").focus();
  }

  function closeEditor() {
    $("edit-form").hidden = true;
    $("profile-card").hidden = false;
  }

  async function saveProfile(event) {
    event.preventDefault();
    const fields = readForm("ed");
    if (!fields) return;

    setBusy("edit-form", true);
    const { data, error } = await supabaseClient
      .from("profiles")
      .update(fields)
      .eq("id", user.id)
      .select()
      .single();
    setBusy("edit-form", false);

    if (error) return setStatus("ed-status", friendlyError(error), "error");
    profile = data;
    renderProfile();
    closeEditor();
  }

  // ------------------------------------------------- syncing the game state
  async function recordHand({ outcome, bank }) {
    if (!profile) return;
    const { data, error } = await supabaseClient.rpc("record_hand", {
      p_won: outcome === "win",
      p_bank: bank,
    });
    if (error) return console.warn("Couldn't save hand:", error.message);
    profile = data;
    renderProfile();
  }

  async function saveBank({ bank }) {
    if (!profile) return;
    const { data, error } = await supabaseClient
      .from("profiles").update({ bank }).eq("id", user.id).select().single();
    if (error) return console.warn("Couldn't save bank:", error.message);
    profile = data;
    renderProfile();
  }

  // ---------------------------------------------------------------- helpers
  /** Read + validate a profile form. Field ids are `${prefix}-display-name` etc. */
  function readForm(prefix) {
    const status = `${prefix}-status`;
    const display_name = $(`${prefix}-display-name`).value.trim();
    const username = $(`${prefix}-username`).value.trim();
    const bio = $(`${prefix}-bio`).value.trim();

    if (!display_name) return void setStatus(status, "Please enter a display name.", "error");
    if (!USERNAME_RE.test(username)) {
      return void setStatus(status, "Usernames are 3–20 letters, numbers or underscores.", "error");
    }
    if (bio.length > 280) return void setStatus(status, "Bio must be 280 characters or fewer.", "error");
    return { display_name, username, bio };
  }

  function friendlyError(error) {
    if (error.code === "23505") return "That username is taken. Try another one.";
    if (error.code === "23514") return "Some of those details aren't valid. Check the fields and try again.";
    return `Couldn't save: ${error.message}`;
  }

  function setStatus(id, text, tone = "") {
    const el = $(id);
    el.textContent = text;
    el.className = `form-status ${tone}`;
  }

  function setBusy(formId, busy) {
    for (const el of $(formId).querySelectorAll("button, input, textarea")) el.disabled = busy;
  }

  function setAvatar(img, initial, url, name) {
    initial.textContent = (name || "?").charAt(0).toUpperCase();
    if (url) {
      img.src = url;
      img.alt = `${name}'s profile picture`;
      img.hidden = false;
      initial.hidden = true;
      // If the image fails to load, fall back to the first letter of their name.
      img.onerror = () => { img.hidden = true; initial.hidden = false; };
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      initial.hidden = false;
    }
  }

  function selectTab(name) {
    for (const tab of document.querySelectorAll("[data-tab]")) {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(active));
      $(`tab-${tab.dataset.tab}`).hidden = !active;
    }
    if (name === "profile") closeEditor();
  }

  // ------------------------------------------------------------ wire it up
  $("onboarding-form").addEventListener("submit", createProfile);
  $("edit-form").addEventListener("submit", saveProfile);
  $("edit-profile").addEventListener("click", openEditor);
  $("cancel-edit").addEventListener("click", closeEditor);
  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  }
  document.addEventListener("blackjack:round", (e) => recordHand(e.detail));
  document.addEventListener("blackjack:bank", (e) => saveBank(e.detail));

  return { start, stop };
})();
