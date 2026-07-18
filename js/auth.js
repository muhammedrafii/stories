import { dbClient, updateStateUser, state } from './config.js';
import { fetchGlobalStories, setupStoryListeners } from './stories.js';
import { fetchTimelineTweets, setupTimelineListeners } from './timeline.js';
import { runSystemSyncEngine, setupChatListeners } from './chat.js';

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

    // Inject submodule event actions
    setupStoryListeners();
    setupTimelineListeners();
    setupChatListeners();

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
    const panels = ['search', 'post', 'chat'];
    panels.forEach(p => {
        const el = document.getElementById(`${p}Drawer`);
        const nav = document.getElementById(`nav${p.charAt(0).toUpperCase() + p.slice(1)}`);
        if (p === panel) {
            const isHidden = el.classList.contains('hidden');
            el.classList.toggle('hidden', !isHidden);
            nav.classList.toggle('active', isHidden);
            if(panel === 'chat' && isHidden) {
                document.getElementById('chatNotificationCount').classList.add('hidden');
            }
        } else {
            el.classList.add('hidden');
            nav.classList.remove('active');
        }
    });
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
    const { data, error } = await dbClient.auth.signUp({ email, password });
    if (error) return alert(error.message);

    if (data.user) {
        await dbClient.from('profiles').insert([{ id: data.user.id, username: username }]);
        alert("Registration successful! Log In now.");
        showAuthScreen('login');
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
    
    // Explicitly pull the profile row linked to the user's ID
    const { data, error } = await dbClient.from('profiles').select('username').eq('id', user.id).maybeSingle();
    
    // Fallback gracefully to email prefix if the custom username row isn't found
    let userHandle = "user";
    if (data && data.username) {
        userHandle = data.username;
    } else if (user.email) {
        userHandle = user.email.split('@')[0].toLowerCase();
    }
    
    const profile = { username: userHandle };
    updateStateUser(user, profile);
    
    document.getElementById('welcomeMsg').innerText = `@${profile.username}`;
    
    fetchGlobalStories();
    fetchTimelineTweets();

    // Run background intervals
    runSystemSyncEngine();
    clearInterval(systemLoopInterval);
    systemLoopInterval = setInterval(runSystemSyncEngine, 3000);
}