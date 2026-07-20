import { dbClient, state, updateStateUser } from '../config.js';

let typingTimer; 
const DEBOUNCE_DELAY = 500; 

export function setupProfileListeners() {
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleProfileUpdate);
    }

    const usernameInput = document.getElementById('profileUsernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('input', handleUsernameTyping);
    }
}

async function getCurrentUserId() {
    if (state && state.currentUser && state.currentUser.id) {
        return state.currentUser.id;
    }
    const { data } = await dbClient.auth.getUser();
    return data?.user?.id || null;
}

export async function renderProfileDrawerData() {
    const userId = await getCurrentUserId();
    if (!userId) return;

    try {
        const { data: profile, error } = await dbClient
            .from('profiles')
            .select('username, display_name, bio')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;

        const { data: authData } = await dbClient.auth.getUser();
        
        document.getElementById('profileEmail').value = authData?.user?.email || '';
        document.getElementById('profileDisplayName').value = profile?.display_name || '';
        document.getElementById('profileUsernameInput').value = profile?.username || '';
        document.getElementById('profileBio').value = profile?.bio || '';
        
        const saveBtn = document.getElementById('saveProfileBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Update Profile";
            saveBtn.style.background = "var(--accent)";
        }
    } catch (err) {
        console.error("Error hydrating profile drawer:", err.message);
    }
}

function handleUsernameTyping(e) {
    const saveBtn = document.getElementById('saveProfileBtn');
    const rawUsername = e.target.value.trim();
    const cleanUsername = rawUsername.replace('@', '').toLowerCase();
    
    clearTimeout(typingTimer);

    if (!cleanUsername) {
        saveBtn.disabled = true;
        saveBtn.innerText = "❌ Username cannot be blank";
        saveBtn.style.background = "#ef4444";
        return;
    }

    const usernameRegex = /^[a-zA-Z0-9_]*$/;
    if (!usernameRegex.test(cleanUsername)) {
        saveBtn.disabled = true;
        saveBtn.innerText = "❌ Invalid characters used";
        saveBtn.style.background = "#ef4444";
        return;
    }

    if (cleanUsername.length < 3) {
        saveBtn.disabled = true;
        saveBtn.innerText = "⚠️ Username too short (min 3)";
        saveBtn.style.background = "#f59e0b";
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerText = "🔍 Checking availability...";
    saveBtn.style.background = "var(--accent)";

    typingTimer = setTimeout(async () => {
        const userId = await getCurrentUserId();
        
        try {
            const { data: existingUser } = await dbClient
                .from('profiles')
                .select('id')
                .eq('username', cleanUsername)
                .neq('id', userId)
                .maybeSingle();

            if (existingUser) {
                saveBtn.disabled = true;
                saveBtn.innerText = "❌ Handle already taken";
                saveBtn.style.background = "#ef4444";
            } else {
                saveBtn.disabled = false;
                saveBtn.innerText = "✅ Available! Update Profile";
                saveBtn.style.background = "#22c55e"; 
            }
        } catch (err) {
            console.error("Live validation failed:", err.message);
        }
    }, DEBOUNCE_DELAY);
}

async function handleProfileUpdate() {
    const userId = await getCurrentUserId();
    if (!userId) return alert("Your session has expired.");

    const saveBtn = document.getElementById('saveProfileBtn');
    const displayName = document.getElementById('profileDisplayName').value.trim();
    const rawUsername = document.getElementById('profileUsernameInput').value.trim();
    const bio = document.getElementById('profileBio').value.trim();
    const cleanUsername = rawUsername.replace('@', '').toLowerCase();

    if (!cleanUsername) {
        alert("Username cannot be blank.");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving changes...";

    try {
        const { error: updateError } = await dbClient
            .from('profiles')
            .update({
                username: cleanUsername,
                display_name: displayName,
                bio: bio
            })
            .eq('id', userId);

        if (updateError) throw updateError;

        if (state && state.currentUser) {
            const updatedProfile = { 
                username: cleanUsername, 
                display_name: displayName, 
                bio: bio 
            };
            updateStateUser(state.currentUser, updatedProfile);
        }

        document.getElementById('welcomeMsg').innerText = `@${cleanUsername}`;
        document.getElementById('profileUsername').innerText = `@${cleanUsername}`;
        
        const initialLetters = cleanUsername.substring(0, 2).toUpperCase();
        document.getElementById('navProfileAvatar').innerText = initialLetters;
        document.getElementById('profileDetailAvatar').innerText = initialLetters;

        alert("Profile updated successfully!");
        
        saveBtn.innerText = "Update Profile";
        saveBtn.style.background = "var(--accent)";
    } catch (err) {
        alert(`Failed to save changes: ${err.message}`);
        saveBtn.disabled = false;
        saveBtn.innerText = "Update Profile";
    }
}