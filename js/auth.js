// js/auth.js

import { dbClient, updateStateUser, state } from './config.js';
import { fetchGlobalStories, setupStoryListeners } from './stories.js';
import { fetchTimelineTweets, setupTimelineListeners } from './timeline.js';
// Imported the chat notifications and history listing function here:
import { runSystemSyncEngine, setupChatListeners, checkChatNotificationsAndHistory } from './chat.js';
// NEW: Import decoupled profile component functions
import { setupProfileListeners, renderProfileDrawerData } from './profile.js';
// NEW: Import the decoupled search listener module
import { setupSearchListeners } from './search.js';

let systemLoopInterval = null;

export function initApplicationEngine() {
    // Setup UI routing toggles
    document.getElementById('toRegisterLink').addEventListener('click', () => showAuthScreen('register'));
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('registerBtn').addEventListener('click', handleSignUp);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Bottom Navigation Router Click Listeners
    document.getElementById('navSearch').addEventListener('click', () => setActiveDrawer('search'));
    document.getElementById('navPost').addEventListener('click', () => setActiveDrawer('post'));
    document.getElementById('navChat').addEventListener('click', () => setActiveDrawer('chat'));
    document.getElementById('navProfile').addEventListener('click', () => {
        // Explicitly clear any active external profile state when opening your own profile
        const profileDrawer = document.getElementById('profileDrawer');
        if (profileDrawer) profileDrawer.removeAttribute('data-viewing-external-id');
        setActiveDrawer('profile');
    });

    // Inject submodule event actions
    setupStoryListeners();
    setupTimelineListeners();
    setupChatListeners();
    setupProfileListeners(); // NEW: Setup Profile database update event listeners
    setupSearchListeners();  // NEW: Initialize search input observation loops immediately

    // Monitor session state
    dbClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            loadProfileAndApp(session.user);
        } else {
            document.getElementById('authSection').classList.remove('hidden');
            document.getElementById('appSection').classList.add('hidden');
            clearInterval(systemLoopInterval);
            showAuthScreen('login');
        }
    });
}

export function setActiveDrawer(panel) {
    const panels = ['search', 'post', 'chat', 'profile'];
    
    const targetEl = document.getElementById(`${panel}Drawer`);
    if (!targetEl) return;

    // 1. Determine target state BEFORE modifying any DOM elements
    const isTargetCurrentlyClosed = targetEl.classList.contains('hidden');
    
    // 2. Clear all structural panels and navigation elements uniformly
    panels.forEach(p => {
        const el = document.getElementById(`${p}Drawer`);
        const nav = document.getElementById(`nav${p.charAt(0).toUpperCase() + p.slice(1)}`);
        
        if (el) el.classList.add('hidden');
        if (nav) nav.classList.remove('active');
    });

    const timelineWrapper = document.getElementById('homeTimelineWrapper');
    const highlightsWrapper = document.getElementById('highlightsArchiveWrapper');

    // 3. Perform explicit actions based on state check
    if (isTargetCurrentlyClosed) {
        // OPEN TARGET PANEL
        targetEl.classList.remove('hidden');
        
        const targetNav = document.getElementById(`nav${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
        if (targetNav) targetNav.classList.add('active');
        
        // CONDITION: Keep stream elements visible if SEARCH is active; hide for others
        if (panel === 'search') {
            if (timelineWrapper) timelineWrapper.classList.remove('hidden');
            if (highlightsWrapper) highlightsWrapper.classList.remove('hidden');
        } else {
            if (timelineWrapper) timelineWrapper.classList.add('hidden');
            if (highlightsWrapper) highlightsWrapper.classList.add('hidden');
        }

        // Module initializers
        if (panel === 'chat') {
            const badge = document.getElementById('chatNotificationCount');
            if (badge) badge.classList.add('hidden');
            checkChatNotificationsAndHistory();
        }
        if (panel === 'profile') {
            // Only fetch default authenticated user profile metadata if not explicitly viewing an external user card
            if (!targetEl.hasAttribute('data-viewing-external-id')) {
                renderProfileDrawerData();
            }
        }
    } else {
        // FIX: CLOSE ALL DRAWER PANELS & RESET NAV STYLES (Always return to Main Full View)
        panels.forEach(p => {
            const el = document.getElementById(`${p}Drawer`);
            const nav = document.getElementById(`nav${p.charAt(0).toUpperCase() + p.slice(1)}`);
            
            if (el) el.classList.add('hidden');
            if (nav) nav.classList.remove('active');
        });

        if (timelineWrapper) timelineWrapper.classList.remove('hidden');
        if (highlightsWrapper) highlightsWrapper.classList.remove('hidden');
    }
}

/**
 * Opens the profile drawer contextually populated with target user's records
 * @param {Object} targetUserProfile - Row dictionary containing { id, username, name, bio }
 */
export async function setViewingOtherProfile(targetUserProfile) {
    if (!targetUserProfile) return;
    
    const profileDrawer = document.getElementById('profileDrawer');
    if (!profileDrawer) return;

    // 1. Flag component node BEFORE running structural transitions to stop local data overwrites
    profileDrawer.setAttribute('data-viewing-external-id', targetUserProfile.id);

    // 2. Populate explicit target metadata entries smoothly into UI elements
    const initialLetters = (targetUserProfile.username || 'US').substring(0, 2).toUpperCase();
    
    const navAvatar = document.getElementById('navProfileAvatar');
    const detailAvatar = document.getElementById('profileDetailAvatar');
    const displayUsername = document.getElementById('profileUsername');
    
    if (navAvatar) navAvatar.innerText = initialLetters;
    if (detailAvatar) detailAvatar.innerText = initialLetters;
    if (displayUsername) displayUsername.innerText = `@${targetUserProfile.username}`;

    const nameEl = document.getElementById('profileDisplayName');
    const bioEl = document.getElementById('profileDisplayBio');
    
    if (nameEl) nameEl.innerText = targetUserProfile.name || 'No Name Provided';
    if (bioEl) bioEl.innerText = targetUserProfile.bio || 'No bio text yet.';

    // 3. Fire transition layouts cleanly now that the DOM contains the safety attributes
    setActiveDrawer('profile');
}

function showAuthScreen(screen) {
    if (screen === 'register') {
        document.getElementById('loginCard').classList.add('hidden');
        document.getElementById('registerCard').classList.remove('hidden');
        document.getElementById('toggleText').innerHTML = `Have an account? <span id="toLoginLink">Log In</span>`;
        document.getElementById('toLoginLink').addEventListener('click', () => showAuthScreen('login'));
    } else {
        document.getElementById('registerCard').classList.add('hidden');
        document.getElementById('loginCard').classList.remove('hidden');
        document.getElementById('toggleText').innerHTML = `Don't have an account? <span id="toRegisterLink">Sign up</span>`;
        document.getElementById('toRegisterLink').addEventListener('click', () => showAuthScreen('register'));
    }
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const username = document.getElementById('regUsername').value.trim().replace('@', '').toLowerCase();

    if(!email || !password || !username) return alert("Fill in all boxes.");
    
    // 1. Sign up user inside Supabase Auth Engine
    const { data, error } = await dbClient.auth.signUp({ email, password });
    if (error) return alert(error.message);

    // 2. Fetch target user reference dynamically whether confirmed or unconfirmed
    const targetUser = data.user || (data.session ? data.session.user : null);
    
    if (targetUser) {
        // 3. Insert profile details directly bypassing standard session checks
        const { error: profileError } = await dbClient.from('profiles').insert([
            { id: targetUser.id, username: username }
        ]);
        
        if (profileError) {
            console.error("Profile insertion error details:", profileError);
            return alert(`Database Error: ${profileError.message}`);
        }
        
        alert("Registration successful! You can now log in.");
        showAuthScreen('login');
    } else {
        alert("Sign up complete! Please check your email inbox to confirm registration link.");
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { error } = await dbClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
}

async function handleLogout() { 
    await dbClient.auth.signOut(); 
    location.reload(); 
}

async function loadProfileAndApp(user) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
    
    // Explicit lookup query for profile row elements
    const { data, error } = await dbClient.from('profiles').select('username').eq('id', user.id).maybeSingle();
    
    let userHandle = "user";
    if (data && data.username) {
        userHandle = data.username;
    } else if (user.email) {
        userHandle = user.email.split('@')[0].toLowerCase();
    }
    
    const profile = { username: userHandle };
    updateStateUser(user, profile);
    
    document.getElementById('welcomeMsg').innerText = `@${profile.username}`;
    
    // Hydrate custom UI elements and profile navigation avatar strings seamlessly
    const initialLetters = profile.username.substring(0, 2).toUpperCase();
    document.getElementById('navProfileAvatar').innerText = initialLetters;
    document.getElementById('profileDetailAvatar').innerText = initialLetters;
    document.getElementById('profileUsername').innerText = `@${profile.username}`;
    
    fetchGlobalStories();
    fetchTimelineTweets();

    // Reset background sync configurations cleanly
    runSystemSyncEngine();
    clearInterval(systemLoopInterval);
    systemLoopInterval = setInterval(runSystemSyncEngine, 3000);
}