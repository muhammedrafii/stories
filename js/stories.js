import { dbClient, state } from './config.js';
import { setActiveDrawer } from './auth.js';

let activeLoadedStoriesList = [];
let currentViewingStoryIndex = -1;

export function setupStoryListeners() {
    document.getElementById('submitStoryBtn')?.addEventListener('click', postStory);
    document.getElementById('closeStoryModalBtn')?.addEventListener('click', closeStory);
    document.getElementById('sendStoryReplyBtn')?.addEventListener('click', submitStoryReply);
    
    // Story Delete Listener
    const deleteBtn = document.getElementById('deleteStoryBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteCurrentStory);
    }

    // Toggle Send button visibility dynamically as user types
    const replyInput = document.getElementById('storyReplyInput');
    const sendReplyBtn = document.getElementById('sendStoryReplyBtn');
    
    if (replyInput && sendReplyBtn) {
        sendReplyBtn.style.display = 'none';

        replyInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                sendReplyBtn.style.display = 'block';
            } else {
                sendReplyBtn.style.display = 'none';
            }
        });
    }
}

export async function fetchGlobalStories() {
    // Join profiles table to always retrieve the latest username
    const { data: allStories, error } = await dbClient
        .from('stories')
        .select(`
            *,
            profiles ( username )
        `)
        .order('created_at', { ascending: false });
        
    if (error || !allStories) return;

    // Fall back to story.username if profile join is null
    activeLoadedStoriesList = allStories.map(story => ({
        ...story,
        username: story.profiles?.username || story.username || 'user'
    }));

    const activeTray = document.getElementById('activeStoriesTray');
    const highlightsTray = document.getElementById('highlightsTray');
    
    if (!activeTray || !highlightsTray) return;

    const activeFragment = document.createDocumentFragment();
    const highlightsFragment = document.createDocumentFragment();

    const now = new Date().getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    activeLoadedStoriesList.forEach((story, index) => {
        const storyTime = new Date(story.created_at).getTime();
        const bubble = document.createElement('div');
        bubble.className = "story-bubble";
        bubble.onclick = () => launchStoryViewerAtIndex(index);
        
        const avatarContent = (story.username || 'U').substring(0, 2).toUpperCase();

        bubble.innerHTML = `
            <div class="avatar">${avatarContent}</div>
            <div class="username-label">@${story.username || 'user'}</div>
        `;

        if (now - storyTime < twentyFourHours) {
            activeFragment.appendChild(bubble);
        } else {
            bubble.classList.add('highlight-bubble');
            highlightsFragment.appendChild(bubble);
        }
    });

    activeTray.innerHTML = ''; 
    highlightsTray.innerHTML = '';
    activeTray.appendChild(activeFragment);
    highlightsTray.appendChild(highlightsFragment);
}

async function launchStoryViewerAtIndex(index) {
    if (index < 0 || index >= activeLoadedStoriesList.length) return;
    currentViewingStoryIndex = index;
    
    const story = activeLoadedStoriesList[index];
    const container = document.getElementById('modalText');
    if (!container) return;
    
    // Clear input and reset Send button
    const replyInput = document.getElementById('storyReplyInput');
    if (replyInput) replyInput.value = '';
    
    const sendReplyBtn = document.getElementById('sendStoryReplyBtn');
    if (sendReplyBtn) sendReplyBtn.style.display = 'none';

    let currentViewsArray = Array.isArray(story.viewed_by) ? [...story.viewed_by] : [];
    
    // Normalized Ownership Comparison
    const myId = state.currentUser?.id;
    const myUsername = state.currentProfile?.username ? state.currentProfile.username.toLowerCase().trim() : '';
    const storyUsername = story.username ? story.username.toLowerCase().trim() : '';

    const isOwnStory = Boolean(
        (myId && story.user_id && myId === story.user_id) ||
        (myUsername && storyUsername && myUsername === storyUsername)
    );

    // Toggle Delete Button Visibility
    const deleteBtn = document.getElementById('deleteStoryBtn');
    if (deleteBtn) {
        if (isOwnStory) {
            deleteBtn.classList.remove('hidden');
            deleteBtn.style.display = 'block'; // Force display override
        } else {
            deleteBtn.classList.add('hidden');
            deleteBtn.style.display = 'none';
        }
    }

    // 1. Record view if viewing someone else's story
    if (!isOwnStory && state.currentUser) {
        if (!currentViewsArray.some(viewer => viewer.id === state.currentUser.id)) {
            currentViewsArray.push({
                id: state.currentUser.id,
                username: state.currentProfile?.username || 'user'
            });
            story.viewed_by = currentViewsArray;
            
            await dbClient.from('stories').update({ viewed_by: currentViewsArray }).eq('id', story.id);
        }
    }

    // 2. Viewer details list for story author
    let trackingHTML = '';
    if (isOwnStory) {
        const totalViews = currentViewsArray.length;
        let viewersListHTML = '<span style="color:#aaa; font-size:11px;">No views yet</span>';
        
        if (totalViews > 0) {
            viewersListHTML = currentViewsArray
                .map(viewer => `<span style="background:rgba(255,255,255,0.1); padding:4px 10px; border-radius:12px; font-size:12px; color:#fff;">@${viewer.username || 'unknown'}</span>`)
                .join(' ');
        }

        trackingHTML = `
            <div style="text-align:center; margin-top:20px; width:100%; display:flex; flex-direction:column; gap:8px; align-items:center;">
                <div style="font-size:14px; color:#a3e635; font-weight:bold; letter-spacing:0.5px;">👁️ ${totalViews} ${totalViews === 1 ? 'view' : 'views'}</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; max-height:80px; overflow-y:auto; padding:5px; width:90%;">
                    ${viewersListHTML}
                </div>
            </div>
        `;
    }

    // 3. Update DOM
    container.innerHTML = `
        <span style="font-size:16px; color:#aaa; display:block; margin-bottom:12px;">@${story.username || 'user'}</span>
        <p style="font-size:24px; line-height:34px; color:#fff; font-weight:500; word-break:break-word; max-width:85%; margin:0 auto;">"${story.content}"</p>
        ${trackingHTML}
    `;

    const replyContainer = document.getElementById('storyReplyContainer');
    if (replyContainer) {
        if (isOwnStory) {
            replyContainer.classList.add('hidden');
        } else {
            replyContainer.classList.remove('hidden');
        }
    }

    document.getElementById('storyModal').classList.remove('hidden');
}

async function deleteCurrentStory() {
    if (currentViewingStoryIndex === -1) return;
    
    const targetStory = activeLoadedStoriesList[currentViewingStoryIndex];
    if (!targetStory || !state.currentUser) return;

    const confirmed = confirm("Are you sure you want to delete this story?");
    if (!confirmed) return;

    // Delete media from Storage if applicable
    if (targetStory.media_path) {
        await dbClient.storage
            .from('story_media')
            .remove([targetStory.media_path]);
    }

    // Delete record by story ID primary key
    const { error: dbError } = await dbClient
        .from('stories')
        .delete()
        .eq('id', targetStory.id);

    if (dbError) {
        alert("Could not delete story: " + dbError.message);
        return;
    }

    // Cleanup & Refresh
    closeStory();
    await fetchGlobalStories();
}

async function submitStoryReply() {
    if (currentViewingStoryIndex === -1) return;
    
    const targetStory = activeLoadedStoriesList[currentViewingStoryIndex];
    const replyText = document.getElementById('storyReplyInput').value.trim();
    
    if (!replyText) return;
    if (!state.currentProfile) return alert("Session profile data not ready.");

    const contextTag = `[Replied to your Story: "${targetStory.content.substring(0, 15)}..."]`;
    const finalMessagePayload = `${contextTag} ${replyText}`;

    const { error } = await dbClient.from('private_messages').insert([
        { 
            sender_id: state.currentUser.id,
            receiver_id: targetStory.user_id,
            sender_username: state.currentProfile.username, 
            receiver_username: targetStory.username, 
            message_text: finalMessagePayload 
        }
    ]);

    if (error) {
        alert("Could not send reply: " + error.message);
    } else {
        document.getElementById('storyReplyInput').value = '';
        const sendReplyBtn = document.getElementById('sendStoryReplyBtn');
        if (sendReplyBtn) sendReplyBtn.style.display = 'none';
        
        alert(`Reply delivered straight to @${targetStory.username}'s inbox!`);
        closeStory();
    }
}

async function postStory() {
    const capInput = document.getElementById('storyCaption');
    if (!capInput) return;
    
    let finalContent = capInput.value.trim();
    
    if (!finalContent) return alert("Please add a text description.");
    if (!state.currentUser) return alert("Session data not ready.");
    if (!state.currentProfile || !state.currentProfile.username) return alert("Profile session not loaded yet.");

    const { error } = await dbClient.from('stories').insert([{ 
        user_id: state.currentUser.id,
        username: state.currentProfile.username, 
        content: finalContent,
        viewed_by: []
    }]);
    
    if (error) {
        alert("Could not post story: " + error.message);
        return;
    }
    
    capInput.value = '';
    setActiveDrawer('post'); 
    fetchGlobalStories();
}

function closeStory() { 
    currentViewingStoryIndex = -1;
    const deleteBtn = document.getElementById('deleteStoryBtn');
    if (deleteBtn) {
        deleteBtn.classList.add('hidden');
        deleteBtn.style.display = 'none';
    }
    document.getElementById('storyModal').classList.add('hidden'); 
}