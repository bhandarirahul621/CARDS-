/*
 * One shared Supabase client for the whole site.
 * The publishable key is designed to be public: it only identifies the project.
 * What a signed-in player can actually read/write is enforced by Row Level
 * Security policies in the database. Never put the secret/service_role key here.
 */
const SUPABASE_URL = "https://masrtghpydxbacufdswg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Xjl1QdhVqdp-PuMDF2MALQ_BjeeHvyd";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/** Switch which top-level screen is visible: loading, login, onboarding or game. */
function showView(name) {
  for (const id of ["auth-loading", "login-screen", "onboarding", "game"]) {
    document.getElementById(id).hidden = id !== name;
  }
}
