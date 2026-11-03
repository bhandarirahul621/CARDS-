/*
 * Google login through Supabase Auth.
 *
 * Flow: our page -> Supabase -> Google sign-in -> Supabase callback
 *       (https://masrtghpydxbacufdswg.supabase.co/auth/v1/callback) -> back to our page.
 *
 * After sign-in, profile.js takes over: it loads the player's profile or
 * asks them to create one.
 */

async function signInWithGoogle() {
  const button = document.getElementById("google-login");
  button.disabled = true;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    // Come back to whatever page we're on (Netlify in production, localhost when testing).
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    button.disabled = false;
    showLoginError(error.message);
  }
  // On success the browser leaves for Google, so there's nothing else to do here.
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
let currentUserId = null;
supabaseClient.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user?.id === currentUserId) return; // token refreshes etc. – nothing changed
  currentUserId = user?.id ?? null;

  if (user) {
    // Defer so we don't call Supabase from inside its own auth callback.
    setTimeout(() => Profile.start(user), 0);
  } else {
    Profile.stop();
    showView("login-screen");
  }
});

document.getElementById("google-login").addEventListener("click", signInWithGoogle);
document.getElementById("sign-out").addEventListener("click", () => supabaseClient.auth.signOut());
