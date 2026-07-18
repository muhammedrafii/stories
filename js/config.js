export const SUPABASE_URL = "https://zayygybyacjjlkvcwunz.supabase.co"; 
export const SUPABASE_ANON_KEY = "sb_publishable_nOyWKSefvSTaaXokOotY_g_nmHYl37U";
export const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// System state trackers shared between files
export let state = {
    currentUser: null,
    currentProfile: null,
    currentSelectedTargetUser: ""
};

export function updateStateUser(user, profile) {
    state.currentUser = user;
    state.currentProfile = profile;
}

export function updateTargetChatUser(username) {
    state.currentSelectedTargetUser = username;
}