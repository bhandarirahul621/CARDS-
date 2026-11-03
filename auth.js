/*
 * Google login through Supabase Auth.
 *
 * Flow: our page -> Supabase -> Google sign-in -> Supabase callback
 *       (https://masrtghpydxbacufdswg.supabase.co/auth/v1/callback) -> back to our page.
 *
 * The publishable key below is meant to live in browser code. It only identifies
 * the project; it is not a secret. Never put the service_role / secret key here.
 */

const SUPABASE_URL = "https://masrtghpydxbacufdswg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Xjl1QdhVqdp-PuMDF2MALQ_BjeeHvyd";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const views = {
  loading: document.getElementById("auth-loading"),
  login: document.getElementById("login-screen"),
  game: document.getElementById("game"),
};

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
}

/** Pull the friendly bits out of the Google profile that Supabase stores. */
function profileOf(user) {
  const meta = user.user_metadata || {};
  const fullName = meta.full_name || meta.name || user.email || "Player";
  return {
    fullName,
    firstName: fullName.split(" ")[0],
    avatar: meta.avatar_url || meta.picture || "",
    email: user.email || "",
  };
}

function renderUser(user) {
  const { fullName, firstName, avatar, email } = profileOf(user);

  document.getElementById("greeting").textContent = `Welcome, ${firstName}!`;
  document.getElementById("user-email").textContent = email;

  const img = document.getElementById("avatar");
  const initial = document.getElementById("avatar-initial");
  initial.textContent = fullName.charAt(0).toUpperCase();

  if (avatar) {
    img.src = avatar;
    img.alt = `${fullName}'s profile picture`;
    img.hidden = false;
    initial.hidden = true;
    // If Google's image fails to load, fall back to the first letter of their name.
    img.onerror = () => { img.hidden = true; initial.hidden = false; };
  } else {
    img.hidden = true;
    initial.hidden = false;
  }
}

async function signInWithGoogle() {
  const button = document.getElementById("google-login");
  button.disabled = true;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    // Come back to whatever page we're on (Netlify URL in production, localhost when testing).
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    button.disabled = false;
    showLoginError(error.message);
  }
  // On success the browser leaves for Google, so there's nothing else to do here.
}

async function signOut() {
  await supabaseClient.auth.signOut();
}

function showLoginError(text) {
  const el = document.getElementById("login-error");
  el.textContent = text;
  el.hidden = !text;
}

// If Google or Supabase sent us back with an error, it arrives in the URL.
const urlError = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1))
  .get("error_description");
if (urlError) showLoginError(`Sign-in failed: ${urlError}`);

// Supabase tells us whenever the login state changes, including on page load
// (INITIAL_SESSION) and right after returning from Google (SIGNED_IN).
supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    renderUser(session.user);
    show("game");
  } else {
    show("login");
  }
});

document.getElementById("google-login").addEventListener("click", signInWithGoogle);
document.getElementById("sign-out").addEventListener("click", signOut);
