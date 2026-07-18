import { dbClient, state } from './config.js';
import { setActiveDrawer } from './auth.js';

export function setupStoryListeners() {
    document.getElementById('submitStoryBtn').addEventListener('click', postStory);
    document.getElementById('closeStoryModalBtn').addEventListener('click', closeStory);
}

export async function fetchGlobalStories() {
    const { data: allStories } = await dbClient.from('stories').select('*').order('created_at', { ascending: false });
    if (!allStories) return;

    const activeTray = document.getElementById('activeStoriesTray');
    const highlightsTray = document.getElementById('highlightsTray');
    activeTray.innerHTML = ''; highlightsTray.innerHTML = '';

    const now = new Date().getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    allStories.forEach(story => {
        const storyTime = new Date(story.created_at).getTime();
        const bubble = document.createElement('div');
        bubble.className = "story-bubble";
        bubble.onclick = () => viewStory(story.content, story.username);
        
        const isImage = story.content.startsWith('http://') || story.content.startsWith('https://');
        const avatarContent = isImage ? `<img src="${story.content}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : story.username.substring(0,2).toUpperCase();

        bubble.innerHTML = `
            <div class="avatar">${avatarContent}</div>
            <div class="username-label">@${story.username}</div>
        `;

        if (now - storyTime < twentyFourHours) {
            activeTray.appendChild(bubble);
        } else {
            bubble.classList.add('highlight-bubble');
            highlightsTray.appendChild(bubble);
        }
    });
}

async function postStory() {
    const urlInput = document.getElementById('storyImgUrl');
    const capInput = document.getElementById('storyCaption');
    let finalContent = urlInput.value.trim() || capInput.value.trim();
    
    if(!finalContent) return alert("Please add an Image URL link or text description.");

    await dbClient.from('stories').insert([{ user_id: state.currentUser.id, username: state.currentProfile.username, content: finalContent }]);
    urlInput.value = ''; capInput.value = '';
    setActiveDrawer(''); 
    fetchGlobalStories();
}

function viewStory(content, author) {
    const container = document.getElementById('modalText');
    const isImage = content.startsWith('http://') || content.startsWith('https://');
    
    if (isImage) {
        container.innerHTML = `<h4 style="margin:5px;">@${author}</h4><img src="${content}">`;
    } else {
        container.innerHTML = `<span style="font-size:14px; color:#aaa; display:block;">@${author}</span><p>${content}</p>`;
    }
    document.getElementById('storyModal').classList.remove('hidden');
}

function closeStory() { 
    document.getElementById('storyModal').classList.add('hidden'); 
}