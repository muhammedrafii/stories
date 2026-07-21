import { dbClient, updateStateUser, state } from './config.js';
import { fetchGlobalStories, setupStoryListeners } from './modules/stories.js';
import { fetchTimelineTweets, setupTimelineListeners } from './modules/timeline.js';
import { runSystemSyncEngine, setupChatListeners, checkChatNotificationsAndHistory } from './modules/chat.js';
import { setupProfileListeners, renderProfileDrawerData } from './modules/profile.js';
import { setupSearchListeners } from './modules/search.js';
// 1. Import your notifications functions
import { fetchNotifications, setupNotificationListeners } from './modules/notifications.js';

let systemLoopInterval = null;

export function initApplicationEngine() {
    const registerLink = document.getElementById('toRegisterLink');
    if (registerLink) {
        registerLink.addEventListener('click', () => showAuthScreen('register'));
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', handleSignUp);
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    const notifBtn = document.getElementById('navNotificationsBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', async () => {
            setActiveDrawer('notifications');
            await fetchNotifications(); // 2. Fetch notifications when user clicks the bell icon
        });
    }

    const navSearch = document.getElementById('navSearch');
    if (navSearch) navSearch.addEventListener('click', () => setActiveDrawer('search'));

    const navPost = document.getElementById('navPost');
    if (navPost) navPost.addEventListener('click', () => setActiveDrawer('post'));

    const navChat = document.getElementById('navChat');
    if (navChat) navChat.addEventListener('click', () => setActiveDrawer('chat'));

    const navProfile = document.getElementById('navProfile');
    if (navProfile) {
        navProfile.addEventListener('click', () => {
            const profileDrawer = document.getElementById('profileDrawer');
            if (profileDrawer) profileDrawer.removeAttribute('data-viewing-external-id');
            setActiveDrawer('profile');
        });
    }

    setupStoryListeners();
    setupTimelineListeners();
    setupChatListeners();
    setupProfileListeners();
    setupSearchListeners();
    setupNotificationListeners(); // 3. Initialize notification real-time listeners on startup

    dbClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            loadProfileAndApp(session.user);
        } else {
            const authSection = document.getElementById('authSection');
            const appSection = document.getElementById('appSection');
            if (authSection) authSection.classList.remove('hidden');
            if (appSection) appSection.classList.add('hidden');
            clearInterval(systemLoopInterval);
            showAuthScreen('login');
        }
    });
}

export function setActiveDrawer(panel) {
    const panels = ['search', 'post', 'chat', 'profile', 'notifications'];
    
    const targetEl = document.getElementById(`${panel}Drawer`);
    if (!targetEl && panel !== '') return;

    const isTargetCurrentlyClosed = targetEl ? targetEl.classList.contains('hidden') : true;
    
    panels.forEach(p => {
        const el = document.getElementById(`${p}Drawer`);
        const nav = document.getElementById(`nav${p.charAt(0).toUpperCase() + p.slice(1)}`);
        
        if (el) el.classList.add('hidden');
        if (nav) nav.classList.remove('active');
    });

    const timelineWrapper = document.getElementById('homeTimelineWrapper');
    const highlightsWrapper = document.getElementById('highlightsArchiveWrapper');

    if (panel !== '' && isTargetCurrentlyClosed) {
        targetEl.classList.remove('hidden');
        
        const targetNav = document.getElementById(`nav${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
        if (targetNav) targetNav.classList.add('active');
        
        if (panel === 'search') {
            if (timelineWrapper) timelineWrapper.classList.remove('hidden');
            if (highlightsWrapper) highlightsWrapper.classList.remove('hidden');
        } else {
            if (timelineWrapper) timelineWrapper.classList.add('hidden');
            if (highlightsWrapper) highlightsWrapper.classList.add('hidden');
        }

        if (panel === 'notifications') {
            const unreadBadge = document.getElementById('unreadBadge');
            if (unreadBadge) {
                unreadBadge.innerText = '0';
                unreadBadge.classList.add('hidden');
            }
        }
        if (panel === 'chat') {
            const badge = document.getElementById('chatNotificationCount');
            if (badge) badge.classList.add('hidden');
            checkChatNotificationsAndHistory();
        }
        if (panel === 'profile') {
            if (!targetEl.hasAttribute('data-viewing-external-id')) {
                renderProfileDrawerData();
            }
        }
    } else {
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

export async function setViewingOtherProfile(targetUserProfile) {
    if (!targetUserProfile) return;
    
    const profileDrawer = document.getElementById('profileDrawer');
    if (!profileDrawer) return;

    profileDrawer.setAttribute('data-viewing-external-id', targetUserProfile.id);

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

    setActiveDrawer('profile');
}

function showAuthScreen(screen) {
    const loginCard = document.getElementById('loginCard');
    const registerCard = document.getElementById('registerCard');
    const toggleText = document.getElementById('toggleText');

    if (!loginCard || !registerCard || !toggleText) return;

    if (screen === 'register') {
        loginCard.classList.add('hidden');
        registerCard.classList.remove('hidden');
        toggleText.innerHTML = `Have an account? <span id="toLoginLink" style="cursor:pointer; color:#3b82f6;">Log In</span>`;
        
        const toLoginLink = document.getElementById('toLoginLink');
        if (toLoginLink) {
            toLoginLink.addEventListener('click', () => showAuthScreen('login'));
        }
    } else {
        registerCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
        toggleText.innerHTML = `Don't have an account? <span id="toRegisterLink" style="cursor:pointer; color:#3b82f6;">Sign up</span>`;
        
        const toRegisterLink = document.getElementById('toRegisterLink');
        if (toRegisterLink) {
            toRegisterLink.addEventListener('click', () => showAuthScreen('register'));
        }
    }
}

async function handleSignUp() {
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');
    const regUsername = document.getElementById('regUsername');

    if (!regEmail || !regPassword || !regUsername) return;

    const email = regEmail.value.trim();
    const password = regPassword.value;
    const username = regUsername.value.trim().replace('@', '').toLowerCase();

    if(!email || !password || !username) return alert("Fill in all boxes.");
    
    const { data, error } = await dbClient.auth.signUp({ email, password });
    if (error) return alert(error.message);

    const targetUser = data.user || (data.session ? data.session.user : null);
    
    if (targetUser) {
        const { error: profileError } = await dbClient.from('profiles').insert([
            { id: targetUser.id, username: username }
        ]);
        
        if (profileError) {
            console.error("Profile insertion error details:", profileError);
            return alert(`Database Error: ${profileError.message}`);
        }
        
        if (data.session) {
            return;
        }

        const { error: loginError } = await dbClient.auth.signInWithPassword({ email, password });
        if (loginError) {
            alert("Registration successful! Please log in.");
            showAuthScreen('login');
        }
    } else {
        alert("Sign up complete! Please check your email inbox to confirm registration link.");
    }
}

async function handleLogin() {
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');

    if (!loginEmail || !loginPassword) return;

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    const { error } = await dbClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
}

async function handleLogout() { 
    await dbClient.auth.signOut(); 
    location.reload(); 
}

async function loadProfileAndApp(user) {
    const authSection = document.getElementById('authSection');
    const appSection = document.getElementById('appSection');

    if (authSection) authSection.classList.add('hidden');
    if (appSection) appSection.classList.remove('hidden');
    
    const { data, error } = await dbClient.from('profiles').select('username').eq('id', user.id).maybeSingle();
    
    let userHandle = "user";
    if (data && data.username) {
        userHandle = data.username;
    } else if (user.email) {
        userHandle = user.email.split('@')[0].toLowerCase();
    }
    
    const profile = { username: userHandle };
    updateStateUser(user, profile);
    
    const welcomeMsg = document.getElementById('welcomeMsg');
    if (welcomeMsg) welcomeMsg.innerText = `@${profile.username}`;
    
    const initialLetters = profile.username.substring(0, 2).toUpperCase();
    const navProfileAvatar = document.getElementById('navProfileAvatar');
    const profileDetailAvatar = document.getElementById('profileDetailAvatar');
    const profileUsername = document.getElementById('profileUsername');

    if (navProfileAvatar) navProfileAvatar.innerText = initialLetters;
    if (profileDetailAvatar) profileDetailAvatar.innerText = initialLetters;
    if (profileUsername) profileUsername.innerText = `@${profile.username}`;
    
    fetchGlobalStories();
    fetchTimelineTweets();
    fetchNotifications(); // 4. Fetch initial notifications payload upon login session start

    runSystemSyncEngine();
    clearInterval(systemLoopInterval);
    systemLoopInterval = setInterval(runSystemSyncEngine, 3000);
}